import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import {
  fetchAllJobDetails,
  fetchVertragsartLabels,
  listAllJobSummaries,
  pruefeVeroeffentlichung,
} from "./bundeswehrClient";
import { buildFacetIndex, facetsFor } from "./deriveJobFacets";
import { extractJobAttributes } from "./extractJobAttributes";
import { storeJobDocuments } from "./jobDocumentStore";
import { ARCHIV_TAGE, istAbgelaufen, istArchivReif } from "./lib/abgelaufen";
import { toApplicationEndSortKey } from "./lib/applicationEndSortKey";
import { spanneAusTarifgruppen } from "./lib/besoldungsSpanne";
import { JOBS_V2_COLLECTION, baueV2, v2Teilaktualisierung } from "./lib/jobsV2Shape";
import { einstiegswegAus } from "./lib/einstiegsweg";
import { annotateGlossaryTerms, type GlossaryTermRef } from "./lib/glossaryAnnotate";
import { entscheideArchivierung } from "./lib/archivEntscheidung";
import { erzeugeSchreibpuffer } from "./lib/schreibPuffer";
import { buildOrtTokens, buildSuchTokens } from "./lib/suchTokens";
import {
  JOB_CONTENT_DOC_ID,
  JOB_CONTENT_SUBCOLLECTION,
  type JobAttributesRecord,
  type JobContentRecord,
  type JobDocumentRefRecord,
  type JobRecord,
  type JobSummary,
  type JobSummaryRecord,
  type RawStellensuche,
  type SyncSummary,
} from "./types";

const JOBS_COLLECTION = "jobs";
const SYNC_RUNS_COLLECTION = "syncRuns";
const GLOSSARY_COLLECTION = "glossary";
const MAX_LOGGED_ERRORS = 50;

/** Trennt den zusammengebauten `JobRecord` in Summary- und Content-Teildokument (s. types.ts). */
function splitJobRecord(record: JobRecord): { summary: JobSummaryRecord; content: JobContentRecord } {
  const { companyDesc, jobDesc, requireDesc, remarcDesc, contactDesc, ...summary } = record;
  return { summary, content: { companyDesc, jobDesc, requireDesc, remarcDesc, contactDesc } };
}

/** Lädt das Glossar für die Tooltip-Markierung neuer Ausschreibungen, s. annotateContent. */
async function loadGlossaryTerms(db: FirebaseFirestore.Firestore): Promise<GlossaryTermRef[]> {
  const snapshot = await db.collection(GLOSSARY_COLLECTION).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return { slug: doc.id, term: data.term as string, aliases: (data.aliases as string[] | undefined) ?? [] };
  });
}

/**
 * Markiert Bundeswehr-/öD-Jargon in den Volltextfeldern mit
 * `<span data-glossary-term>` (s. lib/glossaryAnnotate.ts), damit das
 * Frontend beim Rendern Tooltips zeigen kann, ohne selbst Text zu scannen.
 * Läuft nur für NEU entdeckte Stellen (s. runSync).
 */
function annotateContent(content: JobContentRecord, terms: GlossaryTermRef[]): JobContentRecord {
  if (terms.length === 0) return content;
  return {
    companyDesc: annotateGlossaryTerms(content.companyDesc, terms),
    jobDesc: annotateGlossaryTerms(content.jobDesc, terms),
    requireDesc: annotateGlossaryTerms(content.requireDesc, terms),
    remarcDesc: annotateGlossaryTerms(content.remarcDesc, terms),
    contactDesc: annotateGlossaryTerms(content.contactDesc, terms),
  };
}

/** "100.00" -> true. Fehlende/unparsbare Angabe gilt als Vollzeit (Normalfall). */
export function istVollzeit(arbeitszeit: string): boolean {
  const wert = parseFloat(arbeitszeit);
  return Number.isFinite(wert) ? wert >= 100 : true;
}

