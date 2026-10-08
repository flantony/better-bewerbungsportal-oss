/**
 * Angaben, die ein Konto sich merkt ("gemerkte Angaben") - reine
 * Logik, keine Firestore-, Auth- oder LLM-Aufrufe. Feldwerte selbst werden nie
 * geloggt, nie an ein LLM gegeben und nie in einen Index/eine Dokument-ID
 * uebernommen.
 *
 * Die zwoelf Felder sind dieselben wie `ANGABEN_SCHLUESSEL`
 * (fillBewerbungsbogen.ts), nur dass hier `geburtsdatum` (ISO `YYYY-MM-DD`)
 * steht statt `geburtsdatumLabel` - die Formularschreibweise "TT.MM.JJJJ"
 * entsteht erst beim Fuellen (s. `geburtsdatumLabel` unten).
 */
import { z } from "zod/v3";
import { Timestamp } from "firebase-admin/firestore";
import { type Pruefung } from "./kontoAnfragen";

/** Version des Einwilligungstexts fuer die Staatsangehoerigkeit (Art. 9 Abs. 2 lit. a DSGVO). */
export const ANGABEN_TEXT_VERSION = "staatsangehoerigkeit-v1";

/**
 * Schema-Version der beiden Datensaetze `konten/{uid}/privat/angaben`
 * und `.../privat/dokumente` (DSFA.md, "Bewerberangaben und Unterlagen im
 * Konto") - wird bei jedem Schreiben mitgeschrieben.
 */
export const KONTO_ANGABEN_SCHEMA_VERSION = "konto-angaben-v1";

// Explizite Grenzen je Feld. Felder ohne eigene Vorgabe
// (geburtsort, ort, staatsangehoerigkeit, studienabschluss, fuehrerschein,
// email) bekommen dieselbe generische Grenze wie das Konto selbst
// (kontoTypen.ts, TEXT_MAX) - Datensparsamkeit statt unbegrenztem Text.
const TEXT_MAX = 100;
const STRASSE_MAX = 150;
const TELEFON_MAX = 40;

/**
 * Ein leerer String ist im Konto-Endpunkt kein ungueltiger Wert, sondern das
 * ausdrueckliche Signal "dieses Feld loeschen" (s. `naechsterAngabenStand`) -
 * jedes Feld muss ihn deshalb zusaetzlich zu seiner eigentlichen Form
 * akzeptieren, auch ein Feld mit eigenem Format (PLZ, E-Mail, Datum).
 */
const leerOder = <T extends z.ZodTypeAny>(schema: T) => z.union([z.literal(""), schema]).optional();

/**
 * Echtes Kalenderdatum, nicht nur das Regex-Format - "2024-02-30" besteht die
 * Regex, aber `Date.UTC` normalisiert einen solchen Tag auf den 1. Maerz;
 * genau dieses Auseinanderlaufen von Eingabe und normalisiertem Wert erkennt
 * die Rueckpruefung.
 */
function istEchtesDatum(iso: string): boolean {
  const teile = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!teile) return false;
  const [, jahrText, monatText, tagText] = teile;
  const jahr = Number(jahrText);
  const monat = Number(monatText);
  const tag = Number(tagText);
  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  return datum.getUTCFullYear() === jahr && datum.getUTCMonth() === monat - 1 && datum.getUTCDate() === tag;
}

export const angabenSchema = z
  .object({
    nachname: leerOder(z.string().min(1).max(TEXT_MAX)),
    vorname: leerOder(z.string().min(1).max(TEXT_MAX)),
    geburtsdatum: leerOder(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(istEchtesDatum, "Kein gültiges Datum")),
    telefon: leerOder(z.string().min(1).max(TELEFON_MAX)),
    email: leerOder(z.string().email().max(TEXT_MAX)),
    geburtsort: leerOder(z.string().min(1).max(TEXT_MAX)),
    strasse: leerOder(z.string().min(1).max(STRASSE_MAX)),
    plz: leerOder(z.string().regex(/^\d{5}$/)),
    ort: leerOder(z.string().min(1).max(TEXT_MAX)),
    staatsangehoerigkeit: leerOder(z.string().min(1).max(TEXT_MAX)),
    studienabschluss: leerOder(z.string().min(1).max(TEXT_MAX)),
    fuehrerschein: leerOder(z.string().min(1).max(TEXT_MAX)),
  })
  .strict();
