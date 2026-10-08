/**
 * Bewerbungslogik fuer Konten - reine Regeln, keine Firestore-/
 * Storage-/LLM-Zugriffe. Baut aus den bereits vorhandenen Bausteinen
 * (`getDocumentRequirements`, `angaben.ts`, `unterlagen.ts`) einen Plan fuer
 * die gefuehrte Bewerbung und prueft die Anfrage, ein Paket daraus zu bauen.
 *
 * Bewerberangaben verlassen den Server fuer das Formularfuellen nie: der
 * Browser schickt nur `pinstGuid`, gewaehlte Formular-/Ablage-`docId`s und die beiden Texte - der Server liest die Angaben selbst
 * aus `privat/angaben` und setzt sie hier ein.
 */
import { z } from "zod/v3";
import type { AngabeSchluessel, BewerbungsbogenFillValues } from "../fillBewerbungsbogen";
import type { BewerbungsbogenInfo, DocumentRequirementsResult } from "../mcp/tools/getDocumentRequirements";
import type { MappenDokument } from "../mappe/mappeTypen";
import { geburtsdatumLabel, type AngabenRecord } from "./angaben";
import { sichererDateiname, type UnterlageEintrag } from "./unterlagen";
import { type Pruefung } from "./kontoAnfragen";
import {
  abschnittAnhaenge,
  abschnittEinreichen,
  abschnittInformation,
  abschnittPlatzhalter,
  abschnittUnterschreiben,
  abschnittVonHand,
  abschnittVordrucke,
  ausweiskopieZeile,
  FUSS,
  keineUnterlagenliste,
  weitereAnhaenge,
  type OffenePlatzhalter,
  type VonHandFormular,
} from "../mappe/merkzettel";
import type { AusschreibungsAnhang } from "../mappe/anhangArt";
import { einreichenSchritte } from "../lib/einreichen";
import { AUSWEISKOPIE_HINWEIS, verlangtAusweiskopie } from "../mappe/ausweiskopie";
import { bewerbungsschlussZeile } from "../lib/bewerbungsschluss";

export const MAX_TEXT_ZEICHEN = 20_000;
export const MAX_PAKET_DATEIEN = 20;
export const MAX_PAKET_BYTES = 60 * 1024 * 1024;

/** Feldnamen in Alltagssprache - fuer Menschen lesbare Formularfeld-Bezeichnungen, keine Erklaerungen. */
const FELDNAME: Record<AngabeSchluessel, string> = {
  nachname: "Nachname",
  vorname: "Vorname",
  geburtsdatumLabel: "Geburtsdatum",
  telefon: "Telefon",
  email: "E-Mail",
  geburtsort: "Geburtsort",
  strasse: "Straße",
  plz: "Postleitzahl",
  ort: "Ort",
  staatsangehoerigkeit: "Staatsangehörigkeit",
  studienabschluss: "Studienabschluss",
  fuehrerschein: "Führerschein",
};

export interface FormularPlan {
  docId: string;
  titel: string;
  ausfuellbar: boolean;
  /** benoetigteAngaben minus gespeicherte (Feldnamen in Alltagssprache). Immer leer bei nicht ausfuellbaren Formularen. */
  fehlendeAngaben: string[];
  optionaleAngaben: string[];
}

