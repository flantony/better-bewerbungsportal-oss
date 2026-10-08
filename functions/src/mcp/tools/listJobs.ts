// zod/v3 (not the bare "zod" import used elsewhere) works around a TS structural-comparison
// depth-limit interop bug between zod and @modelcontextprotocol/sdk's internal zod/v3 usage.
import { z } from "zod/v3";
import { VERTRAGSART_OPTIONS } from "../../lib/onboardingOptions";
import { spanneLabel } from "../../lib/besoldungsSpanne";
import {
  erlaubteWerte,
  EINSTIEGSWEG_RESERVE_HINWEIS,
  VERTRAGSART_RESERVE_HINWEIS,
  BUNDESLAND_NAMES,
  bundeslandName,
  toBundeslandCodes,
  LAUFBAHNGRUPPE_NAMES,
  ORGANISATIONSBEREICH_NAMES,
  toLaufbahngruppeCodes,
  toOrganisationsbereichCodes,
} from "../lib/filterOptions";
import { fasseHinweiseZusammen, geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";
import { bewerbungsschlussHinweisFuerListe } from "../lib/bewerbungsschlussHinweis";
import { zaehleAusschluesse, type Ausschlussmessung, type Ausschlusszaehlung } from "../lib/ausschluesse";
import { detectTemplateFamily } from "../lib/identifyBewerbungsbogen";
import { queryJobs, type Sortierung } from "../lib/queryJobs";
import { listJobsFilterAus } from "../lib/suchfilter";
import { haeufigeTitelwoerter, type Titelwort } from "../../lib/suchTokens";
import { EINSTIEGSWEG_WERTE, einstiegswegBedeutung } from "../../lib/einstiegsweg";
import { hinweisFuerLeereSuche } from "../knowledge/berufswuensche";
import { NEUE_STELLEN_PER_MAIL } from "../lib/neueStellenPerMail";

// Die VOLLE Liste, nicht SELECTABLE_VERTRAGSART_OPTIONS: letztere lässt
// Reservedienst/Ausbildungsvertrag/Stipendium aus reinen UI-Gruppierungsgründen
// weg, in den echten Daten sind das aber sehr häufige Werte.
const VERTRAGSART_VALUES = VERTRAGSART_OPTIONS.map((option) => option.value) as [string, ...string[]];

export const listJobsInputSchema = {
  suchbegriff: z
    .string()
    .optional()
    .describe(
      "Free-text search over the job TITLE. Matched against pre-computed tokens, so German compounds work ('Software' finds 'Softwareentwickler') but a term never matches mid-word ('IT' does not match 'Arbeitszeit'). Several words are AND-combined.",
    ),
  organisationsbereich: z
    .array(z.enum(ORGANISATIONSBEREICH_NAMES))
    .optional()
    .describe(
      `Branch / organisational area, e.g. ["Marine"] for navy jobs. Allowed (each value in quotes — two of them contain a comma themselves): ${erlaubteWerte(ORGANISATIONSBEREICH_NAMES)}. This is the reliable way to find e.g. Marine roles — job title and city are NOT dependable indicators.`,
    ),
  laufbahngruppe: z
    .array(z.enum(LAUFBAHNGRUPPE_NAMES))
    .optional()
    .describe(
      `Career group / rank band, e.g. ["Offiziere"]. Allowed: ${erlaubteWerte(LAUFBAHNGRUPPE_NAMES)}. The only dependable way to filter by rank band.`,
    ),
  taetigkeitsbereich: z
    .enum(["militaerisch", "zivil", "beide"])
    .optional()
    .describe("military, civilian, or both. Omit for both."),
  vertragsarten: z
    .array(z.enum(VERTRAGSART_VALUES))
    .optional()
    .describe(
      `Filter by contract type. Allowed values: ${erlaubteWerte(VERTRAGSART_VALUES)}. Omit or empty for all. ${VERTRAGSART_RESERVE_HINWEIS}`,
    ),
  beschaeftigungsumfang: z
    .enum(["vollzeit", "teilzeit", "beide"])
    .optional()
    .describe("full-time, part-time, or both. Omit for both."),
  bundesland: z
    .array(z.enum(BUNDESLAND_NAMES))
    .optional()
    .describe(
      `Federal state(s), e.g. ["Brandenburg"]. Allowed: ${erlaubteWerte(BUNDESLAND_NAMES)}. USE THIS when the applicant names a region rather than a town — "in Brandenburg", "im Norden", "in der Eifel". \`wunschort\` only matches exact town names and will come back empty for a region, which reads like "there is nothing" when there is.`,
    ),
  wunschort: z
    .string()
    .optional()
    .describe(
      "City of the job, matched against pre-computed tokens — not a radius search. Multi-part names are split, so 'Köln' also finds 'Köln-Wahn' and vice versa. Use a plain city name. CAN be combined with `suchbegriff` here — the one-field-only restriction applies to zaehle_treffer, not to this tool.",
    ),
  einstiegswege: z
    .array(z.enum(EINSTIEGSWEG_WERTE))
    .optional()
    .describe(
      `Special entry routes, taken from the posting's official reference code and therefore reliable. "reserveoffizier" = the reserve OFFICER programme specifically; "seiteneinstieg" = lateral entry where an existing civilian qualification replaces the usual career path; "wiedereinstellung" = return of someone who already served. Prefer this over \`seiteneinstieg\` for lateral entry: most such postings never use the word in their text, so the text-based flag misses them. Each result carries \`einstiegsweg\` with an explanation. ${EINSTIEGSWEG_RESERVE_HINWEIS}`,
    ),
  seiteneinstieg: z
    .boolean()
    .optional()
    .describe(
      "If true, keep only postings whose TEXT speaks of a Seiteneinstieg/Quereinstieg, including those where it stays unclear — a posting is never dropped just because the text is silent. This is the weaker signal: almost no lateral-entry posting uses the word at all. Prefer `einstiegswege` and use this only to search the wording itself.",
    ),
  alter: z
    .number()
    .int()
    .min(15)
    .max(70)
    .optional()
    .describe(
      "The applicant's age in years. Drops postings whose stated minimum or maximum age rules them out — the single most common knock-out criterion for military careers. Postings that state no age limit are always kept: not knowing a limit is no reason to hide a job. Only pass this if the user actually told you their age.",
    ),
  mindestbesoldung: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      "Minimum pay grade as a number (11 for A11). Matches postings whose pay range REACHES at least this grade, so a posting advertising A10-A11 matches 11. Combine with `besoldungstabelle`.",
    ),
  besoldungstabelle: z
    .enum(["A", "E"])
    .optional()
    .describe(
      "Which pay table `mindestbesoldung` refers to: 'A' = Beamte/Soldaten (BBesO, the usual one for military roles), 'E' = collective agreement (TVöD, civilian employees). Defaults to 'A'.",
    ),
  limit: z.number().int().positive().max(200).optional().describe("Max results per page, default 50"),
  sortierung: z
    .enum(["bewerbungsschluss", "neueste"])
    .optional()
    .describe(
      "Order of the results. 'bewerbungsschluss' (default) puts the closest application deadline first — use it when the user is ready to apply. 'neueste' puts recently added postings first — use it when the user is browsing repeatedly and wants to know what is new. The order is stable, so paging with `cursor` never repeats or skips a posting.",
    ),
  cursor: z
    .string()
    .optional()
    .describe(
      "Pass the `naechsterCursor` value from a previous response to get the next page. Omit it for the first page. Keep every other filter identical — changing a filter invalidates the position. The cursor is opaque: never construct or edit one.",
    ),
};

