/**
 * Stellensuche als echte Firestore-Query.
 *
 * Alle Facetten sind Gleichheitsfilter auf indizierten Feldern und wandern in
 * die Query. Firestore liefert nur die Treffer, statt dass jeder Aufruf alle
 * aktiven Stellen liest und in JavaScript filtert.
 *
 * Die zwei Einschränkungen, die Firestore setzt, und wie sie gelöst sind:
 *  - Nur EIN `array-contains` pro Query: bei mehreren Suchbegriffen geht der
 *    trennschärfste in die Query, der Rest wird auf der (bereits kleinen)
 *    Ergebnismenge nachgefiltert (s. lib/suchTokens.ts, `planSuche`).
 *  - Teilstring-Suche gibt es nicht: dafür liegen vorberechnete `suchTokens` und
 *    `ortTokens` auf der Stelle. Auch der Ort geht damit in die Query - als
 *    JavaScript-Nachfilter griffe ein Lese-Deckel VOR ihm, und die Ortssuche
 *    waere still unvollstaendig.
 */
import { getFirestore, Timestamp, type Query } from "firebase-admin/firestore";
import { matchesRestTokens, planOrt, planSuche } from "../../lib/suchTokens";
import type { JobSummaryRecord } from "../../types";
import { CURSOR_UNGUELTIG, decodeCursor, encodeCursor, type CursorInhalt } from "./cursor";
import { JOBS_V2_COLLECTION, altAusV2 } from "../../lib/jobsV2Shape";
import { HinweisFehler } from "../../lib/hinweisFehler";

// Schema jobsV2: die Domaenenfelder (active, suchTokens, ortTokens,
// applicationEndSortKey, besoldung, laufbahngruppe ...) liegen oben, nur die
// Rohwerte der API liegen unter `api.*`.
const JOBS_COLLECTION = JOBS_V2_COLLECTION;

/**
 * Obergrenze für den Weg über den Arbeitsspeicher (Nachfilter oder eigene
 * Sortierung) - die Groesse des Abbilds ALLER aktiven Stellen
 * (s. `aktiveStellen`). Der Deckel darf NICHT unter dem Bestand liegen: sonst schneidet
 * er ab, bevor der Nachfilter ueberhaupt laeuft, und die Antwort ist still
 * unvollstaendig.
 *
 * Anfragen ohne Nachfilter brauchen keinen Deckel: sie gehen sortiert und mit
 * `limit + 1` über den Index.
 */
const MAX_FETCH_NACHFILTER = 3000;
/** Firestore-Grenze für Disjunktionen; konservativ ausgereizt. */
const MAX_IN_WERTE = 30;

export type Sortierung = "bewerbungsschluss" | "neueste";

/**
 * Sortierfelder.
 *
 * `neueste` sortiert nach `firstSeenAt` und NICHT nach `lastSeenAt`:
 * der Sync setzt `lastSeenAt` bei jedem Lauf für *alle* weiterhin gelisteten
 * Stellen auf denselben Zeitstempel (s. sync.ts). Eine Sortierung danach sähe
 * sortiert aus, wäre aber innerhalb eines Sync-Laufs willkürlich. `firstSeenAt` steht dagegen
 * für "seit wann kennen wir die Stelle" und ist damit die echte Neuheit.
 */
const SORTIERFELD: Record<Sortierung, { feld: string; richtung: "asc" | "desc" }> = {
  bewerbungsschluss: { feld: "applicationEndSortKey", richtung: "asc" },
  neueste: { feld: "firstSeenAt", richtung: "desc" },
};

const STANDARD_SORTIERUNG: Sortierung = "bewerbungsschluss";
const STANDARD_LIMIT = 50;

/** Firestore-Fehlercode für "zu dieser Query fehlt ein Index". */
const FAILED_PRECONDITION = 9;