export interface Bewerbungsplan {
  stelle: {
    pinstGuid: string;
    refCode: string;
    titel: string;
    /** Roh aus der Ausschreibung (`applicationEnd`), leer, wenn sie keines nennt. */
    bewerbungsschluss: string;
    /** Fertiger Wortlaut fuer die Anzeige, aus `bewerbungsschlussText` (lib/bewerbungsschluss.ts) - nie im Web nachbauen. */
    bewerbungsschlussText: string;
    aktiv: boolean;
  };
  /** Alle Boegen der Stelle; ausfuellbare zuerst (Reihenfolge aus getDocumentRequirements). */
  formulare: FormularPlan[];
  /** Aus getDocumentRequirements. */
  geforderteUnterlagen: string[];
  /** fuerDenBewerber-Texte aus hinweis/bogenHinweis, nur fuer Menschen - nurFuerDich landet hier nie. */
  hinweise: string[];
  ablage: { docId: string; art: string; dateiname: string }[];
  angabenVorhanden: boolean;
  /**
   * Vordrucke der Ausschreibung, die der Bewerber selbst
   * ausfuellt und unterschreibt (z. B. "Anlage 1 zum Bewerbungsbogen") - nie
   * im Paket ausgefuellt, aber ohne sie ist die Bewerbung unvollstaendig.
   */
  selbstAuszufuellen: { titel: string; downloadUrl: string }[];
  /** Der Einreichweg als ganze Saetze (lib/einreichen.ts) - nie im Web nachbauen. */
  einreichen: string[];
  /**
   * Nur wenn die Unterlagenliste eine Ausweiskopie verlangt:
   * der fertige Satz fuer die Paketseite, dass der Bewerber sie selbst beilegt
   * (wir nehmen keine entgegen, s. mappe/ausweiskopie.ts) - nie im Web nachbauen.
   */
  ausweiskopieHinweis?: string;
}

/**
 * Ob eine Angabe fuer ein Formular als vorhanden gilt. `geburtsdatumLabel`
 * (Formular-Feld) entspricht `geburtsdatum` (Konto-Feld, ISO). Staatsange-
 * hoerigkeit zaehlt nur mit Wert UND Einwilligungsvermerk (Art. 9 DSGVO) -
 * ohne Vermerk gilt sie fuer ein Formular, das sie verlangt, als fehlend.
 * `email` zaehlt auch mit dem Rueckfall aus der Konto-Auth-E-Mail als
 * vorhanden - DIESELBE Quelle wie `fuellwerteAus`s
 * `mailWert = a.email || email`, sonst wuerde der Plan "E-Mail fehlt" melden,
 * obwohl der Paketbau sie anschliessend klaglos einsetzt.
 */
function istAngabeVorhanden(schluessel: AngabeSchluessel, angaben: AngabenRecord | null, email?: string): boolean {
  if (schluessel === "geburtsdatumLabel") return Boolean(angaben?.angaben.geburtsdatum);
  if (schluessel === "staatsangehoerigkeit") {
    return Boolean(angaben?.angaben.staatsangehoerigkeit) && angaben?.einwilligungStaatsangehoerigkeit != null;
  }
  if (schluessel === "email") return Boolean(angaben?.angaben.email || email);
  return Boolean(angaben?.angaben[schluessel]);
}

/** "Bewerbungsbogen Seiteneinstieg und ROB.pdf" -> "Bewerbungsbogen Seiteneinstieg und ROB" - die Endung ist fuer den Anzeigenamen kein Mehrwert. */
function titelOhneDateiendung(attHeader: string): string {
  return attHeader.replace(/\.[A-Za-z0-9]{1,10}$/, "");
}

function formularPlan(bogen: BewerbungsbogenInfo, angaben: AngabenRecord | null, email?: string): FormularPlan {
  const benoetigt = bogen.ausfuellbar ? (bogen.benoetigteAngaben ?? []) : [];
  const optional = bogen.ausfuellbar ? (bogen.optionaleAngaben ?? []) : [];
  return {
    docId: bogen.docId,
    titel: titelOhneDateiendung(bogen.attHeader),
    ausfuellbar: bogen.ausfuellbar,
    fehlendeAngaben: benoetigt
      .filter((schluessel) => !istAngabeVorhanden(schluessel, angaben, email))
      .map((s) => FELDNAME[s]),
    optionaleAngaben: optional.map((s) => FELDNAME[s]),
  };
}

/**
 * `email`: Rueckfall aus der
 * Konto-Auth-E-Mail, dieselbe Quelle wie bei `fuellwerteAus` - ohne sie
 * meldet der Plan ein Formular als "E-Mail fehlt", obwohl der Paketbau die
 * Auth-Mail anschliessend einsetzt und das Formular tatsaechlich vollstaendig
 * fuellt. Optional, weil `kontoBewerbungsplan` sie nur hat, wenn der Nutzer
 * angemeldet ist (immer der Fall - der Endpunkt verlangt Anmeldung).
 */