const listJobsInput = z.object(listJobsInputSchema);
export type ListJobsInput = z.infer<typeof listJobsInput>;

export interface ListJobsEntry {
  pinstGuid: string;
  /**
   * Kennzeichen der Ausschreibung, wie die Bundeswehr es fuehrt. Gehoert in die
   * Trefferliste, nicht erst in `get_job`: eine Kurzliste ohne Kennzeichen ist
   * fuer den Bewerber nicht handlungsfaehig - er kann keinen einzigen Treffer
   * wiederfinden oder in einer Bewerbung benennen.
   */
  refCode: string;
  title: string;
  besOrt: string;
  /** Bundesland im Klartext. Leer, wenn die Stelle keins traegt (z.B. Auslandsdienstposten). */
  bundesland: string;
  contractTypeLabel: string | null;
  applicationEnd: string;
  vollzeit: boolean;
  /** Anzeigeform der Besoldung, z.B. "A7-A9 M". Leer, wenn keine Angabe. */
  besoldung: string;
  /** Kurzfassung der extrahierten Anforderungen; Details über get_job. */
  dienstgrad: string;
  /**
   * Was der AUSSCHREIBUNGSTEXT zum Seiteneinstieg sagt ("ja"/"nein"/"unklar"),
   * aus dem Volltext extrahiert. NICHT zu verwechseln mit `einstiegsweg`, das
   * aus dem amtlichen Kennzeichen kommt und verlaesslich ist. Der lange Name
   * haelt die beiden Felder auseinander.
   */
  seiteneinstiegLautText: string;
  /**
   * Besonderer Einstiegsweg aus dem Kennzeichen, mit Klartext. Leer = keiner.
   * Verlässlicher als `seiteneinstieg` (s. lib/einstiegsweg.ts).
   */
  einstiegsweg: string;
  einstiegswegBedeutung: string;
  /**
   * Altersgrenzen und Verpflichtungszeit FEHLEN, wenn die Ausschreibung dazu
   * nichts sagt - sie stehen nie als 0 oder als leerer String da.
   *
   * WOZU: ein `hoechstalter: 0` fuer "nicht angegeben" saehe wie eine Zahl aus.
   * Ein Client, der die Trefferzeile an den Bewerber weitergibt, laese daraus
   * "keine Altersgrenze"; dasselbe gilt fuer eine leere `verpflichtungsdauer`
   * ("keine Verpflichtungszeit"). Beides ist grundfalsch und kostet eine
   * Bewerbung. Eine Warnung nur in `instructions.ts` griffe nur, solange der
   * Client die Stelle gelesen hat und sich erinnert.
   */
  mindestalter?: number;
  hoechstalter?: number;
  /** Woertlich aus der Ausschreibung, z.B. "zwischen 3 und 12 Jahre". */
  verpflichtungsdauer?: string;
  /** true, wenn ein Bewerbungsbogen an der Ausschreibung hängt. */
  hatBewerbungsbogen: boolean;
}