/** Trägt die Klartext-Anleitung als Message: sie geht so an den Client. */
export class CursorUngueltigError extends HinweisFehler {
  constructor() {
    super(CURSOR_UNGUELTIG);
    this.name = "CursorUngueltigError";
  }
}

export interface JobQueryFilter {
  taetigkeitsbereich?: "militaerisch" | "zivil" | "beide";
  organisationsbereich?: string[];
  /** Bundesland-Codes der API (`api.Region`), s. filterOptions.BUNDESLAND_BY_NAME. */
  bundesland?: string[];
  laufbahngruppe?: string[];
  vertragsarten?: string[];
  beschaeftigungsumfang?: "vollzeit" | "teilzeit" | "beide";
  wunschort?: string;
  suchbegriff?: string;
  seiteneinstieg?: boolean;
  /**
   * Besonderer Einstiegsweg (s. lib/einstiegsweg.ts) - deterministisch aus dem
   * refCode, damit deutlich verlaesslicher als `seiteneinstieg` aus dem Text.
   */
  einstiegswege?: string[];
  /**
   * Alter des Bewerbers. Schliesst Stellen aus, deren genannte Alterspanne das
   * ausschliesst. Stellen OHNE Altersangabe bleiben immer drin: dass wir keine
   * Grenze kennen, ist kein Grund, jemanden auszusortieren.
   */
  alter?: number;
  /** Numerische Mindeststufe, z.B. 11 für "mindestens A11". */
  mindestbesoldung?: number;
  besoldungstabelle?: "A" | "E";
  limit?: number;
  /** Reihenfolge der Treffer. Default: nächster Bewerbungsschluss zuerst. */
  sortierung?: Sortierung;
  /** `naechsterCursor` einer vorherigen Antwort. */
  cursor?: string;
}

export interface JobQueryResult {
  results: (JobSummaryRecord & { pinstGuid: string })[];
  /** Treffer nach allen Filtern - kann größer sein als `results.length`. */
  totalCount: number;
  /** Wie viele Dokumente Firestore tatsächlich geliefert hat (Effizienz-Nachweis). */
  gelesen: number;
  /**
   * `true`, wenn der Lese-Deckel gegriffen hat und deshalb Treffer fehlen KÖNNEN,
   * die auch durch Weiterblättern nicht erreichbar sind. Muss nach oben
   * durchgereicht werden - eine abgeschnittene Liste, die wie eine vollständige
   * aussieht, ist schlimmer als eine kurze Liste mit Hinweis.
   *
   * Nicht zu verwechseln mit `naechsterCursor`: der bedeutet "es gibt eine
   * weitere Seite", also gerade KEINEN Verlust.
   */
  abgeschnitten: boolean;
  /** Gesetzt, wenn es hinter dieser Seite weitere Treffer gibt. */
  naechsterCursor?: string;
  /** Tatsächlich verwendete Reihenfolge - der Aufrufer soll sie benennen können. */
  sortierung: Sortierung;
}

/** Nachfilter, die nicht in die Query gepasst haben (s. `pushMehrwertig`). */
interface Nachfilter {
  field: "organisationsbereich" | "laufbahngruppe" | "contractTypeLabel" | "einstiegsweg" | "region";
  erlaubt: Set<string>;
}

/**
 * Baut die Query.
 *
 * FIRESTORE-GRENZE, die hier den Ausschlag gibt: disjunktive Filter (`in`)
 * werden intern zu Einzelabfragen aufgefächert, und mehrere `in`-Klauseln
 * multiplizieren sich. 17 Organisationsbereiche x 9 Laufbahngruppen wären 153
 * Disjunktionen - die Query würde abgelehnt. Deshalb:
 *  - einwertige Facetten werden als `==` gestellt (keine Disjunktion, unbegrenzt
 *    kombinierbar) - das ist der Normalfall, weil Nutzer meist EINE
 *    Teilstreitkraft und EINE Laufbahngruppe meinen;
 *  - höchstens EINE mehrwertige Facette geht als `in` in die Query;
 *  - alle weiteren mehrwertigen Facetten werden nachgefiltert. Das kostet nur
 *    dann etwas, wenn wirklich mehrere Mehrfachauswahlen kombiniert werden.
 */
