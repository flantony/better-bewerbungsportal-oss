/**
 * Einstiegsweg einer Ausschreibung, abgeleitet aus dem Kennzeichen (refCode).
 *
 * WARUM NICHT AUS DEM TEXT: Die `SE_`-Ausschreibungen enthalten das Wort
 * "Seiteneinstieg" fast nie im Volltext. Die KI-Extraktion liefert dort
 * folgerichtig "unklar" - gefragt ist, ob die Stelle *ausdruecklich* als
 * Seiteneinstieg ausgeschrieben ist, und der Text sagt dazu nichts. Das Signal
 * steht nicht im Text, sondern im Kennzeichen. Keine bessere Extraktion kann
 * das aufholen.
 *
 * DEUTUNG der Praefixe:
 *  - `ROB-`: die Volltexte enthalten sowohl "Reserveoffizier" als auch
 *            "ausserhalb des Wehrdienstes".
 *  - `SE_`:  durchgaengig Seiteneinstiegs-Verfahren, u.a. die
 *            Facharzt-Ausschreibungen (`SE_HUM_FA_*`); der zugehoerige Anhang
 *            heisst "Bewerbungsbogen Seiteneinstieg und ROB"
 *            (s. `mcp/lib/identifyBewerbungsbogen.ts`, Familie
 *            `seiteneinstieg-rob`).
 *  - `WE_`:  Wiedereinstellung ehemaliger Soldatinnen und Soldaten.
 *
 * NICHT VERWENDBAR ist `reqType`: die Praefix-Stellen tragen `K55`
 * ("Militaerische Laufbahnen"), nicht `K80` ("Reservedienst"). Ein Filter auf
 * die "Art der Stelle" faende die Reserveoffiziersstellen gerade nicht.
 *
 * VORBEHALT: `ROB-` ruht auf wenigen Stellen. Die Ableitung ist trotzdem
 * vertretbar, weil deren Volltexte woertlich "Laufbahn der Offiziere der
 * Reserve ausserhalb des Wehrdienstes" enthalten - eine Fehldeutung ist damit
 * praktisch ausgeschlossen. Kommen weitere Praefixe auf, hier ergaenzen.
 */

/** `""` = kein besonderer Einstiegsweg erkennbar (der Normalfall). */
export type Einstiegsweg = "" | "reserveoffizier" | "seiteneinstieg" | "wiedereinstellung";

/**
 * Reihenfolge ist bedeutsam: `ROB` wird vor `SE`/`WE` geprueft, damit ein
 * kuenftiges `SE_ROB_...` nicht als reiner Seiteneinstieg durchgeht.
 */
const REGELN: { praefix: string; weg: Exclude<Einstiegsweg, ""> }[] = [
  { praefix: "ROB-", weg: "reserveoffizier" },
  { praefix: "ROB_", weg: "reserveoffizier" },
  { praefix: "SE_", weg: "seiteneinstieg" },
  { praefix: "WE_", weg: "wiedereinstellung" },
];

export function einstiegswegAus(refCode: string): Einstiegsweg {
  const normalisiert = (refCode ?? "").trim().toUpperCase();
  if (!normalisiert) return "";
  return REGELN.find((regel) => normalisiert.startsWith(regel.praefix))?.weg ?? "";
}

/**
 * Klartext je Wert - geht als `bedeutung` mit an KI-Clients, damit niemand
 * "Reserveoffizier" oder "Wiedereinstellung" aus dem eigenen Wissen erklaert.
 */
export const EINSTIEGSWEG_BEDEUTUNG: Record<Exclude<Einstiegsweg, "">, string> = {
  reserveoffizier:
    "reserve officer track: service alongside a civilian job, outside regular military service (\"ausserhalb des Wehrdienstes\")",
  seiteneinstieg:
    "lateral entry for people already qualified in a civilian profession - the professional qualification replaces the usual career path",
  wiedereinstellung:
    "re-entry for people who already served in the Bundeswehr and are returning",
};

/**
 * Deutsche Fassung fuers Web-Formular (Konto-Suchprofil); die englische oben
 * bleibt fuer den MCP. Belegt aus dem Kopfkommentar dieser Datei: ROB- aus dem
 * woertlichen Volltext, WE_ aus der Deutung des Praefixes. Seiteneinstieg ist
 * der Satz der englischen Fassung auf Deutsch - der Kopfkommentar belegt nur,
 * DASS es Seiteneinstiegsverfahren sind, nicht mehr.
 */
export const EINSTIEGSWEG_BEDEUTUNG_DE: Record<Exclude<Einstiegsweg, "">, string> = {
  reserveoffizier: "Laufbahn der Offiziere der Reserve außerhalb des Wehrdienstes.",
  seiteneinstieg: "Eine zivile Berufsqualifikation ersetzt den üblichen Laufbahnweg.",
  wiedereinstellung: "Wiedereinstellung ehemaliger Soldatinnen und Soldaten.",
};

export function einstiegswegBedeutung(weg: string): string {
  return EINSTIEGSWEG_BEDEUTUNG[weg as Exclude<Einstiegsweg, "">] ?? "";
}

/** Sprechende Werte fuer das MCP-Eingabeschema. */
export const EINSTIEGSWEG_WERTE = ["reserveoffizier", "seiteneinstieg", "wiedereinstellung"] as const;