export interface ListJobsResult {
  results: ListJobsEntry[];
  totalCount: number;
  /** Verwendete Reihenfolge - damit die KI sie dem Nutzer benennen kann. */
  sortierung: Sortierung;
  /**
   * Gesetzt, wenn es weitere Treffer gibt. Unveraendert zusammen mit denselben
   * Filtern erneut schicken, um die naechste Seite zu holen.
   */
  naechsterCursor?: string;
  /**
   * Nur gesetzt, wenn die Ergebnismenge an die Obergrenze gestossen ist und es
   * dahinter weitere Treffer geben kann. Wird als Feld zurueckgegeben, damit die
   * KI es dem Nutzer sagen kann - eine abgeschnittene Liste, die vollstaendig
   * aussieht, fuehrt genau zu der falschen Auskunft, die dieses Tool vermeiden soll.
   */
  hinweis?: GeteilterHinweis;
  /**
   * Woher die Werte der Trefferzeile kommen - EINMAL je Antwort, nicht je
   * Treffer.
   *
   * WOZU: `get_job` traegt den Vermerk am `anforderungen`-Block. Ohne ihn in
   * der Trefferliste gibt ein Client "Verpflichtungszeit 8 bis 13 Jahre" und
   * "Altersgrenze 49" aus dieser Liste an den Bewerber weiter und schreibt sie
   * "der offiziellen Bundeswehr-Seite" zu. Die Zahlen stimmen, die Herkunft ist
   * falsch dargestellt - und aus der Vorauswahl heraus antwortet ein Client
   * genau so, ohne `get_job` je zu rufen.
   *
   * EIGENES FELD statt eines weiteren `hinweis`: dieser Vermerk trifft bei JEDER
   * Suche mit Treffern zu und wuerde die situativen Hinweise (Leerfall, Deckel,
   * verdeckte Treffer) dauerhaft verdraengen - die sind dringender, weil sie auf
   * eine Handlung zeigen. Ein Vermerk je Treffer waere bei 50 Treffern
   * derselbe Satz fuenfzigmal.
   */
  herkunftDerAngaben?: GeteilterHinweis;
  /**
   * Was die gesetzten Filter WEGGEWORFEN haben - je Filter eine Zahl.
   *
   * WOZU: Ein Filter kann genau die gefragte Kategorie vollstaendig
   * ausschliessen. Beispiel: `taetigkeitsbereich: "militaerisch"` plus
   * `vertragsarten: ["Soldatin / Soldat auf Zeit"]` liefert Treffer, aber
   * keinen Reserveoffizier-Dienstposten, weil keiner davon diese Vertragsart
   * traegt - und ein Client antwortet dann, es gebe keinen. Aus dem Schweigen
   * darueber wird hier eine Zahl; das Urteil bleibt bei der anfragenden KI.
   *
   * EIGENES FELD statt eines weiteren `hinweis`, aus demselben Grund wie
   * `herkunftDerAngaben`: das trifft auf fast jede gefilterte Suche zu und
   * wuerde die situativen Hinweise (Leerfall, Lesedeckel) dauerhaft verdraengen -
   * die zeigen auf eine Handlung und sind dringender. Ausserdem sind es Zahlen
   * und keine Regieanweisung; eine Zahl in einem Feld uebersteht auch, dass nur
   * der Anfang der Antwort gelesen wird.
   *
   * Fehlt, wenn kein Filter etwas ausgeschlossen hat (s. ausschluesse.ts).
   */
  ausgeschlosseneStellen?: AusgeschlosseneStellen;
  /**
   * Nur bei Treffern: der Weg zur E-Mail-Benachrichtigung ueber
   * erstelle_suchprofil_link (s. lib/neueStellenPerMail.ts).
   */
  neueStellenPerMail?: GeteilterHinweis;
  /**
   * Nur bei null Treffern: Woerter, die in den Titeln des gefilterten Bereichs
   * tatsaechlich vorkommen, mit der Zahl der Stellen. Gedacht als Vorlage zum
   * UEBERSETZEN - "Roentgen" steht in keinem Titel, "Radiologie" schon.
   */
  vorhandeneTitelwoerter?: Titelwort[];
}