export function baueBewerbungsplan(
  anforderungen: DocumentRequirementsResult,
  stelle: Bewerbungsplan["stelle"],
  angaben: AngabenRecord | null,
  ablage: UnterlageEintrag[],
  email?: string,
): Bewerbungsplan {
  const hinweise: string[] = [];
  if (anforderungen.hinweis?.fuerDenBewerber) hinweise.push(anforderungen.hinweis.fuerDenBewerber);
  if (anforderungen.bogenHinweis?.fuerDenBewerber) hinweise.push(anforderungen.bogenHinweis.fuerDenBewerber);
  if (anforderungen.vordruckHinweis?.fuerDenBewerber) hinweise.push(anforderungen.vordruckHinweis.fuerDenBewerber);

  return {
    stelle,
    formulare: anforderungen.bewerbungsboegen.map((bogen) => formularPlan(bogen, angaben, email)),
    geforderteUnterlagen: anforderungen.geforderteUnterlagen,
    hinweise,
    ablage: ablage.map((eintrag) => ({ docId: eintrag.docId, art: eintrag.art, dateiname: eintrag.dateiname })),
    angabenVorhanden: angaben !== null && Object.keys(angaben.angaben).length > 0,
    selbstAuszufuellen: (anforderungen.selbstAuszufuellen ?? []).map((vordruck) => ({
      titel: titelOhneDateiendung(vordruck.attHeader),
      downloadUrl: vordruck.downloadUrl,
    })),
    einreichen: einreichenSchritte(stelle.refCode),
    ...(verlangtAusweiskopie(anforderungen.geforderteUnterlagen) ? { ausweiskopieHinweis: AUSWEISKOPIE_HINWEIS } : {}),
  };
}

/** Feldnamen-Schluessel -> Alltagssprache, fuer Aufrufer ausserhalb dieser Datei (z.B. `kontoHttp.ts` fuer `fillBewerbungsbogen`s Rueckgabe `fehlendeAngaben`). */
export function feldnamenFuer(schluessel: AngabeSchluessel[]): string[] {
  return schluessel.map((s) => FELDNAME[s]);
}

/**
 * Angaben -> Werte fuer `fillBewerbungsbogen`. `email` ist der Rueckfall aus
 * dem Konto (Auth-E-Mail) - nur wenn die Angaben selbst kein E-Mail-Feld
 * gesetzt haben. Staatsangehoerigkeit wird nur eingesetzt, wenn gespeichert
 * UND Einwilligungsvermerk vorhanden ist. Fehlt eines der Pflichtfelder
 * (Nachname/Vorname/Geburtsdatum), kommt statt Werten die Liste der
 * fehlenden Feldnamen zurueck - kein teilweise gefuelltes Formular.
 */
export function fuellwerteAus(
  angaben: AngabenRecord | null,
  stelle: { refCode: string; titel: string },
  email: string | undefined,
): { werte: BewerbungsbogenFillValues } | { fehlend: string[] } {
  const a = angaben?.angaben ?? ({} as AngabenRecord["angaben"]);
  const fehlend: string[] = [];
  if (!a.nachname) fehlend.push(FELDNAME.nachname);
  if (!a.vorname) fehlend.push(FELDNAME.vorname);
  if (!a.geburtsdatum) fehlend.push(FELDNAME.geburtsdatumLabel);
  if (fehlend.length > 0) return { fehlend };

  const staatsangehoerigkeit =
    a.staatsangehoerigkeit && angaben?.einwilligungStaatsangehoerigkeit ? a.staatsangehoerigkeit : undefined;
  const mailWert = a.email || email;

  const werte: BewerbungsbogenFillValues = {
    nachname: a.nachname as string,
    vorname: a.vorname as string,
    geburtsdatumLabel: geburtsdatumLabel(a.geburtsdatum as string),
    ausschreibungId: stelle.refCode,
    ausschreibungTitel: stelle.titel,
    ...(a.telefon ? { telefon: a.telefon } : {}),
    ...(mailWert ? { email: mailWert } : {}),
    ...(a.geburtsort ? { geburtsort: a.geburtsort } : {}),
    ...(a.strasse ? { strasse: a.strasse } : {}),
    ...(a.plz ? { plz: a.plz } : {}),
    ...(a.ort ? { ort: a.ort } : {}),
    ...(staatsangehoerigkeit ? { staatsangehoerigkeit } : {}),
    ...(a.studienabschluss ? { studienabschluss: a.studienabschluss } : {}),
    ...(a.fuehrerschein ? { fuehrerschein: a.fuehrerschein } : {}),
  };
  return { werte };
}