export function buildQuery(filter: JobQueryFilter): {
  query: Query;
  /**
   * Dieselben Bedingungen, die in `query` stehen (ohne `active == true`) - fuer
   * den Speicherweg, der sie auf dem Abbild der aktiven Stellen auswertet
   * statt Firestore zu fragen (s. `aktiveStellen`).
   */
  bedingungen: Bedingung[];
  restTokens: string[];
  ortRestTokens: string[];
  nachfilter: Nachfilter[];
} {
  let query: Query = getFirestore().collection(JOBS_COLLECTION).where("active", "==", true);
  const bedingungen: Bedingung[] = [];
  const nachfilter: Nachfilter[] = [];
  let inKlauselVergeben = false;

  // Jede Bedingung geht an GENAU einer Stelle in Query und Liste - so koennen
  // die beiden Wege nicht auseinanderlaufen.
  const stelle = (feld: string, op: Bedingung["op"], wert: unknown) => {
    bedingungen.push({ feld, op, wert });
    query = query.where(feld, op, wert);
  };

  // Wo das Feld im Schema jobsV2 wirklich liegt. Der Nachfilter arbeitet auf dem
  // zurueckuebersetzten Datensatz (s. altAusV2) und braucht deshalb den
  // Domaenennamen, die Query dagegen den echten Pfad.
  const feldpfad = (field: Nachfilter["field"]): string => (field === "region" ? "api.Region" : field);

  const pushFacette = (field: Nachfilter["field"], werte: string[]) => {
    if (werte.length === 0) return;
    if (werte.length === 1) {
      stelle(feldpfad(field), "==", werte[0]);
      return;
    }
    if (!inKlauselVergeben && werte.length <= MAX_IN_WERTE) {
      stelle(feldpfad(field), "in", werte);
      inKlauselVergeben = true;
      return;
    }
    nachfilter.push({ field, erlaubt: new Set(werte) });
  };

  if (filter.taetigkeitsbereich === "militaerisch") stelle("api.ReqIndustry", "==", 1);
  if (filter.taetigkeitsbereich === "zivil") stelle("api.ReqIndustry", "==", 2);

  pushFacette("organisationsbereich", filter.organisationsbereich ?? []);
  // Rohwert der API, deshalb unter `api.*`.
  pushFacette("region", filter.bundesland ?? []);
  pushFacette("laufbahngruppe", filter.laufbahngruppe ?? []);
  pushFacette("contractTypeLabel", filter.vertragsarten ?? []);

  if (filter.beschaeftigungsumfang === "vollzeit") stelle("vollzeit", "==", true);
  if (filter.beschaeftigungsumfang === "teilzeit") stelle("vollzeit", "==", false);

  // "unklar" bleibt DRIN. Fast alle Seiteneinstiegs-Ausschreibungen sagen das
  // Wort nirgends im Text, die Extraktion liefert dort korrekt "unklar" - ein
  // Ausschluss von "unklar" verbaerge also gerade die Seiteneinstiege. Es ist dieselbe Regel wie beim Alter (s.
  // `passtZumAlter`): dass wir etwas nicht wissen, ist kein Grund
  // auszusortieren. Der Wert steht pro Treffer in der Antwort, die KI kann
  // "ausdruecklich ausgeschrieben" von "nicht genannt" unterscheiden.
  if (filter.seiteneinstieg) {
    stelle("jobAttributes.seiteneinstieg", "in", ["ja", "unklar"]);
    inKlauselVergeben = true;
  }

  pushFacette("einstiegsweg", filter.einstiegswege ?? []);

  // Bereichsfilter auf die OBERE Grenze: "mindestens A11" muss auch eine Stelle
  // treffen, die A10-A11 ausschreibt.
  if (filter.mindestbesoldung !== undefined) {
    stelle("besoldung.tabelle", "==", filter.besoldungstabelle ?? "A");
    stelle("besoldung.bisStufe", ">=", filter.mindestbesoldung);
  }

  // Firestore erlaubt nur EIN `array-contains`. Der Ort bekommt den Vorzug vor
  // dem Suchbegriff: er ist in aller Regel deutlich trennschärfer, sodass der
  // verbleibende Titel-Nachfilter auf einer kleinen Menge arbeitet.
  const { queryToken: suchToken, restTokens: suchRest } = planSuche(filter.suchbegriff ?? "");
  const { queryToken: ortToken, restTokens: ortRest } = planOrt(filter.wunschort ?? "");

  if (ortToken) {
    stelle("ortTokens", "array-contains", ortToken);
    return {
      query,
      bedingungen,
      restTokens: [...suchRest, ...(suchToken ? [suchToken] : [])],
      ortRestTokens: ortRest,
      nachfilter,
    };
  }
  if (suchToken) stelle("suchTokens", "array-contains", suchToken);

  return { query, bedingungen, restTokens: suchRest, ortRestTokens: [], nachfilter };
}