export interface AusgeschlosseneStellen {
  /**
   * Rahmen fuer die Zahlen, Adressat ist die KI. Steht ZUERST: eine nackte Zahl
   * laesst sich auch als "so viele passen auch noch" lesen.
   */
  nurFuerDich: string;
  je: Ausschlusszaehlung[];
  /** Filter, die erst nach der Abfrage wirken und in `anzahl` nicht steckt. */
  nichtEingerechnet?: string[];
}

/** Die tatsaechlich gesetzten Filter - Paging und Sortierung grenzen nicht ein. */
function eingrenzendeFilter(input: ListJobsInput): [string, unknown][] {
  const { limit: _l, sortierung: _so, cursor: _c, ...eingrenzend } = input;
  return Object.entries(eingrenzend).filter(([, wert]) =>
    Array.isArray(wert) ? wert.length > 0 : wert !== undefined,
  );
}

/** Alles ausser dem Suchbegriff selbst. */
function hatWeitereFilter(input: ListJobsInput): boolean {
  return eingrenzendeFilter(input).some(([name]) => name !== "suchbegriff");
}

/**
 * Der naechste Aufruf als fertige Argumentliste - genau EIN Filter weggelassen.
 *
 * Vorbild sind die Leer-Hinweise aus `berufswuensche.ts`: ein Hinweis, der den
 * Aufruf ausschreibt, wird befolgt; einer, der "die Suche weiten" verlangt,
 * bleibt Auslegungssache.
 */
function naechsterAufrufOhne(input: ListJobsInput, ...ohne: (keyof ListJobsInput)[]): string {
  const weg = new Set<string>(ohne as string[]);
  const rest = eingrenzendeFilter(input)
    .filter(([name]) => !weg.has(name))
    .map(([name, wert]) => `${name}: ${JSON.stringify(wert)}`)
    .join(", ");
  // Nur weglassen, was auch gesetzt war - "ohne besoldungstabelle" verwirrt,
  // wenn der Aufruf sie nie mitgegeben hat.
  const genannt = ohne
    .filter((name) => input[name] !== undefined)
    .map((name) => `\`${name}\``)
    .join(" und ");
  return rest
    ? `list_jobs erneut aufrufen mit ${rest} - ohne ${genannt}`
    : `list_jobs erneut aufrufen ohne ${genannt}`;
}

/**
 * Argumente, die zusammen mit einem gemeldeten Filter wegfallen muessen - sonst
 * schlaegt der naechste Aufruf `besoldungstabelle: "A"` ohne Besoldungsfilter
 * vor, was nichts tut.
 */
