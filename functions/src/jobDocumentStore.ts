/**
 * Ablage der Ausschreibungs-Anhänge: jedes Dokument wird EINMAL heruntergeladen
 * und dedupliziert gespeichert, die Ausschreibungen verweisen nur darauf.
 *
 * WARUM: Die meisten Dokument-Verweise zeigen auf dieselben wenigen Dateien.
 * "Bewerbungsbogen_Militärisch" hängt an sehr vielen Ausschreibungen - ist
 * aber eine Datei.
 *
 * Zwei weitere Effekte, die wichtiger sind als der Speicherplatz:
 *  - `fill_bewerbungsbogen` lädt die Vorlage nicht bei jedem Aufruf live
 *    von der Bundeswehr, sondern aus unserem Storage.
 *  - Die Vorlage bleibt verfügbar, wenn der Bundeswehr-Link nach
 *    Bewerbungsschluss stirbt.
 *
 * Deduplizierungs-Schlüssel ist der fachliche Teil des SAP-Links
 * (`cand_hrobject` + `attachment`), nicht die volle URL: sie enthält noch
 * sap-client/sap-language, die für die Identität des Dokuments irrelevant sind.
 */
import { createHash } from "node:crypto";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { istBundeswehrAnhangUrl, resolveDownloadUrl } from "./bundeswehrClient";
import { erkenneTyp } from "./mappe/uploadRegeln";
import type { JobDocument } from "./types";

export const JOB_DOCUMENTS_COLLECTION = "jobDocuments";
const STORAGE_PREFIX = "jobDocuments";
/** Schutz gegen Ausreißer - echte Dokumente sind nur wenige MB groß. */
export const MAX_ANHANG_BYTES = 25 * 1024 * 1024;

type Abruf = (url: string, init: RequestInit) => Promise<Response>;

/** Ein Anhang ist ein paar MB gross; eine Minute reicht mit viel Luft. */
const ANHANG_ZEITLIMIT_MS = 60_000;

/**
 * Laedt einen Anhang - nur vom Bundeswehr-Host, ohne Weiterleitung und mit
 * einer Byte-Grenze, die WAEHREND des Lesens greift. `arrayBuffer()` laese die
 * ganze Antwort, bevor die Grenze geprueft wird, und eine Weiterleitung
 * fuehrte zu jedem beliebigen Host.
 * `null` heisst: nicht abgelegt, der Grund steht im Log.
 */
export async function ladeAnhang(
  url: string,
  kontext: Record<string, string> = {},
  abruf: Abruf = fetch,
): Promise<Buffer | null> {
  if (!istBundeswehrAnhangUrl(url)) {
    logger.warn("storeJobDocuments: fremder Host, nicht geladen", kontext);
    return null;
  }
  // Zeitlimit: die Schleife in storeJobDocuments ist sequentiell, ein haengender
  // Abruf hielte sonst den ganzen Sync auf.
  const antwort = await abruf(url, { redirect: "error", signal: AbortSignal.timeout(ANHANG_ZEITLIMIT_MS) });
  if (!antwort.ok || !antwort.body) {
    logger.warn("storeJobDocuments: Download fehlgeschlagen", { ...kontext, status: antwort.status });
    return null;
  }
  const angekuendigt = Number(antwort.headers.get("content-length") ?? 0);
  if (angekuendigt > MAX_ANHANG_BYTES) {
    await antwort.body.cancel().catch(() => undefined);
    logger.warn("storeJobDocuments: unplausible Größe, übersprungen", { ...kontext, bytes: angekuendigt });
    return null;
  }
  const leser = antwort.body.getReader();
  const teile: Uint8Array[] = [];
  let gelesen = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    gelesen += value.byteLength;
    if (gelesen > MAX_ANHANG_BYTES) {
      await leser.cancel().catch(() => undefined);
      logger.warn("storeJobDocuments: unplausible Größe, übersprungen", { ...kontext, bytes: gelesen });
      return null;
    }
    teile.push(value);
  }
  if (gelesen === 0) {
    logger.warn("storeJobDocuments: leere Datei, übersprungen", kontext);
    return null;
  }
  return Buffer.concat(teile);
}

/**
 * Inhaltstyp aus den ersten Bytes, nicht aus der Angabe der API oder des
 * Servers: die Datei liegt danach oeffentlich unter unserer Domain. Ein PDF
 * bleibt ein PDF; alles andere wird als Download ausgeliefert, nie als etwas,
 * das ein Browser anzeigt oder ausfuehrt.
 */
export function anhangTyp(bytes: Uint8Array): { contentType: string; endung: string } {
  return erkenneTyp(bytes) === "application/pdf"
    ? { contentType: "application/pdf", endung: ".pdf" }
    : { contentType: "application/octet-stream", endung: "" };
}

export interface JobDocumentRecord {
  attHeader: string;
  attTypeTxt: string;
  contentType: string;
  sizeBytes: number;
  /** Pfad im Storage-Bucket. */
  storagePath: string;
  /** Öffentlich abrufbare URL auf unsere Kopie. */
  url: string;
  /** Ursprüngliche Bundeswehr-URL - für Nachvollziehbarkeit und Neuladen. */
  quelleUrl: string;
  firstSeenAt: Timestamp;
  lastSeenAt: Timestamp;
}

/** Verweis, wie er auf der Ausschreibung liegt. */
export interface JobDocumentRef {
  docId: string;
  attHeader: string;
}