/** Eine Bedingung der Query, wie `buildQuery` sie stellt. */
export interface Bedingung {
  feld: string;
  op: "==" | "in" | ">=" | "array-contains";
  wert: unknown;
}

function feldwert(daten: Record<string, unknown>, pfad: string): unknown {
  let wert: unknown = daten;
  for (const teil of pfad.split(".")) {
    if (wert === null || typeof wert !== "object") return undefined;
    wert = (wert as Record<string, unknown>)[teil];
  }
  return wert;
}

/**
 * Wertet eine Bedingung so aus, wie Firestore es tut - fuer genau die vier
 * Operatoren, die `buildQuery` verwendet. Ein fehlendes Feld erfuellt keine
 * Bedingung (wie in Firestore), und `>=` vergleicht nur Werte gleichen Typs
 * (Firestore ordnet Zahlen und Texte getrennt).
 */
export function erfuellt(daten: Record<string, unknown>, bedingung: Bedingung): boolean {
  const wert = feldwert(daten, bedingung.feld);
  switch (bedingung.op) {
    case "==":
      return wert !== undefined && wert === bedingung.wert;
    case "in":
      return wert !== undefined && Array.isArray(bedingung.wert) && bedingung.wert.includes(wert);
    case ">=":
      return (
        (typeof wert === "number" && typeof bedingung.wert === "number" && wert >= bedingung.wert) ||
        (typeof wert === "string" && typeof bedingung.wert === "string" && wert >= bedingung.wert)
      );
    case "array-contains":
      return Array.isArray(wert) && wert.includes(bedingung.wert);
  }
}

/**
 * Alters-Nachfilter. NICHT in der Query: `hoechstalter >= alter ODER
 * hoechstalter == 0` waere eine Disjunktion auf demselben Feld, und die
 * Alternative - Stellen ohne Angabe wegzulassen - waere schlicht falsch.
 *
 * PREIS: als ALLEINIGER Filter kostet das Alter einen vollen Durchlauf ueber
 * alle aktiven Stellen, weil nichts anderes die Menge vorher eingrenzt.
 * Zusammen mit Ort, Bereich oder Suchbegriff faellt es nicht ins Gewicht - dann
 * filtert es eine bereits kleine Menge. Eine Or-Query auf `hoechstalter`
 * liesse sich zwar bauen, wuerde
 * sich aber mit jeder weiteren `in`-Klausel multiplizieren und genau die
 * Kombinationen sprengen, die im Alltag vorkommen.
 */
function passtZumAlter(job: JobSummaryRecord, alter: number | undefined): boolean {
  if (alter === undefined) return true;
  const min = job.jobAttributes?.mindestalter ?? 0;
  const max = job.jobAttributes?.hoechstalter ?? 0;
  if (min > 0 && alter < min) return false;
  if (max > 0 && alter > max) return false;
  return true;
}

