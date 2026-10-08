// Übersetzt die SAP-Codes aus `lib/onboardingOptions.ts` in sprechende Namen
// für MCP-Clients. Ein Modell soll "Marine" schreiben können und nicht "0004"
// raten müssen - die Codes bleiben aber die einzige Quelle der Wahrheit und
// werden hier nur umbenannt, damit sie nicht auseinanderlaufen können.

import { LAUFBAHNGRUPPE_OPTIONS, ORGANISATIONSBEREICH_OPTIONS } from "../../lib/onboardingOptions";

/**
 * Nur für LAUFBAHNGRUPPEN-Codes, deren Label als Tool-Parameter unhandlich wäre
 * (Gender-Schreibweise, "(m/w/d)"-Suffixe). Alles andere übernimmt das Label.
 *
 * ACHTUNG - diese Tabelle gilt AUSSCHLIESSLICH für Laufbahngruppen. Die beiden
 * Optionslisten verwenden denselben Coderaum: "0005" ist als Laufbahngruppe
 * "Mannschaften", als Organisationsbereich aber der Zentrale Sanitätsdienst.
 * Auf die Organisationsbereiche angewendet, hießen dort vier Bereiche nach
 * Laufbahngruppen - "Zentraler Sanitätsdienst der Bundeswehr",
 * "Bundeswehrverwaltung", "Ausrüstung, Informationstechnik und Nutzung" und
 * "Personal" wären über `list_jobs` gar nicht auswählbar, und stattdessen
 * stünde "Mannschaften" in der Liste der Teilstreitkräfte.
 */
export const READABLE_LAUFBAHNGRUPPE_BY_CODE: Record<string, string> = {
  "0005": "Mannschaften",
  "0007": "Unteroffiziere",
  "0008": "Feldwebel",
  "0009": "Offiziere",
};

function buildNameToCode(
  options: { value: string; label: string }[],
  umbenennungen: Record<string, string> = {},
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const option of options) {
    map[umbenennungen[option.value] ?? option.label] = option.value;
  }
  return map;
}

export const ORGANISATIONSBEREICH_BY_NAME = buildNameToCode(ORGANISATIONSBEREICH_OPTIONS);
export const LAUFBAHNGRUPPE_BY_NAME = buildNameToCode(
  LAUFBAHNGRUPPE_OPTIONS,
  READABLE_LAUFBAHNGRUPPE_BY_CODE,
);

export const ORGANISATIONSBEREICH_NAMES = Object.keys(ORGANISATIONSBEREICH_BY_NAME) as [string, ...string[]];
export const LAUFBAHNGRUPPE_NAMES = Object.keys(LAUFBAHNGRUPPE_BY_NAME) as [string, ...string[]];

/**
 * Ein Satz Klartext je Laufbahngruppe - wird mit den Trefferzahlen ausgeliefert.
 *
 * WARUM MITGELIEFERT statt nachschlagen lassen: genau hier erfinden
 * schwaechere Modelle. Sie bekommen "Mittlerer Dienst", "Andere" und
 * "Unteroffiziere" als Facettenwerte zurueck, muessen sie dem Bewerber
 * erklaeren, haben kein Wort dazu und greifen auf ihr Trainingswissen zurueck -
 * "Andere" wird dann etwa zu "technische Spezialisierungen", was schlicht
 * falsch ist. Das Werkzeug `erklaere_begriff` kennen sie, benutzen es aber oft
 * nicht.
 *
 * Eine Bitte in der Beschreibung ("bitte nachschlagen") ignorieren solche
 * Modelle genauso. Die Bedeutung mitzuschicken macht aus einer Erinnerung eine
 * Zusicherung. NUR fuer Laufbahngruppen: "Marine" oder "unbefristet"
 * erklaeren sich selbst, die Laufbahngruppe ist der undurchsichtige Teil.
 *
 * Kurz halten - das geht bei jedem `zaehle_treffer` mit ueber die Leitung.
 * Ausfuehrlich steht es in der Resource `bw://wissen/laufbahnen`.
 */