const MITWEG: Partial<Record<Ausschlusszaehlung["filter"], (keyof ListJobsInput)[]>> = {
  mindestbesoldung: ["besoldungstabelle"],
};

/**
 * Aus den Zahlen von `zaehleAusschluesse` das Feld der Antwort machen. Die
 * Zahlen gelten fuer DIESE Abfrage, nicht fuer einen Durchschnitt des
 * Bestands, und decken jeden eingrenzenden Filter ab.
 *
 * DER AUSGESCHRIEBENE NAECHSTE AUFRUF nur bei einer Datenluecke: dort ist
 * belegt, dass der Filter Stellen wegwirft, die inhaltlich nicht ausgeschlossen
 * sind. Ohne Luecke bleibt es beim Zahlenbefund - "lass suchbegriff weg" waere
 * bei einer Fachsuche ein Rat, der fast den ganzen Bestand zurueckgibt.
 */
function ausschlussbericht(
  messung: Ausschlussmessung | null,
  input: ListJobsInput,
): AusgeschlosseneStellen | null {
  if (!messung || messung.je.length === 0) return null;

  const saetze = [
    "Diese Trefferliste ist nicht der Bestand: `je` nennt zu jedem gesetzten Filter die Stellen, die alle " +
    "uebrigen Filter erfuellen und allein an diesem einen scheitern.",
  ];

  const mitLuecke = messung.je.find((eintrag) => eintrag.ohneAngabe !== undefined);
  if (mitLuecke) {
    const aufruf = naechsterAufrufOhne(
      input,
      mitLuecke.filter as keyof ListJobsInput,
      ...(MITWEG[mitLuecke.filter] ?? []),
    );
    saetze.push(
      "`ohneAngabe` sind davon die, die zu dem Merkmal ueberhaupt keinen Wert tragen - die sind nicht " +
      "inhaltlich ausgeschlossen, sondern unbeschrieben, und JEDER Filter auf dieses Merkmal verliert sie. " +
      `Naechster Schritt, VOR der Antwort: ${aufruf}. "Dazu gibt es nichts" ist auf dieser Grundlage nicht belegt.`,
    );
  }

  if (messung.nichtEingerechnet.length > 0) {
    saetze.push(
      `Nicht eingerechnet, weil erst nach der Abfrage wirksam: ${messung.nichtEingerechnet.join(", ")} - die ` +
      "Zahlen koennen dadurch zu hoch sein.",
    );
  }

  return {
    nurFuerDich: saetze.join(" "),
    je: messung.je,
    ...(messung.nichtEingerechnet.length > 0 ? { nichtEingerechnet: messung.nichtEingerechnet } : {}),
  };
}

/**
 * Die Felder der Trefferzeile, die NICHT aus der amtlichen Stellendatenbank
 * kommen. In derselben Reihenfolge wie in der Trefferzeile, damit die KI sie
 * dort wiederfindet.
 */
const ABGELEITETE_FELDER =
  "dienstgrad, besoldung, mindestalter, hoechstalter, verpflichtungsdauer, seiteneinstiegLautText";

/** Amtlich, also unmittelbar aus der Stellendatenbank der Bundeswehr. */
const AMTLICHE_FELDER =
  "refCode, title, besOrt, bundesland, contractTypeLabel, applicationEnd, vollzeit, einstiegsweg";

/** Traegt diese Zeile ueberhaupt eine abgeleitete Angabe? */
function hatAbgeleiteteAngabe(entry: ListJobsEntry): boolean {
  return (
    Boolean(entry.dienstgrad || entry.besoldung || entry.mindestalter || entry.hoechstalter || entry.verpflichtungsdauer) ||
    entry.seiteneinstiegLautText !== "unklar"
  );
}

/**
 * Der Herkunftsvermerk zur Trefferliste. `null`, wenn in der ganzen Liste keine
 * abgeleitete Angabe steht - dann gibt es nichts zu kennzeichnen, und die
 * leere Liste bleibt so schmal, wie sie ist.
 */