function toJobRecord(
  detail: RawStellensuche,
  /** Zeile aus dem Listing - traegt `Region`/`Country`, die der Detailabruf leer laesst. */
  listenzeile: JobSummary | undefined,
  dokumente: JobDocumentRefRecord[],
  contractTypeLabel: string | null,
  now: Timestamp,
): JobRecord {
  return {
    pinstGuid: detail.PinstGuid,
    refCode: detail.RefCode,
    title: detail.Title,

    contractType: detail.ContractType,
    contractTypeLabel,
    reqIndustry: detail.ReqIndustry,
    reqType: detail.ReqType,
    einstiegsweg: einstiegswegAus(detail.RefCode),

    besOrt: detail.BesOrt,
    region: listenzeile?.region ?? "",
    country: listenzeile?.country ?? "",
    latitude: detail.Latitude,
    longitude: detail.Longitude,

    applicationEnd: detail.ApplicationEnd,
    applicationEndSortKey: toApplicationEndSortKey(detail.ApplicationEnd),
    startDate: detail.StartDate,
    endDate: detail.EndDate,

    arbeitszeit: detail.Arbeitszeit,
    vollzeit: istVollzeit(detail.Arbeitszeit),

    tarifgruppe1: detail.Tarifgruppe1 ?? "",
    tarifgruppe2: detail.Tarifgruppe2 ?? "",

    // Amtliche Spanne aus Tarifgruppe1/2; die Dienstgrad-Ableitung als Fallback
    // hängt an der KI-Extraktion und wird dort ergänzt (s. unten).
    besoldung: spanneAusTarifgruppen(detail.Tarifgruppe1, detail.Tarifgruppe2),

    suchTokens: buildSuchTokens(detail.Title),
    ortTokens: buildOrtTokens(detail.BesOrt),
    dokumente,

    companyDesc: detail.CompanyDesc,
    jobDesc: detail.JobDesc,
    requireDesc: detail.RequireDesc,
    remarcDesc: detail.RemarcDesc,
    contactDesc: detail.ContactDesc,

    hotJob: detail.HotJob,
    firstSeenAt: now,
    lastSeenAt: now,
    lastDetailFetchAt: now,
    active: true,
    removedAt: null,
  };
}

/**
 * Synchronisiert alle aktiven Bundeswehr-Ausschreibungen nach Firestore -
 * bewusst so gebaut, dass die Bundeswehr-API im Normalbetrieb NICHT täglich
 * für den gesamten Bestand angefragt wird, sondern nur für
 * tatsächlich neu aufgetauchte PinstGuids:
 *
 * - neu           -> Volltext + Dokumente per API abrufen (einziger Fall mit API-Load)
 * - weiterhin aktiv -> nur `lastSeenAt` in Firestore aktualisieren, kein API-Call
 * - nicht mehr gelistet oder Frist abgelaufen -> `active: false` (raus aus jeder
 *   Suche, über den Link weiter lesbar)
 * - länger als ARCHIV_TAGE archiviert -> endgültig löschen (Dokument + Volltext).
 *   Diese zweite Stufe ist es, die die Sammlung davon abhält, unbegrenzt zu
 *   wachsen.
 *
 * Volltext bereits bekannter Stellen wird nicht periodisch aktualisiert:
 * Ausschreibungstexte ändern sich nach Veröffentlichung kaum.
 */
/**
 * @param geminiKey Wenn gesetzt, werden für NEUE Stellen die Anforderungen aus
 *   dem Fließtext extrahiert (s. extractJobAttributes.ts). Ohne Key läuft der
 *   Sync vollständig ohne KI - alle übrigen Felder inklusive der amtlichen
 *   Besoldungsspanne sind deterministisch.
 */