export type Angaben = z.infer<typeof angabenSchema>;

export interface AngabenRecord {
  schemaVersion: string;
  angaben: Angaben;
  einwilligungStaatsangehoerigkeit: { erteiltAm: Timestamp; textVersion: string } | null;
  geaendertAm: Timestamp;
}

export interface AngabenSicht {
  angaben: Angaben;
  staatsangehoerigkeitEingewilligtAm: string | null;
}

const einwilligungSchema = z.object({ textVersion: z.literal(ANGABEN_TEXT_VERSION) }).strict();

// Die Feldwerte liegen flach im Request (wie ein Formular sie abschickt), die
// Einwilligung daneben als eigener Schluessel - nicht unter "angaben"
// verschachtelt.
const angabenAnfrageSchema = angabenSchema.extend({ einwilligung: einwilligungSchema.optional() }).strict();

/**
 * Anfrage pruefen: Feldwerte + optional `{ einwilligung: { textVersion } }`.
 *
 * `jetzt` wird injiziert (nicht `Date.now()` intern), damit "Geburtsdatum in
 * der Zukunft" ohne echte Uhr testbar ist - der zod-Schema selbst kennt keine
 * Uhrzeit, die Zukunftspruefung passiert deshalb hier, nach dem Parsen.
 *
 * Staatsangehoerigkeit ohne gueltige Einwilligung (bestehend, nicht
 * widerrufen - oder frisch in dieser Anfrage) -> Fehler. Wird das Feld auf ""
 * gesetzt (Entfernen), ist keine Einwilligung noetig - Entfernen ist kein
 * Erheben.
 */
export function pruefeAngabenAnfrage(
  body: unknown,
  bestehend: AngabenRecord | null,
  jetzt: number,
): Pruefung<{ angaben: Angaben; einwilligungNeu: boolean }> {
  const r = angabenAnfrageSchema.safeParse(body ?? {});
  if (!r.success) return { ok: false, fehler: "Eine der Angaben hat ein ungültiges Format." };
  const { einwilligung, ...angaben } = r.data;

  if (angaben.geburtsdatum) {
    const [jahrText, monatText, tagText] = angaben.geburtsdatum.split("-");
    const datumMs = Date.UTC(Number(jahrText), Number(monatText) - 1, Number(tagText));
    if (datumMs >= jetzt) return { ok: false, fehler: "Das Geburtsdatum darf nicht in der Zukunft liegen." };
  }

  if (angaben.staatsangehoerigkeit) {
    const bestehendeEinwilligung = bestehend?.einwilligungStaatsangehoerigkeit ?? null;
    if (!einwilligung && !bestehendeEinwilligung) {
      return {
        ok: false,
        fehler: "Die Staatsangehörigkeit kann nur mit deiner ausdrücklichen Einwilligung gespeichert werden.",
      };
    }
  }

  return { ok: true, wert: { angaben: angaben as Angaben, einwilligungNeu: einwilligung !== undefined } };
}

/**
 * Neuer Stand: die Feldwerte der Anfrage ersetzen die gespeicherten Feld fuer
 * Feld - ein leerer String entfernt ein Feld, ein nicht gesendetes Feld
 * bleibt unangetastet.
 *
 * `einwilligungNeu` setzt einen frischen Vermerk (aktuelle `jetzt`, aktuelle
 * `ANGABEN_TEXT_VERSION`); sonst bleibt ein bestehender Vermerk unveraendert
 * stehen - auch dann, wenn diese Anfrage `staatsangehoerigkeit` auf ""
 * setzt: das Entfernen des WERTES ist bewusst KEIN Widerruf der Einwilligung
 * (die Einwilligung bezieht sich auf das Erheben, nicht auf einen bestimmten
 * gespeicherten Wert). Ein Widerruf laeuft ausschliesslich ueber
 * `widerrufeStaatsangehoerigkeit`.
 */
