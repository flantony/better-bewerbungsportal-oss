import { z } from "zod/v3";
import { SUCHPROFIL_NAME_MAX, SUCHPROFIL_QUELLEN, SUCHPROFILE_MAX, suchprofilSchema } from "./kontoTypen";
import type { NeuerFilter, SuchprofilAenderung } from "./suchprofile";

export type Pruefung<T> = { ok: true; wert: T } | { ok: false; fehler: string };

// Nur Buchstaben und Ziffern (kein "/" oder ".", verhindert Pfad-Tricks). Hoechstens
// 64 Zeichen. Die echten IDs sind ~32 Hexzeichen, aber wir binden die Laenge bewusst
// nicht: ein Formatwechsel in der API darf Benutzer nicht lockout. Unbekannte IDs
// lehnt der Store spaeter mit "stelle-unbekannt" ab.
const PINST_GUID = z.string().regex(/^[A-Za-z0-9]{1,64}$/);

// Die Filter-Kennung erzeugt der Server (suchprofile.ts) - hier nur die Form.
const SUCHPROFIL_ID = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
// Ein frei gewaehlter Anzeigename - getrimmt, ohne Steuerzeichen.
const SUCHPROFIL_NAME = z.string().trim().max(SUCHPROFIL_NAME_MAX).regex(/^[^\p{Cc}]*$/u);
const neuerFilter = z
  .object({
    filter: suchprofilSchema,
    name: SUCHPROFIL_NAME.optional(),
    quelle: z.enum(SUCHPROFIL_QUELLEN).default("hand"),
  })
  .strict();
const suchprofileAnfrage = z.discriminatedUnion("aktion", [
  z.object({ aktion: z.literal("hinzufuegen"), suchprofile: z.array(neuerFilter).min(1).max(SUCHPROFILE_MAX) }).strict(),
  z
    .object({
      aktion: z.literal("aendern"),
      id: SUCHPROFIL_ID,
      filter: suchprofilSchema.optional(),
      name: SUCHPROFIL_NAME.optional(),
      aktiv: z.boolean().optional(),
    })
    .strict(),
  z.object({ aktion: z.literal("loeschen"), id: SUCHPROFIL_ID }).strict(),
]);
const merklistenAnfrage = z
  .object({ pinstGuid: PINST_GUID, aktion: z.enum(["merken", "vergessen"]) })
  .strict();
const loeschAnfrage = z.object({ bestaetigung: z.literal("LOESCHEN") }).strict();
const benachrichtigungAnfrage = z.object({ aktiv: z.boolean() }).strict();

// uid und Abbestell-Token kommen aus einer Mail-URL, nicht angemeldet - hoechstens
// 128 Zeichen, nur Buchstaben/Ziffern/"-"/"_" (kein Pfad- oder Firestore-Trick).
// Die Pruefung passiert VOR jedem Firestore-Zugriff (s. kontoHttp.ts).
const ABBESTELL_PARAMETER = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

export type SuchprofileAnfrage =
  | { aktion: "hinzufuegen"; suchprofile: NeuerFilter[] }
  | { aktion: "aendern"; id: string; aenderung: SuchprofilAenderung }
  | { aktion: "loeschen"; id: string };

const FILTER_UNBEKANNT = "Der Filter enthält einen Wert, den wir nicht kennen.";

/**
 * `kontoSuchprofileAendern`: genau eine von drei Aktionen je Aufruf. Die
 * Fehlermeldung nennt, was sich der Bewerber merken kann (Name zu lang, zu
 * viele Filter auf einmal), sonst einen allgemeinen Satz - nie den
 * abgelehnten Wert selbst.
 */
export function pruefeSuchprofileAnfrage(body: unknown): Pruefung<SuchprofileAnfrage> {
  const r = suchprofileAnfrage.safeParse(body ?? {});
  if (!r.success) {
    const nameFehler = r.error.issues.filter((issue) => issue.path.includes("name"));
    if (nameFehler.some((issue) => issue.code === "too_big")) {
      return { ok: false, fehler: `Der Name darf höchstens ${SUCHPROFIL_NAME_MAX} Zeichen lang sein.` };
    }
    if (nameFehler.length > 0) {
      return { ok: false, fehler: "Der Name enthält ein Zeichen, das wir nicht speichern können." };
    }
    if (r.error.issues.some((issue) => issue.code === "too_big" && issue.path.length === 1 && issue.path[0] === "suchprofile")) {
      return { ok: false, fehler: `Du kannst höchstens ${SUCHPROFILE_MAX} Filter speichern.` };
    }
    return { ok: false, fehler: FILTER_UNBEKANNT };
  }
  const anfrage = r.data;
  if (anfrage.aktion === "hinzufuegen") {
    return {
      ok: true,
      wert: {
        aktion: "hinzufuegen",
        // Ein leerer Name ist kein Name - nicht als "" speichern.
        suchprofile: anfrage.suchprofile.map(({ filter, name, quelle }) => ({ filter, quelle, ...(name ? { name } : {}) })),
      },
    };
  }
  if (anfrage.aktion === "loeschen") return { ok: true, wert: { aktion: "loeschen", id: anfrage.id } };
  const { aktion: _aktion, id, ...aenderung } = anfrage;
  if (aenderung.filter === undefined && aenderung.name === undefined && aenderung.aktiv === undefined) {
    return { ok: false, fehler: "Es fehlt, was sich an dem Filter ändern soll." };
  }
  return { ok: true, wert: { aktion: "aendern", id, aenderung } };
}