const paketAnfrageSchema = z
  .object({
    formulare: z.array(z.string().min(1)).max(MAX_PAKET_DATEIEN),
    unterlagen: z.array(z.string().min(1)).max(MAX_PAKET_DATEIEN),
    anschreiben: z.string().max(MAX_TEXT_ZEICHEN).optional(),
    lebenslauf: z.string().max(MAX_TEXT_ZEICHEN).optional(),
    // Ausdrueckliche Bestaetigung, dass der Bewerber ein
    // Formular mit noch offenen (nicht-Kern-)Feldern selbst von Hand
    // ergaenzt - ohne sie blockiert `pruefeFormularLuecken` den Paketbau.
    luekenAkzeptiert: z.boolean().optional(),
  })
  .strict();

/**
 * Prueft eine Anfrage, ein Bewerbungspaket zu bauen: nur docIds aus dem Plan
 * (nur ausfuellbare Formulare, nur eigene Ablage-Eintraege), nur Texte bis
 * zur Zeichengrenze, nicht mehr Dateien als erlaubt.
 */
export function pruefePaketAnfrage(
  body: unknown,
  plan: Bewerbungsplan,
): Pruefung<{
  formulare: string[];
  unterlagen: string[];
  anschreiben?: string;
  lebenslauf?: string;
  luekenAkzeptiert: boolean;
}> {
  const r = paketAnfrageSchema.safeParse(body ?? {});
  if (!r.success) return { ok: false, fehler: "Die Anfrage hat ein ungültiges Format." };
  const { formulare, unterlagen, anschreiben, lebenslauf, luekenAkzeptiert } = r.data;

  // Dieselbe docId zweimal waere im gebauten Paket entweder eine doppelte Datei
  // oder (schlimmer) ein zweiter Fuellversuch desselben Formulars - beides ist
  // kein gueltiger Auftrag, sondern eine kaputte Anfrage.
  const hatDuplikate = (docIds: string[]) => new Set(docIds).size !== docIds.length;
  if (hatDuplikate(formulare) || hatDuplikate(unterlagen)) {
    return { ok: false, fehler: "Ein Formular oder eine Unterlage ist mehrfach angegeben." };
  }

  const ausfuellbareDocIds = new Set(plan.formulare.filter((f) => f.ausfuellbar).map((f) => f.docId));
  if (formulare.some((docId) => !ausfuellbareDocIds.has(docId))) {
    return {
      ok: false,
      fehler: "Eines der gewählten Formulare gehört nicht zu dieser Ausschreibung oder kann nicht ausgefüllt werden.",
    };
  }

  const ablageDocIds = new Set(plan.ablage.map((u) => u.docId));
  if (unterlagen.some((docId) => !ablageDocIds.has(docId))) {
    return { ok: false, fehler: "Eine der gewählten Unterlagen gehört nicht zu deinem Konto." };
  }

  const dateianzahl = formulare.length + unterlagen.length + (anschreiben ? 1 : 0) + (lebenslauf ? 1 : 0);
  if (dateianzahl > MAX_PAKET_DATEIEN) {
    return { ok: false, fehler: `Ein Paket nimmt höchstens ${MAX_PAKET_DATEIEN} Dateien.` };
  }

  return {
    ok: true,
    wert: {
      formulare,
      unterlagen,
      ...(anschreiben ? { anschreiben } : {}),
      ...(lebenslauf ? { lebenslauf } : {}),
      luekenAkzeptiert: luekenAkzeptiert === true,
    },
  };
}

