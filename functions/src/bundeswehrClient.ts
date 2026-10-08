import { logger } from "firebase-functions/v2";
import { klassifiziereDetailAntwort, type Veroeffentlichung } from "./lib/archivEntscheidung";
import type {
  BatchOperation,
  BatchResult,
  JobDocument,
  JobSummary,
  RawAttSuchauftrag,
  RawStellensuche,
} from "./types";

/**
 * Client für die öffentliche, unauthentifizierte OData-Schnittstelle des
 * Bundeswehr-Bewerbungsportals (Service BWD_ER2_EREC_EXT_UNREG_SRV).
 *
 * Verhalten der Schnittstelle:
 * - Direkter GET auf Stellensuche_Set / AttSuchauftragSet wird von einer
 *   WAF mit 404 blockiert. Nur POST .../$batch (multipart/mixed) funktioniert,
 *   exakt wie die Web-App es macht. Kein Login/Cookie/CSRF nötig.
 * - Volltext (JobDesc/RequireDesc/RemarcDesc/ContactDesc/CompanyDesc) und
 *   die vollen Wertehilfe-Felder (HierarchyLevel, Industry, Latitude, ...)
 *   sind nur über den Key-basierten Zugriff Stellensuche_Set(Langu=..,PinstGuid=..)
 *   befüllt, NICHT über die gefilterte Listenabfrage.
 * - Geforderte Dokumente liefert AttSuchauftragSet?$filter=PinstGuid eq '...'
 *   (nicht bei jeder Stelle befüllt - manche Stellen fordern Unterlagen nur
 *   als Freitext in ContactDesc/RequireDesc an).
 */

const BASE_URL = "https://bewerbung.bundeswehr-karriere.de/erece/unreg/";
const SAP_CLIENT = "300";

/**
 * Die 8 SearchCategory-Codes, die die "Alle Stellen"-Ansicht der Web-App
 * per OR-Filter kombiniert. SearchCategory ist beim Listing kontextabhängig
 * (spiegelt nur den getroffenen Filterzweig wider) - diese Codes sind daher
 * ausschließlich als Filter-Parameter zu verstehen, nicht als stabile
 * Job-Eigenschaft. Falls die Bundeswehr künftig weitere Codes einführt,
 * würden diese hier fehlen - siehe Hinweis in sync.ts / syncRuns-Log.
 */
export const ALL_SEARCH_CATEGORY_CODES = [
  "0020",
  "0021",
  "0022",
  "0023",
  "0025",
  "0026",
  "0027",
  "0028",
];

const LIST_PAGE_SIZE = 1000;

/**
 * Bewusst konservative Drosselung: die Bundeswehr-API ist öffentlich, aber
 * fremdbetrieben und nicht für Bulk-Zugriffe gedacht. Kleine Chunks, spürbare
 * Pausen mit Jitter (keine exakt gleichmäßige, "robotische" Taktung) und
 * striktes Sequenziell-bleiben (keine parallelen Chunk-Requests) - das
 * Sync-Design in sync.ts sorgt zusätzlich dafür, dass im Normalbetrieb pro
 * Tag nur für NEUE Stellen überhaupt ein Detail-Request nötig ist.
 */
const DETAIL_CHUNK_SIZE = 15;
const CHUNK_DELAY_BASE_MS = 1500;
const CHUNK_DELAY_JITTER_MS = 750;
const LIST_PAGE_DELAY_MS = 500;
const MAX_CHUNK_RETRIES = 2;

