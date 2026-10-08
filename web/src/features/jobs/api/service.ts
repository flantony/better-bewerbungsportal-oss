// ============================================================
// Jobs Service — Data Access Layer
// ============================================================
// Liest direkt aus Firestore (Client-SDK), befüllt durch die tägliche
// Bundeswehr-Sync-Cloud-Function (siehe functions/src/sync.ts). Läuft nur
// client-seitig, ohne Server-Prefetch während des SSR: die Stellenliste lädt
// den aktiven Bestand einmal in den Browser und filtert dort (s. unten).
// ============================================================

import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { inBloecken } from '@/features/konto/lib/bloecke';
import type { Job } from './types';

// Safety-Obergrenze für den Bestand aktiver Jobs - die
// Stellenliste lädt bewusst ALLE aktiven Jobs auf einmal (s. job-filters.ts):
// bei einem Bestand von wenigen tausend Stellen sind Filterung/Sortierung/Facettenzählung
// clientseitig instant und immer gegenseitig konsistent, was Firestore ohne
// eigene Facetten-Aggregation nicht leisten kann. 10000 ist zugleich
// Firestores harte Obergrenze für `limit()` (höhere Werte werfen
// "invalid-argument") und deckt auf absehbare Zeit den gesamten aktiven
// Bestand ab.
const ACTIVE_JOBS_SAFETY_LIMIT = 10000;

/**
 * Schema `jobsV2`: Rohwerte der Bundeswehr-API liegen unter `api.*` mit ihren
 * eigenen Feldnamen, unsere Ableitungen (contractTypeLabel, besoldung,
 * applicationEndSortKey) daneben auf oberster Ebene. Diese Funktion ist die
 * einzige Stelle im Web, die davon weiss.
 */
function toJob(doc: QueryDocumentSnapshot<DocumentData>): Job {
  const data = doc.data();
  const api = data.api ?? {};
  return {
    pinstGuid: doc.id,
    title: api.Title,
    besOrt: api.BesOrt,
    contractType: api.ContractType,
    contractTypeLabel: data.contractTypeLabel ?? null,
    applicationEnd: api.ApplicationEnd,
    applicationEndSortKey: data.applicationEndSortKey?.toMillis() ?? Number.POSITIVE_INFINITY,
    hotJob: Boolean(api.HotJob),
    reqIndustry: api.ReqIndustry ?? 0,
    reqType: api.ReqType ?? '',
    arbeitszeit: api.Arbeitszeit ?? '',
    besoldung: data.besoldung ?? null,
    latitude: api.Latitude ?? '',
    longitude: api.Longitude ?? '',
    active: data.active === true
  } satisfies Job;
}

/**
 * Alle aktiven Jobs für die Stellenliste ("Alle Stellenangebote") - Filterung,
 * Sortierung, Facettenzählung, Suche und Umkreissuche laufen clientseitig
 * über dieses Array (s. features/jobs/lib/job-filters.ts). Wird über
 * React Query mit langem `staleTime` gecacht (der Sync läuft täglich,
 * ein Re-Fetch pro Minute wäre unnötig).
 */
export async function getAllActiveJobs(): Promise<Job[]> {
  const jobsQuery = query(
    collection(db, 'jobsV2'),
    where('active', '==', true),
    orderBy('lastSeenAt', 'desc'),
    limit(ACTIVE_JOBS_SAFETY_LIMIT)
  );

  const snapshot = await getDocs(jobsQuery);
  return snapshot.docs.map(toJob);
}

/**
 * Jobs mit Bewerbungsschluss innerhalb der nächsten `days` Tage, sortiert nach
 * nahendster Frist zuerst (Last Chance). Nutzt `applicationEndSortKey` (echter
 * Firestore-Timestamp, s. functions/src/types.ts) für eine gezielte Range-Query
 * statt eines Vollscans des aktiven Bestands.
 */
export async function getUpcomingDeadlineJobs(days: number): Promise<Job[]> {
  const now = Timestamp.now();
  const cutoff = Timestamp.fromMillis(now.toMillis() + days * 24 * 60 * 60 * 1000);

  const deadlineQuery = query(
    collection(db, 'jobsV2'),
    where('active', '==', true),
    where('applicationEndSortKey', '>=', now),
    where('applicationEndSortKey', '<=', cutoff),
    orderBy('applicationEndSortKey', 'asc'),
    limit(50)
  );

  const snapshot = await getDocs(deadlineQuery);
  return snapshot.docs.map(toJob);
}

/**
 * Oeffentliche Stellendaten zu gemerkten IDs - auch archivierte, damit die
 * Merkliste "nicht mehr aktuell" zeigen kann statt die Stelle stillschweigend
 * wegzulassen. Firestores `in`-Operator nimmt hoechstens 30 Werte, daher in
 * Bloecken abgefragt (s. konto/lib/bloecke.ts).
 */
export async function getJobsByIds(ids: string[]): Promise<Job[]> {
  const ergebnisse = await Promise.all(
    inBloecken(ids, 30).map((block) =>
      getDocs(query(collection(db, 'jobsV2'), where(documentId(), 'in', block)))
    )
  );
  return ergebnisse.flatMap((snap) => snap.docs.map(toJob));
}