/**
 * Die drei Kernfelder (Nachname/Vorname/Geburtsdatum, s. `fuellwerteAus`)
 * reichen nicht: ein gewaehltes Formular, das z.B. Postleitzahl oder (mit
 * Einwilligung) Staatsangehoerigkeit verlangt, wuerde sonst mit leeren
 * Pflichtfeldern gefuellt und das Paket trotzdem mit 200 ausgeliefert - ein
 * stiller Fehlschlag, der dem Bewerber nicht auffaellt.
 *
 * Liefert `null`, wenn kein gewaehltes Formular Luecken hat ODER der Bewerber
 * sie ausdruecklich akzeptiert hat (`luekenAkzeptiert`) - sonst einen
 * 400-Satz, ein Teilsatz je betroffenem Formular, mit den fehlenden
 * Feldnamen in Alltagssprache. Nimmt bewusst nur `{ titel, fehlendeAngaben }`
 * (keine ganzen `FormularPlan`s) - so laesst sich derselbe Helfer sowohl mit
 * der PLAN-Vorschau (vor jedem Download) als auch mit den ECHTEN, nach dem
 * Fuellen gemeldeten Luecken aus `fillBewerbungsbogen` aufrufen (s. kontoHttp.ts).
 */
export function pruefeFormularLuecken(
  formulare: { titel: string; fehlendeAngaben: string[] }[],
  luekenAkzeptiert: boolean,
): string | null {
  const mitLuecken = formulare.filter((f) => f.fehlendeAngaben.length > 0);
  if (mitLuecken.length === 0 || luekenAkzeptiert) return null;
  const saetze = mitLuecken.map((f) => `Für „${f.titel}" fehlen noch: ${f.fehlendeAngaben.join(", ")}.`);
  return `${saetze.join(" ")} Ergänze sie in „Meine Angaben" oder bestätige, dass du sie selbst von Hand einträgst.`;
}

/**
 * Ob eine geforderte Unterlage im Paket steckt, geprueft NUR ueber eine feste,
 * explizite Zuordnung - kein Wortstamm-/Aehnlichkeitsabgleich. Ein
 * Wortstamm-Treffer ("Zeugnis" in "Zeugniskopien") trifft auch umgekehrt, wo
 * keine inhaltliche Beziehung besteht, und eine
 * faelschlich als erledigt gemeldete Pflichtunterlage ist der teuerste Fehler,
 * den dieser Text machen kann: der Bewerber reicht sie dann gar nicht ein,
 * weil ihm niemand sagt, dass sie fehlt. Alles ausserhalb dieser drei
 * bekannten Kategorien bleibt deshalb IMMER ungewiss - nie "im Paket", auch
 * wenn zufaellig etwas Passendes dabei ist.
 */
function istImPaketAbgedeckt(
  anforderung: string,
  abgedeckt: { lebenslauf: boolean; zeugnis: boolean; anschreiben: boolean },
): boolean {
  const text = anforderung.toLowerCase();
  if (text.includes("lebenslauf")) return abgedeckt.lebenslauf;
  if (text.includes("zeugnis")) return abgedeckt.zeugnis; // deckt "Zeugnis"/"Zeugnisse"/"Zeugniskopien"
  if (text.includes("anschreiben") || text.includes("bewerbungsschreiben") || text.includes("motivationsschreiben")) {
    return abgedeckt.anschreiben;
  }
  return false;
}