type Treffer = JobSummaryRecord & { pinstGuid: string };

/**
 * Sortierwert in Millisekunden, `null` wenn das Feld fehlt.
 *
 * Fehlende Werte werden ans Ende sortiert - eine Stelle ohne hinterlegten
 * Bewerbungsschluss ist nicht "sofort fällig". Für sie wird auch kein Cursor
 * ausgegeben: ohne belastbaren Sortierwert liesse sich hinter ihr nicht sauber
 * weiterblättern.
 */
function sortMillis(job: Treffer, sortierung: Sortierung): number | null {
  const feld = SORTIERFELD[sortierung].feld as "applicationEndSortKey" | "firstSeenAt";
  const wert = job[feld];
  if (wert && typeof (wert as Timestamp).toMillis === "function") return (wert as Timestamp).toMillis();
  return null;
}

function vergleiche(a: Treffer, b: Treffer, sortierung: Sortierung): number {
  const richtung = SORTIERFELD[sortierung].richtung === "asc" ? 1 : -1;
  const links = sortMillis(a, sortierung);
  const rechts = sortMillis(b, sortierung);
  // Fehlende Werte immer ans Ende, unabhängig von der Richtung.
  if (links === null && rechts === null) return a.pinstGuid.localeCompare(b.pinstGuid);
  if (links === null) return 1;
  if (rechts === null) return -1;
  if (links !== rechts) return (links - rechts) * richtung;
  // Tiebreaker wie in Firestore: die Dokument-ID. Ohne ihn ist die Reihenfolge
  // bei gleichem Bewerbungsschluss nicht stabil und das Blättern verliert Stellen.
  return a.pinstGuid.localeCompare(b.pinstGuid) * richtung;
}

/**
 * Der Weg über Firestore: sortieren und begrenzen macht die Datenbank.
 *
 * Gelesen werden nur `limit + 1` Dokumente, und `totalCount` kommt aus einer
 * Aggregation, die nach Index-Einträgen abgerechnet wird statt nach Dokumenten.
 */
async function seiteUeberIndex(
  query: Query,
  sortierung: Sortierung,
  limit: number,
  cursor: CursorInhalt | null,
): Promise<JobQueryResult> {
  const { feld, richtung } = SORTIERFELD[sortierung];
  let seite = query.orderBy(feld, richtung);
  if (cursor?.typ === "index") {
    // Zweiter Wert bedient die implizite __name__-Sortierung (Tiebreaker).
    seite = seite.startAfter(Timestamp.fromMillis(Number(cursor.wert)), cursor.id);
  }

  const [snapshot, zaehlung] = await Promise.all([
    seite.limit(limit + 1).get(),
    query.count().get(),
  ]);

  const geladen: Treffer[] = snapshot.docs.map((doc) => ({
    ...(altAusV2(doc.data()) as unknown as JobSummaryRecord),
    pinstGuid: doc.id,
  }));
  const results = geladen.slice(0, limit);
  const letzter = results.at(-1);
  const letzterWert = letzter ? sortMillis(letzter, sortierung) : null;
  const gibtWeitere = geladen.length > limit && letzter !== undefined && letzterWert !== null;

  return {
    results,
    totalCount: zaehlung.data().count,
    gelesen: snapshot.size,
    abgeschnitten: false,
    sortierung,
    ...(gibtWeitere
      ? {
          naechsterCursor: encodeCursor({
            typ: "index",
            wert: String(letzterWert),
            id: letzter.pinstGuid,
          }),
        }
      : {}),
  };
}

/**
 * Der Weg über den Arbeitsspeicher: nötig, sobald in JavaScript nachgefiltert
 * wird (Alter, weitere Suchbegriffe, mehrere Mehrfachauswahlen) oder eine
 * Bereichsabfrage im Spiel ist - Firestore verlangt dann, dass die erste
 * Sortierung auf dem Bereichsfeld liegt, was die gewünschte Reihenfolge
 * zerstören würde.
 *
 * Gelesen wird dafuer nicht Firestore, sondern das Abbild der aktiven Stellen
 * (s. `aktiveStellen`); sortiert und geblättert wird auf dem, was schon da ist.
 */