const BATCH_HEADERS = (contentType: string) => ({
  "Content-Type": contentType,
  Accept: "multipart/mixed",
  "X-Requested-With": "XMLHttpRequest",
  DataServiceVersion: "2.0",
  MaxDataServiceVersion: "2.0",
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleepWithJitter(baseMs: number, jitterMs: number): Promise<void> {
  return sleep(baseMs + Math.random() * jitterMs);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMultipartBody(operations: BatchOperation[], boundary: string): string {
  const parts = operations.map((op) => {
    return (
      `--${boundary}\r\n` +
      `Content-Type: application/http\r\n` +
      `Content-Transfer-Encoding: binary\r\n\r\n` +
      `GET ${op.path} HTTP/1.1\r\n` +
      `Accept: application/json\r\n` +
      `Accept-Language: de\r\n` +
      `DataServiceVersion: 2.0\r\n` +
      `MaxDataServiceVersion: 2.0\r\n` +
      `X-Requested-With: XMLHttpRequest\r\n\r\n`
    );
  });
  return "\r\n" + parts.join("\r\n") + "\r\n" + `--${boundary}--\r\n`;
}

/**
 * Zerlegt eine multipart/mixed $batch-Antwort in einzelne Ergebnisse,
 * in derselben Reihenfolge wie die angefragten Operationen.
 */
function parseMultipartResponse(text: string, responseContentType: string | null): BatchResult[] {
  const boundaryMatch = responseContentType?.match(/boundary=("?)([^;"]+)\1/i);
  if (!boundaryMatch) {
    throw new Error(
      `Konnte Boundary nicht aus Content-Type der $batch-Antwort lesen: ${responseContentType}`,
    );
  }
  const boundary = boundaryMatch[2];
  const delimiter = new RegExp(`--${escapeRegExp(boundary)}(--)?\\r?\\n?`, "g");
  const rawParts = text.split(delimiter).filter((part) => part && part.trim().length > 0);

  const results: BatchResult[] = [];
  for (const part of rawParts) {
    const statusMatch = part.match(/HTTP\/1\.1 (\d+)/);
    if (!statusMatch) {
      // Kein inneres HTTP-Response-Fragment (z.B. Batch-Wrapper-Reste) - überspringen.
      continue;
    }
    const status = Number(statusMatch[1]);
    const headerBodySplit = part.slice(statusMatch.index! + statusMatch[0].length);
    const separatorIndex = headerBodySplit.search(/\r?\n\r?\n/);
    const rawBody = separatorIndex >= 0 ? headerBodySplit.slice(separatorIndex).trim() : "";

    let body: unknown = null;
    if (rawBody.startsWith("{") || rawBody.startsWith("[")) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = null;
      }
    }

    results.push({
      status,
      ok: status >= 200 && status < 300,
      body,
      rawText: rawBody,
    });
  }
  return results;
}

/**
 * Führt einen OData $batch-POST mit den angegebenen GET-Operationen aus.
 * Wirft nur bei Netzwerk-/Transportfehlern oder wenn der $batch-Request
 * selbst fehlschlägt (nicht bei einzelnen fehlgeschlagenen Operationen -
 * die kommen als BatchResult mit ok=false zurück).
 */