export async function runSync(
  onProgress?: (done: number, total: number) => void,
  geminiKey?: string,
): Promise<SyncSummary> {
  const db = getFirestore();
  const startedAt = new Date();
  const errors: string[] = [];

  let summaries;
  try {
    summaries = await listAllJobSummaries();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedSummary: SyncSummary = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      totalListed: 0,
      newCount: 0,
      unchangedCount: 0,
      removedCount: 0,
      archiviertGeloescht: 0,
      abgelaufenUebersprungen: 0,
      errorCount: 1,
      errors: [`Listing fehlgeschlagen, Sync abgebrochen: ${message}`],
    };
    await db.collection(SYNC_RUNS_COLLECTION).add(failedSummary);
    throw err;
  }

  const existingActiveSnapshot = await db
    .collection(JOBS_COLLECTION)
    .where("active", "==", true)
    .select("applicationEndSortKey")
    .get();
  const existingActiveIds = new Set(existingActiveSnapshot.docs.map((doc) => doc.id));
  // Bereits bekannte Stellen, deren Frist abgelaufen ist - werden unten geloescht
  // statt nur `lastSeenAt` zu bekommen. Die Bundeswehr-API listet sie teilweise
  // weiter, obwohl man sich nicht mehr bewerben kann.
  const jetztMs = Date.now();
  const abgelaufeneBekannte = new Set(
    existingActiveSnapshot.docs
      .filter((doc) => istAbgelaufen(doc.get("applicationEndSortKey")?.toMillis(), jetztMs))
      .map((doc) => doc.id),
  );

  // Einmal indizieren: die Listenzeile traegt `region`/`country`, die der
  // Detailabruf nicht liefert - und wird sowohl fuer neue als auch fuer
  // bekannte Stellen gebraucht.
  const summaryByGuid = new Map(summaries.map((s) => [s.pinstGuid, s]));

  const newGuids: string[] = [];
  const unchangedGuids: string[] = [];
  for (const summary of summaries) {
    if (existingActiveIds.has(summary.pinstGuid)) {
      unchangedGuids.push(summary.pinstGuid);
    } else {
      newGuids.push(summary.pinstGuid);
    }
  }
  const listedIds = new Set(summaries.map((s) => s.pinstGuid));
  const removedGuids = [...existingActiveIds].filter((id) => !listedIds.has(id));

  const contractTypeLabels =
    newGuids.length > 0
      ? await fetchVertragsartLabels().catch((err) => {
          errors.push(
            `Vertragsart-Labels konnten nicht geladen werden, contractTypeLabel bleibt leer: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return new Map<string, string>();
        })
      : new Map<string, string>();

  const detailResults =
    newGuids.length > 0 ? await fetchAllJobDetails(newGuids, onProgress) : [];

  const glossaryTerms =
    newGuids.length > 0
      ? await loadGlossaryTerms(db).catch((err) => {
          errors.push(
            `Glossar konnte nicht geladen werden, neue Stellen bleiben unannotiert: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return [];
        })
      : [];

  // Organisationsbereich/Laufbahngruppe sind in der Ausschreibung selbst nicht
  // auslesbar und werden deshalb ueber Filterabfragen hergeleitet (s.
  // deriveJobFacets.ts). Bewusst fuer ALLE aktiven Stellen, nicht nur die
  // neuen: unveraenderte Stellen bekaemen sonst nie einen Wert.
  const facetIndex = await buildFacetIndex().catch((err) => {
    errors.push(
      `Facetten (Organisationsbereich/Laufbahngruppe) konnten nicht hergeleitet werden: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  });

  const now = Timestamp.now();
  let newCount = 0;

  // Committet nach Anzahl UND nach Gewicht - s. lib/schreibPuffer.ts.
  const puffer = erzeugeSchreibpuffer(() => db.batch());
  let abgelaufenUebersprungen = 0;

  for (const result of detailResults) {
    if (!result.detail) {
      errors.push(`${result.pinstGuid}: ${result.error ?? "unbekannter Fehler"}`);
      continue;
    }
    // Die API listet auch Ausschreibungen, deren Bewerbungsschluss vorbei ist.
    // Die gar nicht erst aufnehmen: sonst legt der Sync genau die Stellen an,
    // die die Aufraeumung im selben Lauf wieder loescht - inklusive
    // Dokument-Downloads und (bei gesetztem Key) eines Gemini-Aufrufs pro Stueck.
    // Der Check kann erst hier stehen, nicht beim Listing: `listAllJobSummaries`
    // liefert nur PinstGuid/Titel/RefCode, kein `ApplicationEnd`.
    if (istAbgelaufen(toApplicationEndSortKey(result.detail.ApplicationEnd).toMillis(), jetztMs)) {
      abgelaufenUebersprungen++;
      continue;
    }
    const contractTypeLabel = contractTypeLabels.get(result.detail.ContractType) ?? null;
    // Anhänge einmalig ablegen und nur noch referenzieren (s. jobDocumentStore.ts).
    const dokumente = await storeJobDocuments(result.documents);
    const record = toJobRecord(result.detail, summaryByGuid.get(result.pinstGuid), dokumente, contractTypeLabel, now);
    const { summary, content } = splitJobRecord(record);

    // Anforderungs-Extraktion NUR für neue Stellen - das sind im Regelbetrieb
    // eine Handvoll pro Nacht, nicht der ganze Bestand. So bleibt das Feld
    // aktuell, ohne dass ein teurer Vollauf nötig wird.
    // Fehlschläge sind unkritisch: die Stelle bleibt ohne `jobAttributes` und
    // kann später nachgezogen werden.
    let jobAttributes: JobAttributesRecord | undefined;
    if (geminiKey) {
      try {
        jobAttributes = await extractJobAttributes(content, geminiKey);
      } catch (err) {
        errors.push(
          `${result.pinstGuid}: Anforderungs-Extraktion fehlgeschlagen: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    const annotatedContent = annotateContent(content, glossaryTerms);
    const ref = db.collection(JOBS_COLLECTION).doc(result.pinstGuid);
    const datensatz = {
      ...summary,
      ...(facetIndex ? facetsFor(facetIndex, result.pinstGuid) : {}),
      ...(jobAttributes ? { jobAttributes } : {}),
      // Fallback für die Besoldung: hat die Ausschreibung keine Tarifgruppen,
      // aber die KI einen Dienstgrad gefunden, dann daraus die Spanne bilden.
      ...(summary.besoldung === null && jobAttributes?.besoldung
        ? {
            besoldung: {
              von: `A${jobAttributes.besoldung.von}`,
              bis: `A${jobAttributes.besoldung.bis}`,
              tabelle: "A" as const,
              vonStufe: jobAttributes.besoldung.von,
              bisStufe: jobAttributes.besoldung.bis,
              quelle: "dienstgrad" as const,
            },
          }
        : {}),
    };
    // Spiegel nach jobsV2, aus DEMSELBEN Datensatz und ueber eine gemeinsame
    // Formgebung - s. lib/jobsV2Shape.ts.
    const v2Ref = db.collection(JOBS_V2_COLLECTION).doc(result.pinstGuid);
    await puffer.schreibeGruppe([
      { vorgang: (b) => b.set(ref, datensatz), art: "schwer" },
      { vorgang: (b) => b.set(ref.collection(JOB_CONTENT_SUBCOLLECTION).doc(JOB_CONTENT_DOC_ID), annotatedContent) },
      { vorgang: (b) => b.set(v2Ref, baueV2(datensatz as Record<string, unknown>)), art: "schwer" },
      { vorgang: (b) => b.set(v2Ref.collection(JOB_CONTENT_SUBCOLLECTION).doc(JOB_CONTENT_DOC_ID), annotatedContent) },
    ]);
    newCount++;
  }

  // `einstiegsweg` wird hier MIT aktualisiert, nicht nur bei neuen Stellen: der
  // Wert haengt allein am refCode, und der steht schon in der Listenabfrage. Ein
  // Sync-Lauf haelt das Feld damit fuer den gesamten Bestand aktuell.

  for (const pinstGuid of unchangedGuids) {
    if (abgelaufeneBekannte.has(pinstGuid)) continue;
    const ref = db.collection(JOBS_COLLECTION).doc(pinstGuid);
    const aktualisierung = {
      lastSeenAt: now,
      einstiegsweg: einstiegswegAus(summaryByGuid.get(pinstGuid)?.refCode ?? ""),
      // Aus der Listenzeile, also auch fuer bekannte Stellen ohne Detailabruf.
      region: summaryByGuid.get(pinstGuid)?.region ?? "",
      country: summaryByGuid.get(pinstGuid)?.country ?? "",
      ...(facetIndex ? facetsFor(facetIndex, pinstGuid) : {}),
    };
    // `set` mit merge statt `update` fuer jobsV2: eine Stelle kann dort noch
    // ohne Dokument sein - `update` wuerde den ganzen Batch scheitern lassen.
    await puffer.schreibeGruppe([
      { vorgang: (b) => b.update(ref, aktualisierung) },
      {
        vorgang: (b) =>
          b.set(db.collection(JOBS_V2_COLLECTION).doc(pinstGuid), v2Teilaktualisierung(aktualisierung), { merge: true }),
      },
    ]);
  }

  // ── Stufe 1: raus aus der Suche, aber noch nicht weg ────────────────────
  // Frist abgelaufen ODER vom Detailabruf als zurueckgezogen bestaetigt ->
  // `active: false`. Nur "fehlt im Listing" reicht nicht, s.
  // lib/archivEntscheidung.ts. Damit verschwindet die Stelle aus JEDER Suche
  // (Web-Liste und list_jobs filtern beide auf `active == true`), bleibt aber
  // ueber ihren Link lesbar - der Fall "auf welche Stelle hatte ich mich
  // nochmal beworben?".
  const archiv = await entscheideArchivierung(removedGuids, abgelaufeneBekannte, pruefeVeroeffentlichung);
  logger.info("runSync: Archivierung entschieden", archiv.zaehlung);
  if (archiv.unklar.length > 0) {
    errors.push(
      `${archiv.unklar.length} nicht gelistete Stellen konnten nicht geprueft werden und bleiben bis zum naechsten Lauf aktiv`,
    );
  }
  // Fehlt im Listing, ist aber noch veroeffentlicht: bleibt aktiv und gilt als
  // gesehen. Region/Land fehlen ohne Listenzeile - die bleiben, wie sie sind.
  for (const pinstGuid of archiv.nochVeroeffentlicht) {
    await puffer.schreibeGruppe([
      { vorgang: (b) => b.update(db.collection(JOBS_COLLECTION).doc(pinstGuid), { lastSeenAt: now }) },
      { vorgang: (b) => b.set(db.collection(JOBS_V2_COLLECTION).doc(pinstGuid), { lastSeenAt: now }, { merge: true }) },
    ]);
  }
  for (const pinstGuid of archiv.archivieren) {
    await puffer.schreibeGruppe([
      { vorgang: (b) => b.update(db.collection(JOBS_COLLECTION).doc(pinstGuid), { active: false, removedAt: now }), art: "schwer" },
      {
        vorgang: (b) => b.set(db.collection(JOBS_V2_COLLECTION).doc(pinstGuid), { active: false, removedAt: now }, { merge: true }),
        art: "schwer",
      },
    ]);
  }

  // ── Stufe 2: endgueltig loeschen, was lange genug im Archiv lag ──────────
  // Ohne diese Stufe waechst die Sammlung unbegrenzt. Mit ihr erreicht das
  // Archiv einen stabilen Umfang (s. ARCHIV_TAGE): hinten faellt genauso viel
  // heraus, wie vorn hereinkommt.
  const archivSnapshot = await db
    .collection(JOBS_COLLECTION)
    .where("active", "==", false)
    .where("removedAt", "<", Timestamp.fromMillis(jetztMs - ARCHIV_TAGE * 24 * 60 * 60 * 1000))
    .select("removedAt")
    .get();
  let geloescht = 0;
  for (const doc of archivSnapshot.docs) {
    if (!istArchivReif((doc.get("removedAt") as Timestamp | undefined)?.toMillis(), jetztMs)) continue;
    // Firestore loescht Subcollections NICHT mit dem Elterndokument - der
    // Volltext bliebe sonst als unerreichbares Waisendokument liegen.
    // Derselbe Schnitt in jobsV2 - sonst bleibt dort ein Waisenbestand liegen,
    // der nie wieder aufgeraeumt wird. Alle vier in EINEM Commit (s.
    // schreibeGruppe), sonst entsteht genau diese Waise bei einem Abbruch.
    const v2Alt = db.collection(JOBS_V2_COLLECTION).doc(doc.id);
    await puffer.schreibeGruppe([
      { vorgang: (b) => b.delete(doc.ref.collection(JOB_CONTENT_SUBCOLLECTION).doc(JOB_CONTENT_DOC_ID)), art: "schwer" },
      { vorgang: (b) => b.delete(doc.ref), art: "schwer" },
      { vorgang: (b) => b.delete(v2Alt.collection(JOB_CONTENT_SUBCOLLECTION).doc(JOB_CONTENT_DOC_ID)), art: "schwer" },
      { vorgang: (b) => b.delete(v2Alt), art: "schwer" },
    ]);
    geloescht++;
  }

  await puffer.abschliessen();

  const summary: SyncSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    totalListed: summaries.length,
    newCount,
    unchangedCount: unchangedGuids.length - abgelaufeneBekannte.size,
    removedCount: archiv.archivieren.length,
    archiviertGeloescht: geloescht,
    abgelaufenUebersprungen,
    errorCount: errors.length,
    errors: errors.slice(0, MAX_LOGGED_ERRORS),
  };

  await db.collection(SYNC_RUNS_COLLECTION).add(summary);

  return summary;
}