function herkunftsvermerk(results: ListJobsEntry[]): GeteilterHinweis | null {
  if (!results.some(hatAbgeleiteteAngabe)) return null;
  return geteilterHinweis(
    `Nicht amtlich, sondern aus dem Fliesstext der Ausschreibung gezogen: ${ABGELEITETE_FELDER}. ` +
    "Die Auswertung macht ein Sprachmodell; `besoldung` ist der Zwitter - entweder die Besoldungsangabe der " +
    "Stelle selbst oder aus einem genannten Dienstgrad abgeleitet (welches von beidem, sagt `besoldung.quelle` " +
    "in get_job). Diese Werte nie der Bundeswehr, einer offiziellen Seite oder einem Amt zuschreiben, sondern " +
    "als \"laut Ausschreibungstext\" kennzeichnen. Fehlt eines der Felder, sagt die Ausschreibung dazu nichts - " +
    "das ist keine Aussage, insbesondere kein \"keine Altersgrenze\". get_job liefert je Stelle " +
    "`anforderungen.belegstelle`, den woertlichen Satz dahinter; im Zweifel gilt der Volltext. Unmittelbar aus " +
    `der Stellendatenbank kommen dagegen: ${AMTLICHE_FELDER}.`,
    "Angaben zu Dienstgrad, Besoldung, Altersgrenzen und Verpflichtungszeit lesen wir aus dem Text der jeweiligen " +
    "Ausschreibung aus. Eine amtliche Auskunft der Bundeswehr sind sie nicht. Verbindlich ist die Ausschreibung selbst.",
  );
}

/** Wie viele Titel fuer das Vokabular gelesen werden - Kostenbremse. */
const VOKABULAR_STICHPROBE = 150;

/**
 * Welche Woerter es im Bestand WIRKLICH gibt - nur wenn nichts gefunden wurde.
 *
 * WOZU: "Roentgen", "Kampfjet", "Reparatur" und "Akten" kommen in keinem
 * Titel vor. Keine Tokenisierung der Welt findet sie; die Uebersetzung nach "Radiologie", "Pilot", "Instandsetzung",
 * "Verwaltung" kann nur die anfragende KI leisten - aber nur, wenn sie sieht,
 * welche Woerter es gibt. Raten kann sie nicht, uebersetzen schon.
 *
 * NUR MIT WEITEREN FILTERN: Ohne sie waere die Stichprobe ein beliebiger
 * Ausschnitt aus dem ganzen Bestand, und die haeufigsten Woerter waeren
 * "einstellung" und "feldwebel" - richtig, aber nutzlos. Mit Ort oder
 * Organisationsbereich ist es das Vokabular GENAU DES Bereichs, in dem der
 * Bewerber sucht.
 *
 * Kosten: eine zusaetzliche Abfrage von hoechstens 150 Dokumenten, und das
 * ausschliesslich auf dem Weg, der sonst mit leeren Haenden endet.
 */
async function vokabularFuerLeersuche(input: ListJobsInput): Promise<{ vorhandeneTitelwoerter?: Titelwort[] }> {
  if (!input.suchbegriff || !hatWeitereFilter(input)) return {};
  try {
    const { suchbegriff: _weg, cursor: _auch, ...ohneSuchbegriff } = input;
    const { results } = await queryJobs({
      ...ohneSuchbegriff,
      organisationsbereich: toOrganisationsbereichCodes(input.organisationsbereich),
      laufbahngruppe: toLaufbahngruppeCodes(input.laufbahngruppe),
      bundesland: toBundeslandCodes(input.bundesland),
      limit: VOKABULAR_STICHPROBE,
    });
    if (results.length === 0) return {};
    // Der gesuchte Ort und die Suchbegriffe selbst fliegen raus - beide stehen
    // per Konstruktion in der Stichprobe und beantworten keine Frage.
    const ausschluss = [input.wunschort, input.suchbegriff].filter((wert): wert is string => Boolean(wert));
    return { vorhandeneTitelwoerter: haeufigeTitelwoerter(results.map((job) => job.title ?? ""), 12, ausschluss) };
  } catch {
    // Ein Zusatz darf die Antwort nie kosten: schlaegt die Stichprobe fehl,
    // bleibt der Hinweis stehen, den es ohnehin gibt.
    return {};
  }
}