/**
 * Baut den Merkzettel-Text fuer den Bewerber (Muster `wasNochZuTun`,
 * `mappe/paketVerzeichnis.ts`): eine Unterlagen-Checkliste, was er von Hand
 * unterschreiben muss, und der Einreichweg - OHNE eine Portal-URL zu
 * erfinden (es gibt kein Feld dafuer) und ohne einen
 * einzigen Feldwert des Bewerbers.
 *
 * `imPaket.formulare`/`imPaket.unterlagen` sind docIds aus `plan.formulare`
 * bzw. `plan.ablage` - Anzeigenamen und Art holt sich diese Funktion selbst
 * aus dem Plan, statt sie doppelt vom Aufrufer zu verlangen. `imPaket.texte`
 * traegt die festen Schluessel `"anschreiben"`/`"lebenslauf"` (dieselben wie
 * bei `pruefePaketAnfrage`s Rueckgabe), je nachdem welcher Text im Paket
 * steckt.
 *
 * `imPaket.vonHand`: je ausgefuelltem Formular die Felder, die der Bewerber
 * selbst eintragen muss - die, die wir nie fuellen, plus die ECHTEN, nach dem
 * Fuellen gemeldeten Luecken (`fillBewerbungsbogen`s `fehlendeAngaben`), nicht
 * die Plan-Vorschau. Nur Feldnamen, NIE Feldwerte (s. `vonHandZuErgaenzen`).
 *
 * `imPaket.platzhalter`: je Text die Platzhalter in eckigen
 * Klammern, die beim Paketbau noch drinstanden (s. lib/platzhalter.ts) - nur
 * die Namen, nie der Text.
 *
 * `ausschreibung`: alle Anhaenge der Stelle und ob ihr Text
 * die Bewerbung jederzeit zulaesst - fuer die Abschnitte, die dieser Zettel mit
 * dem der transienten Mappe teilt (s. mappe/merkzettel.ts). Mit
 * `downloadUrl`, damit Vordrucke wie "Anlage 1 zum Bewerbungsbogen"
 * verlinkt unter AUSFUELLEN UND UNTERSCHREIBEN stehen.
 *
 * `imPaket.zipNamen`: docId -> Dateiname im ZIP. Der Zettel nennt
 * "03_Bewerbungsbogen.pdf" statt nur "Bewerbungsbogen_Militärisch" - mit dem
 * Namen im ZIP findet der Bewerber die Datei, die er unterschreiben soll.
 */
export function merkzettel(
  plan: Bewerbungsplan,
  imPaket: {
    formulare: string[];
    unterlagen: string[];
    texte: string[];
    vonHand?: VonHandFormular[];
    platzhalter?: OffenePlatzhalter[];
    zipNamen?: Record<string, string>;
  },
  ansprechperson: string,
  ausschreibung: { anhaenge: AusschreibungsAnhang[]; bewerbungJederzeit: boolean },
): string {
  const formulareImPaket = plan.formulare
    .filter((f) => imPaket.formulare.includes(f.docId))
    .map((f) => {
      const zipName = imPaket.zipNamen?.[f.docId];
      return zipName ? `${zipName} (${f.titel})` : f.titel;
    });
  const artenImPaket = new Set(plan.ablage.filter((u) => imPaket.unterlagen.includes(u.docId)).map((u) => u.art));
  const texteImPaket = new Set(imPaket.texte);
  const abgedeckt = {
    lebenslauf: artenImPaket.has("lebenslauf") || texteImPaket.has("lebenslauf"),
    zeugnis: artenImPaket.has("zeugnis"),
    anschreiben: texteImPaket.has("anschreiben"),
  };

  const unterlagenBlock =
    plan.geforderteUnterlagen.length === 0
      ? `UNTERLAGEN\n${keineUnterlagenliste()}`
      : `UNTERLAGEN\n${plan.geforderteUnterlagen
          .map(
            (eintrag) =>
              `  - ${eintrag}: ${istImPaketAbgedeckt(eintrag, abgedeckt) ? "im Paket" : "prüf selbst, ob du das beigelegt hast"}`,
          )
          .join("\n")}`;
  // Wir nehmen keine Ausweiskopie entgegen - verlangt die
  // Ausschreibung eine, legt der Bewerber sie selbst bei.
  const ausweisZeile = ausweiskopieZeile(plan.geforderteUnterlagen);
  const unterlagenMitAusweis = ausweisZeile ? `${unterlagenBlock}\n${ausweisZeile}` : unterlagenBlock;

  const platzhalterBlock = abschnittPlatzhalter(imPaket.platzhalter ?? []);
  const vonHandBlock = abschnittVonHand(imPaket.vonHand ?? []);
  const aufgeteilt = weitereAnhaenge(ausschreibung.anhaenge, imPaket.formulare);
  const vordruckeBlock = abschnittVordrucke(aufgeteilt);
  const pruefenBlock = abschnittAnhaenge(aufgeteilt.pruefen.map((anhang) => anhang.attHeader));
  const informationBlock = abschnittInformation(aufgeteilt.information.map((anhang) => anhang.attHeader));

  return [
    `BEWERBUNG: ${plan.stelle.titel}`,
    `Kennung der Ausschreibung: ${plan.stelle.refCode}`,
    bewerbungsschlussZeile(plan.stelle.bewerbungsschluss, ausschreibung.bewerbungJederzeit),
    "",
    ...(platzhalterBlock ? [platzhalterBlock, ""] : []),
    abschnittUnterschreiben(formulareImPaket),
    "",
    ...(vordruckeBlock ? [vordruckeBlock, ""] : []),
    ...(vonHandBlock ? [vonHandBlock, ""] : []),
    unterlagenMitAusweis,
    "",
    ...(pruefenBlock ? [pruefenBlock, ""] : []),
    ...(informationBlock ? [informationBlock, ""] : []),
    abschnittEinreichen(plan.stelle.refCode, ansprechperson),
    "",
    ...FUSS,
  ].join("\n");
}