/** Kennung eines gespeicherten Filters aus dem Query-String (`kontoSuchprofilTreffer`). */
export function pruefeSuchprofilIdAbfrage(wert: unknown): Pruefung<string> {
  const r = SUCHPROFIL_ID.safeParse(wert);
  return r.success ? { ok: true, wert: r.data } : { ok: false, fehler: "Diesen Filter können wir nicht zuordnen." };
}

/**
 * Reine Formpruefung eines `pinstGuid`-Query-/Body-Parameters
 * (`kontoBewerbungsplan`/`kontoBewerbungspaketBauen`) - derselbe Regex wie in
 * `merklistenAnfrage`, hier separat exportiert, weil beide Endpunkte die
 * Kennung isoliert (ohne die uebrigen Merklisten-Felder) brauchen.
 */
export function pruefePinstGuidAbfrage(wert: unknown): Pruefung<string> {
  const r = PINST_GUID.safeParse(wert);
  return r.success ? { ok: true, wert: r.data } : { ok: false, fehler: "Diese Stelle können wir nicht zuordnen." };
}

export function pruefeMerklistenAnfrage(
  body: unknown,
): Pruefung<{ pinstGuid: string; aktion: "merken" | "vergessen" }> {
  const r = merklistenAnfrage.safeParse(body ?? {});
  return r.success ? { ok: true, wert: r.data } : { ok: false, fehler: "Diese Stelle können wir nicht zuordnen." };
}

export function pruefeLoeschAnfrage(body: unknown): Pruefung<true> {
  return loeschAnfrage.safeParse(body ?? {}).success
    ? { ok: true, wert: true }
    : { ok: false, fehler: "Bitte bestätige das Löschen ausdrücklich." };
}

export function pruefeBenachrichtigungsAnfrage(body: unknown): Pruefung<{ aktiv: boolean }> {
  const r = benachrichtigungAnfrage.safeParse(body ?? {});
  return r.success
    ? { ok: true, wert: r.data }
    : { ok: false, fehler: "Bitte gib an, ob Benachrichtigungen an oder aus sein sollen." };
}

/**
 * Reine Formpruefung der Abbestell-Query-Parameter (`k` = uid, `t` = Token) -
 * VOR jedem Firestore-Lesezugriff, damit ein Angreifer mit absichtlich
 * kaputten Werten nicht kostenlos Lesevorgaenge ausloest. Ob uid und Token
 * tatsaechlich zusammenpassen, prueft erst der Store (`tokenPasst`).
 */
export function pruefeAbbestellParameter(k: unknown, t: unknown): Pruefung<{ uid: string; token: string }> {
  const kR = ABBESTELL_PARAMETER.safeParse(k);
  const tR = ABBESTELL_PARAMETER.safeParse(t);
  return kR.success && tR.success
    ? { ok: true, wert: { uid: kR.data, token: tR.data } }
    : { ok: false, fehler: "Dieser Link ist nicht mehr gültig." };
}

/**
 * Erkennt den automatischen RFC-8058-One-Click-POST eines Mail-Anbieters:
 * dessen Body ist GENAU `List-Unsubscribe=One-Click`
 * mit Content-Type `application/x-www-form-urlencoded`. Der Content-Type
 * allein unterscheidet das NICHT vom Browser-Formular auf der
 * Bestaetigungsseite - ein `<form method="post">` ohne eigenes `enctype`
 * sendet denselben Content-Type, aber (ohne Formularfelder) einen leeren
 * Body. Erst der tatsaechliche Inhalt trennt beide Faelle.
 */
export function istOneClickAnfrage(contentType: string | undefined, body: unknown): boolean {
  if (!contentType?.toLowerCase().includes("application/x-www-form-urlencoded")) return false;
  if (typeof body !== "object" || body === null) return false;
  const eintraege = Object.entries(body as Record<string, unknown>);
  return eintraege.length === 1 && eintraege[0][0] === "List-Unsubscribe" && eintraege[0][1] === "One-Click";
}