/**
 * Stabile ID aus dem fachlichen Teil des Links. Gleicher Anhang an vielen Stellen
 * -> gleiche ID -> ein Download.
 */
export function documentIdFor(downloadUrl: string): string {
  const param = /param=([^&]+)/.exec(downloadUrl)?.[1];
  let fachlich = downloadUrl;
  if (param) {
    try {
      fachlich = Buffer.from(decodeURIComponent(param), "base64").toString("utf8");
    } catch {
      // Nicht dekodierbar -> volle URL als Schlüssel, immer noch deterministisch.
    }
  }
  return createHash("sha256").update(fachlich).digest("hex").slice(0, 24);
}

/**
 * WOZU: Die direkte GCS-Adresse (storage.googleapis.com/<bucket>/<pfad>) liefert
 * anonym 403 - die Objekte sind nicht per ACL oeffentlich, nur die Storage-Rules
 * geben `jobDocuments/` frei, und die greifen nur ueber die Firebase-Download-URL.
 * Mit der GCS-Adresse bekaeme jeder Bewerber und jede KI einen toten Formularlink.
 */
export function firebaseDownloadUrl(bucketName: string, storagePath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

const GCS_DIREKT = /^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/;

/**
 * Ein gespeicherter Datensatz kann die direkte, anonym nicht abrufbare
 * GCS-Adresse tragen. Sie wird beim Lesen umgesetzt; alles andere bleibt.
 */
export function abrufbareUrl(url: string): string {
  const treffer = GCS_DIREKT.exec(url);
  return treffer ? firebaseDownloadUrl(treffer[1], decodeURI(treffer[2])) : url;
}

/**
 * Stellt sicher, dass alle Anhänge einer Ausschreibung im Store liegen, und gibt
 * die Verweise zurück.
 *
 * Bereits bekannte Dokumente werden NICHT erneut geladen - nur `lastSeenAt`
 * aktualisiert. Ein fehlgeschlagener Download lässt den Verweis weg, statt den
 * Sync abzubrechen: eine Ausschreibung ohne Anhang ist deutlich besser als ein
 * abgebrochener Sync-Lauf.
 */
export async function storeJobDocuments(documents: JobDocument[]): Promise<JobDocumentRef[]> {
  if (documents.length === 0) return [];

  const db = getFirestore();
  const bucket = getStorage().bucket();
  const refs: JobDocumentRef[] = [];
  const now = Timestamp.now();

  for (const document of documents) {
    const quelleUrl = resolveDownloadUrl(document.downloadUrl);
    const docId = documentIdFor(quelleUrl);
    const registryRef = db.collection(JOB_DOCUMENTS_COLLECTION).doc(docId);

    try {
      const existing = await registryRef.get();
      if (existing.exists) {
        await registryRef.update({ lastSeenAt: now });
        refs.push({ docId, attHeader: document.attHeader });
        continue;
      }

      const bytes = await ladeAnhang(quelleUrl, { docId, attHeader: document.attHeader });
      if (!bytes) continue;

      const { contentType, endung } = anhangTyp(bytes);
      const storagePath = `${STORAGE_PREFIX}/${docId}${endung}`;
      await bucket.file(storagePath).save(bytes, {
        contentType,
        // Öffentliche Ausschreibungsanhänge, ändern sich nach Veröffentlichung
        // praktisch nie - lange Cache-Zeit ist unkritisch und spart Traffic.
        metadata: { cacheControl: "public, max-age=86400" },
      });

      const record: JobDocumentRecord = {
        attHeader: document.attHeader,
        attTypeTxt: document.attTypeTxt ?? "",
        contentType,
        sizeBytes: bytes.byteLength,
        storagePath,
        url: firebaseDownloadUrl(bucket.name, storagePath),
        quelleUrl,
        firstSeenAt: now,
        lastSeenAt: now,
      };
      await registryRef.set(record);
      refs.push({ docId, attHeader: document.attHeader });
    } catch (err) {
      logger.warn("storeJobDocuments: Dokument übersprungen", {
        docId,
        attHeader: document.attHeader,
        error: (err as Error).message,
      });
    }
  }

  return refs;
}

/** Lädt die gespeicherte Datei als Bytes - für die PDF-Ausfüllung. */
export async function readStoredDocument(storagePath: string): Promise<Uint8Array> {
  const [bytes] = await getStorage().bucket().file(storagePath).download();
  return new Uint8Array(bytes);
}

/** Lädt einen einzelnen Registry-Eintrag. `null`, wenn es ihn nicht gibt. */
export async function loadJobDocument(docId: string): Promise<(JobDocumentRecord & { docId: string }) | null> {
  const snap = await getFirestore().collection(JOB_DOCUMENTS_COLLECTION).doc(docId).get();
  if (!snap.exists) return null;
  const record = snap.data() as JobDocumentRecord;
  return { docId: snap.id, ...record, url: abrufbareUrl(record.url) };
}

/** Lädt die Registry-Einträge zu einer Liste von Verweisen. */
export async function loadJobDocuments(refs: JobDocumentRef[]): Promise<(JobDocumentRecord & { docId: string })[]> {
  if (refs.length === 0) return [];
  const db = getFirestore();
  const snapshots = await db.getAll(
    ...refs.map((ref) => db.collection(JOB_DOCUMENTS_COLLECTION).doc(ref.docId)),
  );
  return snapshots
    .filter((snap) => snap.exists)
    .map((snap) => {
      const record = snap.data() as JobDocumentRecord;
      return { docId: snap.id, ...record, url: abrufbareUrl(record.url) };
    });
}