export function naechsterAngabenStand(
  alt: AngabenRecord | null,
  anfrage: { angaben: Angaben; einwilligungNeu: boolean },
  jetzt: number,
): AngabenRecord {
  const neueAngaben: Record<string, string> = { ...(alt?.angaben ?? {}) };
  for (const [feld, wert] of Object.entries(anfrage.angaben)) {
    if (wert === undefined) continue; // nicht gesendet -> bleibt
    if (wert === "") delete neueAngaben[feld]; // leer -> entfernen
    else neueAngaben[feld] = wert;
  }

  const bestehendeEinwilligung = alt?.einwilligungStaatsangehoerigkeit ?? null;
  const einwilligungStaatsangehoerigkeit = anfrage.einwilligungNeu
    ? { erteiltAm: Timestamp.fromMillis(jetzt), textVersion: ANGABEN_TEXT_VERSION }
    : bestehendeEinwilligung;

  return {
    schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
    angaben: neueAngaben as Angaben,
    einwilligungStaatsangehoerigkeit,
    geaendertAm: Timestamp.fromMillis(jetzt),
  };
}

/**
 * Widerruf: Feld UND Einwilligungsvermerk verschwinden sofort - anders als
 * das blosse Entfernen des Wertes ueber `naechsterAngabenStand` (dort bleibt
 * der Vermerk bestehen, s. Kommentar dort). Kein `jetzt`-Parameter:
 * `geaendertAm` bleibt unangetastet, der Widerruf
 * selbst ist kein neuer Angaben-Stand, den ein spaeterer Aufrufer zeitlich
 * verorten muesste.
 */
export function widerrufeStaatsangehoerigkeit(alt: AngabenRecord): AngabenRecord {
  const { staatsangehoerigkeit: _entfernt, ...rest } = alt.angaben;
  return {
    schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
    angaben: rest,
    einwilligungStaatsangehoerigkeit: null,
    geaendertAm: alt.geaendertAm,
  };
}

/** "1998-03-12" -> "12.03.1998" - die Schreibweise, die der Bewerbungsbogen erwartet. */
export function geburtsdatumLabel(isoDatum: string): string {
  const [jahr, monat, tag] = isoDatum.split("-");
  return `${tag}.${monat}.${jahr}`;
}

/**
 * Baut die Sicht fuer `kontoAngabenLaden`/`kontoAngabenSpeichern` - reine
 * Umwandlung, kein Firestore-Zugriff. `null` (noch nichts gespeichert) wird
 * zu leeren Angaben ohne Einwilligungsvermerk, nicht zu einem Fehler: "leer,
 * wenn nichts gespeichert" ist der ausdrueckliche Vertrag des Endpunkts.
 */
export function angabenSicht(record: AngabenRecord | null): AngabenSicht {
  return {
    angaben: record?.angaben ?? ({} as Angaben),
    staatsangehoerigkeitEingewilligtAm: record?.einwilligungStaatsangehoerigkeit
      ? record.einwilligungStaatsangehoerigkeit.erteiltAm.toDate().toISOString()
      : null,
  };
}

/**
 * Wie `angabenSicht`, aber fuer `kontoExport`: der
 * Export traegt zusaetzlich die Versionskennung des Einwilligungstexts neben
 * dem Zeitpunkt - Art. 15 DSGVO ("welche Angaben genau wurden verarbeitet")
 * ist ohne die Textversion nur die Haelfte der Auskunft, falls der Text je
 * geaendert wird (`ANGABEN_TEXT_VERSION`). Bewusst NICHT Teil von
 * `AngabenSicht`/`angabenSicht` selbst: `kontoAngabenLaden`/-`Speichern`
 * brauchen das nicht, und eine zusaetzliche Versionskennung dort waere eine
 * Vertragsaenderung ohne Anlass.
 */
export interface AngabenExportSicht extends AngabenSicht {
  staatsangehoerigkeitTextVersion: string | null;
}

export function angabenExportSicht(record: AngabenRecord | null): AngabenExportSicht {
  return {
    ...angabenSicht(record),
    staatsangehoerigkeitTextVersion: record?.einwilligungStaatsangehoerigkeit?.textVersion ?? null,
  };
}