export const LAUFBAHNGRUPPE_BEDEUTUNG: Record<string, string> = {
  Mannschaften: "military, entry level: no school leaving certificate required",
  Unteroffiziere: "military NCO: at least a Hauptschulabschluss (lowest German secondary certificate)",
  Feldwebel:
    "military senior NCO: Hauptschulabschluss plus completed vocational training, or a Realschulabschluss (mid-level certificate)",
  Offiziere: "military officer, leadership track: needs Abitur or Fachhochschulreife (university entrance level)",
  "Einfacher Dienst": "civil service, entry level",
  "Mittlerer Dienst": "civil service, mid level",
  "Gehobener Dienst": "civil service, upper level: usually a bachelor's degree",
  "Höherer Dienst": "civil service, highest level: usually a master's degree",
  // Sammelposten der Rohdaten. Ehrlich benennen, sonst erfindet ein Modell hier etwas.
  Andere:
    "catch-all bucket in the source data, NOT a career group of its own - what applies is stated in the posting itself, so do not describe it as anything more specific",
};

/**
 * Deutsche Fassung fuers Web-Formular (Konto-Suchprofil). Die englische oben
 * ist an KI-Clients gerichtet und bleibt fuer den MCP unveraendert.
 *
 * JEDER Satz ist aus `mcp/knowledge/laufbahnen.ts` belegt - militaerisch aus
 * der Spalte "Schulabschluss", zivil aus dem Abschnitt "Zivile Laufbahnen".
 * Wo die Seite nichts sagt (einfacher, mittlerer Dienst), bleibt der Text leer:
 * lieber keine Erklaerung als eine selbst formulierte. Gleiche Schluessel wie
 * die englische Fassung (Test).
 */
export const LAUFBAHNGRUPPE_BEDEUTUNG_DE: Record<string, string> = {
  Mannschaften: "Voraussetzung meist: kein Abschluss nötig, Schulpflicht erfüllt.",
  Unteroffiziere: "Voraussetzung meist: mindestens Hauptschulabschluss.",
  Feldwebel:
    "Voraussetzung meist: Hauptschulabschluss mit abgeschlossener Berufsausbildung oder Realschulabschluss.",
  Offiziere: "Voraussetzung meist: Fachhochschulreife oder Abitur.",
  "Einfacher Dienst": "",
  "Mittlerer Dienst": "",
  "Gehobener Dienst":
    "Als Faustregel ein Bachelor-Studium – maßgeblich ist die Vorbildung, die die Ausschreibung verlangt.",
  "Höherer Dienst":
    "Als Faustregel ein Master oder ein gleichwertiges Studium – maßgeblich ist die Vorbildung, die die Ausschreibung verlangt.",
  Andere:
    "Sammelposten in den Quelldaten, keine eigene Laufbahngruppe – was gilt, steht in der jeweiligen Ausschreibung.",
};

/**
 * Bundeslaender, Codes wie die API sie fuehrt (Wertehilfen_Region). Das Feld
 * `api.Region` fragt der Sync ab, die API liefert es frei mit.
 *
 * WOZU: Ohne diesen Filter kennt die Suche nur exakte Ortsnamen. Die
 * haeufigste Fehlschlagsart ist genau dieser Fall - "in Brandenburg", "im
 * Allgaeu", "ganz im Norden": Region genannt, Stadt gefordert, Antwort "es
 * gibt nichts", obwohl es etwas gibt.
 */
export const BUNDESLAND_BY_NAME: Record<string, string> = {
  "Schleswig-Holstein": "01",
  Hamburg: "02",
  Niedersachsen: "03",
  Bremen: "04",
  "Nordrhein-Westfalen": "05",
  Hessen: "06",
  "Rheinland-Pfalz": "07",
  "Baden-Württemberg": "08",
  Bayern: "09",
  Saarland: "10",
  Berlin: "11",
  Brandenburg: "12",
  "Mecklenburg-Vorpommern": "13",
  Sachsen: "14",
  "Sachsen-Anhalt": "15",
  Thüringen: "16",
};

export const BUNDESLAND_NAMES = Object.keys(BUNDESLAND_BY_NAME) as [string, ...string[]];

const BUNDESLAND_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(BUNDESLAND_BY_NAME).map(([name, code]) => [code, name]),
);

export function toBundeslandCodes(names: string[] | undefined): string[] {
  return (names ?? []).map((name) => BUNDESLAND_BY_NAME[name]).filter(Boolean);
}

/** Code -> Name fuer die Ausgabe. Leer, wenn die Stelle keinen Wert traegt. */
export function bundeslandName(code: string | undefined): string {
  return code ? (BUNDESLAND_BY_CODE[code] ?? "") : "";
}