function seiteImSpeicher(
  geladen: Treffer[],
  filter: JobQueryFilter,
  nachfilter: Nachfilter[],
  restTokens: string[],
  ortRestTokens: string[],
  sortierung: Sortierung,
  limit: number,
  offset: number,
  gelesen: number,
  deckelErreicht: boolean,
): JobQueryResult {
  const gefiltert = geladen
    .filter((job) => passtZumAlter(job, filter.alter))
    .filter((job) => matchesRestTokens(job.ortTokens ?? [], ortRestTokens))
    .filter((job) => matchesRestTokens(job.suchTokens ?? [], restTokens))
    .filter((job) =>
      nachfilter.every((f) => {
        const wert = job[f.field];
        return typeof wert === "string" && f.erlaubt.has(wert);
      }),
    )
    .sort((a, b) => vergleiche(a, b, sortierung));

  const results = gefiltert.slice(offset, offset + limit);
  const gibtWeitere = offset + limit < gefiltert.length;

  return {
    results,
    totalCount: gefiltert.length,
    gelesen,
    abgeschnitten: deckelErreicht,
    sortierung,
    ...(gibtWeitere ? { naechsterCursor: encodeCursor({ typ: "speicher", offset: offset + limit }) } : {}),
  };
}

// ─── Abbild der aktiven Stellen ─────────────────────────────────────────────

/**
 * Wie lange ein Abbild der aktiven Stellen je Instanz gilt. Der Bestand aendert
 * sich einmal in der Nacht (Sync um 03:00); fuenf Minuten Alter sieht niemand.
 */
export const SCHNAPPSCHUSS_MS = 5 * 60_000;

interface Schnappschuss {
  /** Rohdaten fuer die Bedingungen (Pfade wie `api.Region`), Treffer-Form fuer die Ausgabe. */
  stellen: { id: string; daten: Record<string, unknown>; stelle: JobSummaryRecord }[];
  deckelErreicht: boolean;
}

let ladung: { seit: number; ergebnis: Promise<Schnappschuss> } | null = null;

async function ladeAktiveStellen(): Promise<Schnappschuss> {
  const snapshot = await getFirestore()
    .collection(JOBS_COLLECTION)
    .where("active", "==", true)
    .limit(MAX_FETCH_NACHFILTER)
    .get();
  return {
    stellen: snapshot.docs.map((doc) => {
      const daten = doc.data();
      // doc.id ist maßgeblich - das Feld im Dokument ist nur eine Kopie davon.
      return { id: doc.id, daten, stelle: altAusV2(daten) as unknown as JobSummaryRecord };
    }),
    deckelErreicht: snapshot.size === MAX_FETCH_NACHFILTER,
  };
}

/**
 * Alle aktiven Stellen, einmal je Instanz und `SCHNAPPSCHUSS_MS` gelesen.
 *
 * WOZU: ohne Abbild laese der Speicherweg bei JEDEM Aufruf die ganze gefilterte
 * Menge aus Firestore - oft Hunderte Dokumente, und jedes Weiterblaettern
 * dasselbe noch einmal. `list_jobs` ist anonym und erlaubt 60 Aufrufe je Minute
 * und IP; die Kosten wuechsen also mit dem Angreifer. So liest eine Instanz den Bestand hoechstens alle fuenf Minuten
 * einmal (rund 1.000 Reads), egal wie viele Abfragen darauf laufen - bei
 * `maxInstances: 10` eine feste Obergrenze. Der Nachtlauf der Benachrichtigung
 * und die Trefferzahlen im Konto profitieren genauso.
 *
 * Dieselben Bedingungen wie in der Query wertet `erfuellt` aus; welche das
 * sind, bestimmt allein `buildQuery`. Der indizierte Weg (Seiten von 50, Zaehlung
 * per Aggregation) bleibt, wo er geht - er ist billiger als jedes Abbild.
 *
 * `gelesen` ist die Zahl der Dokumente, die DIESER Aufruf aus Firestore gelesen
 * hat: beim Neuladen der Bestand, sonst 0.
 */