export async function odataBatch(operations: BatchOperation[]): Promise<BatchResult[]> {
  const boundary = `batch_${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
  const body = buildMultipartBody(operations, boundary);

  const res = await fetch(`${BASE_URL}$batch?sap-client=${SAP_CLIENT}`, {
    method: "POST",
    headers: BATCH_HEADERS(`multipart/mixed;boundary=${boundary}`),
    body,
  });

  if (!res.ok) {
    throw new Error(`$batch-Request fehlgeschlagen: HTTP ${res.status}`);
  }

  const text = await res.text();
  return parseMultipartResponse(text, res.headers.get("content-type"));
}

async function odataBatchWithRetry(operations: BatchOperation[]): Promise<BatchResult[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
    try {
      return await odataBatch(operations);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_CHUNK_RETRIES) {
        await sleep(1000 * 2 ** attempt);
      }
    }
  }
  throw lastError;
}

function buildListFilter(skip: number): BatchOperation {
  const categoryFilter = ALL_SEARCH_CATEGORY_CODES.map((c) => `SearchCategory eq '${c}'`).join(
    " or ",
  );
  const filter = `Langu eq 'D' and (${categoryFilter})`;
  // Region und Country liefert die Listenzeile frei mit. Ohne sie fehlt das
  // Bundesland: eine Suche nach "Brandenburg" faende keine Stellen in
  // Schoenewalde. Kostet keinen zusaetzlichen Request und
  // erreicht auch BEKANNTE Stellen, fuer die kein Detailabruf laeuft.
  const select = "PinstGuid,RefCode,Title,Langu,Region,Country";
  const path =
    `Stellensuche_Set?sap-client=${SAP_CLIENT}` +
    `&$skip=${skip}&$top=${LIST_PAGE_SIZE}` +
    `&$filter=${encodeURIComponent(filter)}` +
    `&$select=${select}`;
  return { path };
}

/**
 * Lädt alle aktiven Ausschreibungen (Übersichtsfelder, kein Volltext) über
 * die 8 SearchCategory-Codes der "Alle Stellen"-Ansicht, paginiert per
 * $skip/$top. Dedupliziert nach PinstGuid zur Sicherheit.
 */
export async function listAllJobSummaries(): Promise<JobSummary[]> {
  const byGuid = new Map<string, JobSummary>();
  let skip = 0;

  for (;;) {
    const [result] = await odataBatchWithRetry([buildListFilter(skip)]);
    if (!result.ok || !result.body) {
      throw new Error(`Listing-Abfrage bei $skip=${skip} fehlgeschlagen (HTTP ${result.status})`);
    }
    const body = result.body as { d: { results: RawStellensuche[] } };
    const page = body.d.results;

    for (const row of page) {
      byGuid.set(row.PinstGuid, {
        pinstGuid: row.PinstGuid,
        langu: row.Langu,
        refCode: row.RefCode,
        title: row.Title,
        region: row.Region ?? "",
        country: row.Country ?? "",
      });
    }

    if (page.length < LIST_PAGE_SIZE) {
      // Das Listing kann genau an der Seitengrenze enden, die naechste Seite
      // ist dann leer. Ob das ein Deckel der API ist, laesst sich von
      // aussen nicht sicher sagen - im Log soll es aber auffallen. Fehlende
      // Stellen archiviert der Sync deshalb nur nach Detailabruf (s.
      // lib/archivEntscheidung.ts).
      if (page.length === 0 && skip > 0) {
        logger.warn("listAllJobSummaries: Listing endet genau an der Seitengrenze, moeglicher Deckel der API", {
          anzahl: byGuid.size,
          seitengroesse: LIST_PAGE_SIZE,
        });
      }
      break;
    }
    skip += LIST_PAGE_SIZE;
    await sleep(LIST_PAGE_DELAY_MS);
  }

  return [...byGuid.values()];
}

/**
 * Baut den zusätzlichen $filter-Teil für Organisationsbereich/Laufbahngruppe.
 * Feldnamen und Verhalten entsprechen den Abfragen des echten Portals:
 * `FunctionalArea` (Organisations-
 * bereich, z.B. Heer/Luftwaffe/Marine) und `HierarchyLevel` (Laufbahngruppe,
 * z.B. Mannschaften/Unteroffizier/Offizier) sind beim Key-basierten GET IMMER
 * leer (serverseitige Redaktion auf dem Lesepfad), lassen sich aber korrekt
 * per $filter einschränken - das Portal selbst nutzt exakt diese beiden
 * Felder für seine "Organisationsbereich"/"Laufbahngruppe"-Filter. Mehrere
 * Werte im selben Feld werden OR-gruppiert, Felder untereinander UND-
 * verknüpft (identisch zur SearchCategory-Gruppierung oben).
 */
function buildOrganisationsbereichLaufbahngruppeFilter(
  organisationsbereich: string[],
  laufbahngruppe: string[],
): string {
  const clauses: string[] = [];
  if (laufbahngruppe.length > 0) {
    clauses.push(`(${laufbahngruppe.map((c) => `HierarchyLevel eq '${c}'`).join(" or ")})`);
  }
  if (organisationsbereich.length > 0) {
    clauses.push(`(${organisationsbereich.map((c) => `FunctionalArea eq '${c}'`).join(" or ")})`);
  }
  return clauses.join(" and ");
}

function buildFilteredPinstGuidsFilter(
  organisationsbereich: string[],
  laufbahngruppe: string[],
  skip: number,
): BatchOperation {
  const categoryFilter = ALL_SEARCH_CATEGORY_CODES.map((c) => `SearchCategory eq '${c}'`).join(
    " or ",
  );
  const extra = buildOrganisationsbereichLaufbahngruppeFilter(organisationsbereich, laufbahngruppe);
  const filter = `${extra ? `${extra} and ` : ""}Langu eq 'D' and (${categoryFilter})`;
  const path =
    `Stellensuche_Set?sap-client=${SAP_CLIENT}` +
    `&$skip=${skip}&$top=${LIST_PAGE_SIZE}` +
    `&$filter=${encodeURIComponent(filter)}` +
    `&$select=PinstGuid`;
  return { path };
}

/**
 * Live-Filterabfrage gegen die echte API für Organisationsbereich/
 * Laufbahngruppe - liefert nur PinstGuids, da diese beiden Felder
 * selbst nicht auslesbar sind (s.o.). Wird vom Aufrufer gecacht
 * (Facetten-Index beim Sync, s. deriveJobFacets.ts) und NICHT bei jedem
 * Nutzer-Login neu aufgerufen, sondern nur bei einer neuen/abgelaufenen
 * Filter-Kombination.
 */
export async function fetchFilteredPinstGuids(
  organisationsbereich: string[],
  laufbahngruppe: string[],
): Promise<string[]> {
  const guids: string[] = [];
  let skip = 0;

  for (;;) {
    const [result] = await odataBatchWithRetry([
      buildFilteredPinstGuidsFilter(organisationsbereich, laufbahngruppe, skip),
    ]);
    if (!result.ok || !result.body) {
      throw new Error(
        `Gefilterte Listing-Abfrage bei $skip=${skip} fehlgeschlagen (HTTP ${result.status})`,
      );
    }
    const body = result.body as { d: { results: { PinstGuid: string }[] } };
    const page = body.d.results;
    guids.push(...page.map((r) => r.PinstGuid));

    if (page.length < LIST_PAGE_SIZE) {
      break;
    }
    skip += LIST_PAGE_SIZE;
    await sleep(LIST_PAGE_DELAY_MS);
  }

  return guids;
}

export interface JobDetailResult {
  pinstGuid: string;
  detail: RawStellensuche | null;
  documents: JobDocument[];
  error: string | null;
}

/**
 * Die Bundeswehr-API liefert `AttachmentUrl` teils host-relativ (z.B.
 * "/erece/unregattach?..."). Wird beim Sync normalisiert, damit
 * `documents[].downloadUrl` in Firestore immer eine absolute URL ist -
 * exportiert, damit Cloud Functions, die die Vorlage serverseitig
 * herunterladen, einen gespeicherten relativen Pfad defensiv genauso
 * auflösen.
 */
export function resolveDownloadUrl(url: string): string {
  return new URL(url, "https://bewerbung.bundeswehr-karriere.de").toString();
}

/**
 * Einziger Host, von dem der Sync Anhaenge herunterlaedt.
 *
 * WOZU: `AttachmentUrl` kommt aus einer
 * fremden API, und `resolveDownloadUrl` laesst eine ABSOLUTE URL unveraendert
 * durch. Ohne Pruefung haette der Sync jeden Host abgerufen, den die Antwort
 * nennt, und das Ergebnis als oeffentlichen Anhang abgelegt. Die Anhaenge
 * der Ausschreibungen liegen auf diesem Host (`/erece/unregattach`), als
 * PDF, ohne Weiterleitung.
 */
export const ANHANG_HOST = "bewerbung.bundeswehr-karriere.de";

export function istBundeswehrAnhangUrl(url: string): boolean {
  try {
    const geparst = new URL(url);
    return geparst.protocol === "https:" && geparst.hostname === ANHANG_HOST && geparst.port === "";
  } catch {
    return false;
  }
}

function toJobDocument(raw: RawAttSuchauftrag): JobDocument {
  return {
    attHeader: raw.AttHeader,
    attType: raw.AttType,
    attTypeTxt: raw.AttTypeTxt ?? "",
    category: raw.Category ?? "",
    subcategory: raw.Subcategory ?? "",
    attachment: raw.Attachment,
    sizeLabel: raw.Size,
    contentType: raw.ContentType,
    downloadUrl: resolveDownloadUrl(raw.AttachmentUrl),
  };
}

function buildDetailOperations(pinstGuid: string): [BatchOperation, BatchOperation] {
  const detailPath = `Stellensuche_Set(Langu='D',PinstGuid='${pinstGuid}')?sap-client=${SAP_CLIENT}`;
  const attachmentsFilter = encodeURIComponent(`PinstGuid eq '${pinstGuid}'`);
  const attachmentsPath = `AttSuchauftragSet?sap-client=${SAP_CLIENT}&$filter=${attachmentsFilter}`;
  return [{ path: detailPath }, { path: attachmentsPath }];
}

/**
 * Holt Volltext + Dokumentenliste für einen Chunk von PinstGuids in einem
 * einzigen $batch-Request (2 Operationen pro Job). Ein fehlgeschlagenes
 * Chunk wird komplett retried (odataBatchWithRetry); eine fehlgeschlagene
 * Einzeloperation innerhalb eines erfolgreichen Chunks landet als Fehler
 * im jeweiligen JobDetailResult, ohne die anderen Jobs im Chunk zu beeinträchtigen.
 */
async function fetchDetailsChunk(pinstGuids: string[]): Promise<JobDetailResult[]> {
  const operations = pinstGuids.flatMap((guid) => buildDetailOperations(guid));
  const results = await odataBatchWithRetry(operations);

  const out: JobDetailResult[] = [];
  for (let i = 0; i < pinstGuids.length; i++) {
    const pinstGuid = pinstGuids[i];
    const detailResult = results[i * 2];
    const attachmentsResult = results[i * 2 + 1];

    let detail: RawStellensuche | null = null;
    let documents: JobDocument[] = [];
    let error: string | null = null;

    if (detailResult?.ok && detailResult.body) {
      detail = (detailResult.body as { d: RawStellensuche }).d;
    } else {
      error = `Detail-Abruf fehlgeschlagen (HTTP ${detailResult?.status ?? "?"})`;
    }

    if (attachmentsResult?.ok && attachmentsResult.body) {
      const body = attachmentsResult.body as { d: { results: RawAttSuchauftrag[] } };
      documents = body.d.results.map(toJobDocument);
    } else if (!error) {
      error = `Dokumenten-Abruf fehlgeschlagen (HTTP ${attachmentsResult?.status ?? "?"})`;
    }

    out.push({ pinstGuid, detail, documents, error });
  }
  return out;
}

/**
 * Holt Volltext + Dokumente für alle übergebenen PinstGuids, in kleinen
 * Chunks (Default 15 Jobs = 30 Batch-Operationen pro HTTP-Request) mit
 * spürbarer, gejitterter Pause dazwischen (1.5-2.25s), um die Bundeswehr-
 * Server nicht zu belasten und kein auffällig gleichmäßiges Bot-Muster zu
 * erzeugen. sync.ts ruft dies im Normalbetrieb nur mit den PinstGuids NEUER
 * Stellen auf, nicht mit dem gesamten aktiven Bestand.
 */
export async function fetchAllJobDetails(
  pinstGuids: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<JobDetailResult[]> {
  const results: JobDetailResult[] = [];

  for (let i = 0; i < pinstGuids.length; i += DETAIL_CHUNK_SIZE) {
    const chunk = pinstGuids.slice(i, i + DETAIL_CHUNK_SIZE);
    try {
      const chunkResults = await fetchDetailsChunk(chunk);
      results.push(...chunkResults);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const pinstGuid of chunk) {
        results.push({ pinstGuid, detail: null, documents: [], error: message });
      }
    }
    onProgress?.(results.length, pinstGuids.length);
    if (i + DETAIL_CHUNK_SIZE < pinstGuids.length) {
      await sleepWithJitter(CHUNK_DELAY_BASE_MS, CHUNK_DELAY_JITTER_MS);
    }
  }

  return results;
}

/**
 * Prueft fuer Stellen, die im Listing fehlen, ob sie noch veroeffentlicht
 * sind (s. lib/archivEntscheidung.ts). Fragt nur `PinstGuid` ab - die Antwort
 * ist ein paar hundert Byte, kein Volltext, und wird sofort auf einen der
 * drei Werte reduziert. Gleiche Drosselung wie der Detailabruf: Chunks zu
 * DETAIL_CHUNK_SIZE Stellen in EINEM $batch, streng nacheinander, mit
 * gejitterter Pause. Scheitert ein Chunk auch nach den Wiederholungen, sind
 * seine Stellen "unklar" - sie bleiben aktiv und werden naechste Nacht neu
 * geprueft.
 */
export async function pruefeVeroeffentlichung(pinstGuids: string[]): Promise<Map<string, Veroeffentlichung>> {
  const befund = new Map<string, Veroeffentlichung>();
  for (let i = 0; i < pinstGuids.length; i += DETAIL_CHUNK_SIZE) {
    const chunk = pinstGuids.slice(i, i + DETAIL_CHUNK_SIZE);
    try {
      const antworten = await odataBatchWithRetry(
        chunk.map((guid) => ({
          path: `Stellensuche_Set(Langu='D',PinstGuid='${guid}')?sap-client=${SAP_CLIENT}&$select=PinstGuid`,
        })),
      );
      chunk.forEach((guid, j) => befund.set(guid, klassifiziereDetailAntwort(antworten[j], guid)));
    } catch {
      for (const guid of chunk) befund.set(guid, "unklar");
    }
    if (i + DETAIL_CHUNK_SIZE < pinstGuids.length) {
      await sleepWithJitter(CHUNK_DELAY_BASE_MS, CHUNK_DELAY_JITTER_MS);
    }
  }
  return befund;
}

/**
 * Lädt die Vertragsart-Wertehilfe (Code -> Klartext-Label). Diese Entität
 * ist - anders als Stellensuche_Set/AttSuchauftragSet - direkt per GET
 * erreichbar (kein $batch nötig, kein 404 von der WAF).
 */
export async function fetchVertragsartLabels(): Promise<Map<string, string>> {
  const res = await fetch(
    `${BASE_URL}Wertehilfen_Vertragsart?sap-client=${SAP_CLIENT}&$top=100`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(`Wertehilfen_Vertragsart-Abruf fehlgeschlagen: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { d: { results: { Key: string; Value: string }[] } };
  return new Map(json.d.results.map((row) => [row.Key, row.Value]));
}