/** Klartext zu einer Laufbahngruppe, leer wenn keiner hinterlegt ist. */
export function laufbahngruppeBedeutung(name: string): string {
  return LAUFBAHNGRUPPE_BEDEUTUNG[name] ?? "";
}

/**
 * Zaehlt erlaubte Werte fuer eine Parameterbeschreibung auf.
 *
 * MIT ANFUEHRUNGSZEICHEN, und das ist kein Schoenheitsfehler: zwei
 * Organisationsbereiche enthalten selbst ein Komma ("Ausrüstung,
 * Informationstechnik und Nutzung", "Infrastruktur, Umweltschutz und
 * Dienstleistungen"). Kommagetrennt aufgezaehlt liest ein Modell daraus fuenf
 * Werte statt zwei und schickt anschliessend ungueltige Enum-Werte.
 */
export function erlaubteWerte(namen: readonly string[]): string {
  return namen.map((name) => `"${name}"`).join(", ");
}

export function toOrganisationsbereichCodes(names: string[] | undefined): string[] {
  return (names ?? []).map((name) => ORGANISATIONSBEREICH_BY_NAME[name]).filter(Boolean);
}

export function toLaufbahngruppeCodes(names: string[] | undefined): string[] {
  return (names ?? []).map((name) => LAUFBAHNGRUPPE_BY_NAME[name]).filter(Boolean);
}

/**
 * Titel-Suche. Nur gegen den Titel: die Volltextfelder liegen in der
 * `content`-Subcollection und müssten für jede Stelle einzeln geladen werden -
 * bei allen aktiven Stellen pro Suchanfrage nicht vertretbar.
 *
 * Mehrere Begriffe werden UND-verknüpft, damit "Offizier Marine" enger trifft
 * als jeder Begriff für sich. Groß-/Kleinschreibung egal.
 *
 * WICHTIG - Wortanfang statt beliebigem Teilstring: ein simpler `includes()`
 * lässt "IT" auf "TruppenversorgungsbearbeITer" und "MilITärisches" passen und
 * liefert damit ein Vielfaches an sinnlosen Treffern. Der Begriff muss deshalb an
 * einer Wortgrenze *beginnen*, darf aber ins Wort hineinlaufen - so findet
 * "Software" weiterhin "Softwareentwickler" (deutsche Komposita) und "IT"
 * findet "IT-System-Elektroniker", ohne den Wortmüll mitzunehmen.
 */
/**
 * Zusatz zur Beschreibung von `vertragsarten` - in BEIDEN Werkzeugen derselbe.
 *
 * WOZU ALS KONSTANTE: Der Satz ist die eine Haelfte einer Abgrenzung, deren
 * andere Haelfte bei `einstiegswege` steht. Zwei Kopien wuerden auseinander-
 * laufen, und dann zeigt genau ein Filter auf den anderen - also wieder eine
 * Sackgasse in eine Richtung.
 *
 * Wer "als Reservist im Personalbereich" helfen will, ist mit `einstiegswege:
 * ["reserveoffizier"]` falsch bedient: das trifft nur wenige Offizierstellen,
 * die gesuchte Stelle steht unter `Reservedienst`.
 */
/** Die Gegenrichtung derselben Abgrenzung - steht bei `einstiegswege`. */
export const EINSTIEGSWEG_RESERVE_HINWEIS =
  'Do NOT use "reserveoffizier" for a general reservist request: it is one narrow officer programme with a handful of postings, while reserve service as a whole lives in `vertragsarten: ["Reservedienst"]` and is an order of magnitude larger. Someone who says "I want to serve as a reservist" means Reservedienst.';

export const VERTRAGSART_RESERVE_HINWEIS =
  '"Reservedienst" is the whole of reserve service and the right choice whenever someone wants to serve as a reservist alongside a civilian life — enlisted, NCO and officer alike. Do not reach for `einstiegswege: ["reserveoffizier"]` for that: it is one narrow officer programme, an order of magnitude smaller, and choosing it leads to a wrong "there is nothing" answer.';

export function matchesSuchbegriff(title: string, suchbegriff: string | undefined): boolean {
  if (!suchbegriff) return true;
  const terms = suchbegriff.split(/\s+/).filter((term) => term.length > 0);
  return terms.every((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}`, "i").test(title);
  });
}