async function aktiveStellen(): Promise<{ stand: Schnappschuss; gelesen: number }> {
  const jetzt = Date.now();
  if (ladung && jetzt - ladung.seit < SCHNAPPSCHUSS_MS) return { stand: await ladung.ergebnis, gelesen: 0 };
  // Gleichzeitige Aufrufe teilen sich eine Ladung, statt jeder fuer sich zu lesen.
  const neu = { seit: jetzt, ergebnis: ladeAktiveStellen() };
  ladung = neu;
  try {
    const stand = await neu.ergebnis;
    return { stand, gelesen: stand.stellen.length };
  } catch (fehler) {
    // Ein gescheiterter Lauf darf nicht fuenf Minuten lang zwischengespeichert bleiben.
    if (ladung === neu) ladung = null;
    throw fehler;
  }
}

/** Nur fuer Tests: das naechste Abfrage liest den Bestand neu. */
export function vergissSchnappschuss(): void {
  ladung = null;
}

export async function queryJobs(filter: JobQueryFilter): Promise<JobQueryResult> {
  const { query, bedingungen, restTokens, ortRestTokens, nachfilter } = buildQuery(filter);
  const sortierung = filter.sortierung ?? STANDARD_SORTIERUNG;
  const limit = filter.limit ?? STANDARD_LIMIT;

  const cursor = filter.cursor ? decodeCursor(filter.cursor) : null;
  if (filter.cursor && !cursor) throw new CursorUngueltigError();

  const brauchtNachfilter =
    restTokens.length > 0 || ortRestTokens.length > 0 || nachfilter.length > 0 || filter.alter !== undefined;
  // Die Besoldungs-Bereichsabfrage zwingt Firestore, zuerst nach `bisStufe` zu
  // sortieren. Damit ist die gewünschte Reihenfolge nicht herstellbar - dieser
  // Fall geht deshalb ebenfalls über den Speicher.
  const imSpeicher = brauchtNachfilter || filter.mindestbesoldung !== undefined;

  if (!imSpeicher) {
    try {
      return await seiteUeberIndex(query, sortierung, limit, cursor);
    } catch (err) {
      // Fehlender zusammengesetzter Index. Statt dem Nutzer einen Fehler zu
      // zeigen, fallen wir auf den unsortierten Weg zurück und sortieren selbst.
      // Geloggt werden nur Feldnamen, nie Werte.
      if ((err as { code?: number }).code !== FAILED_PRECONDITION) throw err;
      console.warn("queryJobs: kein Index für sortierte Query, Rückfall auf Speicher-Sortierung", {
        sortierung,
        facetten: Object.keys(filter).filter((k) => filter[k as keyof JobQueryFilter] !== undefined),
      });
    }
  }

  const { stand, gelesen } = await aktiveStellen();
  const geladen: Treffer[] = stand.stellen
    .filter((eintrag) => bedingungen.every((bedingung) => erfuellt(eintrag.daten, bedingung)))
    // Flache Kopie je Aufruf: die Treffer gehen an den Aufrufer, das Abbild
    // bleibt fuer die naechsten Abfragen stehen.
    .map((eintrag) => ({ ...eintrag.stelle, pinstGuid: eintrag.id }));

  return seiteImSpeicher(
    geladen,
    filter,
    nachfilter,
    restTokens,
    ortRestTokens,
    sortierung,
    limit,
    cursor?.typ === "speicher" ? cursor.offset : 0,
    gelesen,
    stand.deckelErreicht,
  );
}