/**
 * Dateiname des ZIP-Pakets fuer den Bewerber (Content-Disposition, s.
 * kontoHttp.ts). `sichererDateiname` wirkt NUR auf `refCode`, nicht auf den
 * ganzen String - sonst wuerde ein Schraegstrich im refCode (den
 * `sichererDateiname` als Pfadtrenner deutet) den Anfangsteil "Bewerbung_"
 * verschlucken.
 */
export function paketDateiname(refCode: string): string {
  return `Bewerbung_${sichererDateiname(refCode)}.zip`;
}

/** Ein noch nicht durchnummeriertes Paket-Dokument - die Eingabe von `baueMappenDokumente`. */
export type PaketDokumentEingabe = Omit<MappenDokument, "hinzugefuegtAm">;

/**
 * Nummeriert eine Liste frisch zusammengestellter Paket-Dokumente durch
 * (`hinzugefuegtAm` = Einfuegereihenfolge) - reine Umwandlung in die Form, die
 * `baueZip`/`paketVerzeichnis` erwarten. Die eigentliche Sortierung nach Art
 * (Anschreiben vor Lebenslauf vor Zeugnis ...) passiert dort, nicht hier.
 */
export function baueMappenDokumente(eintraege: PaketDokumentEingabe[]): MappenDokument[] {
  return eintraege.map((eintrag, index) => ({ ...eintrag, hinzugefuegtAm: index }));
}

/**
 * Prueft Dateianzahl und Gesamtgroesse eines Pakets gegen die Grenzen
 * (`MAX_PAKET_DATEIEN`, `MAX_PAKET_BYTES`) - nimmt bewusst nur die blossen Groessen (keine ganzen Dokumente),
 * damit sie sich VOR dem Herunterladen grosser Dateien mit bereits bekannten
 * (Ablage-)/geschaetzten (Formular-Vorlage, Textlaenge) Groessen aufrufen
 * laesst, und danach ein zweites Mal mit den tatsaechlichen Groessen als
 * Sicherheitsnetz.
 */
export function pruefePaketGroesse(groessenBytes: number[]): Pruefung<true> {
  if (groessenBytes.length > MAX_PAKET_DATEIEN) {
    return { ok: false, fehler: `Ein Paket nimmt höchstens ${MAX_PAKET_DATEIEN} Dateien.` };
  }
  const summe = groessenBytes.reduce((summe, bytes) => summe + bytes, 0);
  if (summe > MAX_PAKET_BYTES) {
    return { ok: false, fehler: `Ein Paket darf höchstens ${MAX_PAKET_BYTES / 1024 / 1024} MB groß sein.` };
  }
  return { ok: true, wert: true };
}