export async function listJobs(input: ListJobsInput): Promise<ListJobsResult> {
  const queryFilter = listJobsFilterAus(input);

  // NICHT abgewartet: die Zaehlaggregationen laufen neben der Trefferabfrage,
  // sonst kostet die Auskunft "was haben die Filter weggeworfen" eine
  // zusaetzliche Wartezeit auf dem haeufigsten Aufruf dieses Servers.
  const abfrage = queryJobs(queryFilter);
  const messung = await zaehleAusschluesse(queryFilter, abfrage);
  const { results, totalCount, abgeschnitten, naechsterCursor, sortierung } = await abfrage;

  const leer = results.length === 0;
  // Alle Hinweise durch EINEN Kanal, statt einer per Spread den anderen zu
  // ueberschreiben: sonst verdraengt der Deckel-Hinweis den Leer-Hinweis, und
  // dass beide zugleich zutreffen, ist der Normalfall, nicht die Ausnahme.
  const hinweis = fasseHinweiseZusammen([
    leer ? hinweisFuerLeereSuche(input.suchbegriff, hatWeitereFilter(input)) : null,
    abgeschnitten
      ? // Ohne Bewerberhaelfte: der naechste Schritt ist eine engere Suche,
        // keine Auskunft an den Bewerber.
        geteilterHinweis(
          "Es wurden mehr Stellen gefunden, als in einem Durchgang geprueft werden koennen - es kann weitere " +
          "passende geben, die auch ueber naechsterCursor nicht erreichbar sind. Bitte die Suche eingrenzen.",
        )
      : null,
    // Ein leeres Datum ohne Erklaerung wird als "Frist unbekannt" gelesen.
    // Den Volltext hat die Trefferzeile nicht - ob "jederzeit", sagt get_job.
    bewerbungsschlussHinweisFuerListe(results.filter((job) => !job.applicationEnd).length),
  ]);

  const trefferzeilen: ListJobsEntry[] = results.map((job) => {
    const attribute = job.jobAttributes;
    return {
      pinstGuid: job.pinstGuid,
      refCode: job.refCode,
      title: job.title,
      besOrt: job.besOrt,
      bundesland: bundeslandName(job.region),
      contractTypeLabel: job.contractTypeLabel,
      applicationEnd: job.applicationEnd,
      vollzeit: job.vollzeit,
      besoldung: job.besoldung ? spanneLabel(job.besoldung) : "",
      dienstgrad: attribute?.dienstgrad ?? "",
      seiteneinstiegLautText: attribute?.seiteneinstieg ?? "unklar",
      einstiegsweg: job.einstiegsweg ?? "",
      einstiegswegBedeutung: einstiegswegBedeutung(job.einstiegsweg ?? ""),
      // Altersgrenzen und Verpflichtungsdauer schon in der Liste: es sind
      // K.-o.-Kriterien, und wer sie erst nach `get_job` erfaehrt, hat die
      // Auswahl auf einer Grundlage getroffen, die gar nicht galt. Kennen wir
      // den Wert nicht, FEHLT das Feld - eine 0 wird als "keine Altersgrenze"
      // gelesen, ein leerer String als "keine Verpflichtungszeit".
      ...(attribute?.mindestalter ? { mindestalter: attribute.mindestalter } : {}),
      ...(attribute?.hoechstalter ? { hoechstalter: attribute.hoechstalter } : {}),
      ...(attribute?.verpflichtungsdauer ? { verpflichtungsdauer: attribute.verpflichtungsdauer } : {}),
      // Nicht "hat irgendeinen Anhang": ein Datenschutzblatt oder Antwortbogen
      // ist kein Bewerbungsbogen. Dieselbe Erkennung wie in
      // get_document_requirements, damit die Antwort dem `bogenHinweis` dort
      // bei derselben Stelle nicht widerspricht.
      hatBewerbungsbogen: (job.dokumente ?? []).some((doc) => detectTemplateFamily(doc.attHeader) !== null),
    };
  });

  const herkunft = herkunftsvermerk(trefferzeilen);
  const ausgeschlossen = ausschlussbericht(messung, input);

  return {
    results: trefferzeilen,
    totalCount,
    sortierung,
    ...(naechsterCursor ? { naechsterCursor } : {}),
    ...(hinweis ? { hinweis } : {}),
    ...(ausgeschlossen ? { ausgeschlosseneStellen: ausgeschlossen } : {}),
    ...(herkunft ? { herkunftDerAngaben: herkunft } : {}),
    ...(leer ? await vokabularFuerLeersuche(input) : { neueStellenPerMail: NEUE_STELLEN_PER_MAIL }),
  };
}
