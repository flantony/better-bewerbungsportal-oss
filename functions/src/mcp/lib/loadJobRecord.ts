import { getFirestore } from "firebase-admin/firestore";
import {
  JOB_CONTENT_DOC_ID,
  JOB_CONTENT_SUBCOLLECTION,
  type JobContentRecord,
  type JobRecord,
  type JobSummaryRecord,
} from "../../types";
import { JOBS_V2_COLLECTION, altAusV2 } from "../../lib/jobsV2Shape";
import { HinweisFehler } from "../../lib/hinweisFehler";

const JOBS_COLLECTION = JOBS_V2_COLLECTION;

/**
 * Wie `MappeNichtGefundenError`: der Text geht unveraendert an das fremde
 * KI-Tool, kommt also genau im Fehlerfall an und muss deshalb den
 * naechsten Schritt nennen. Er ist auch beim Eroeffnen und Schliessen der
 * Bewerbungsmappe erreichbar, also mitten in einem Ablauf, den der Client
 * fortsetzen koennte.
 *
 * Die Kennung selbst steht nicht in der Meldung: sie sagt dem Client
 * nichts, was er nicht schon weiss (er hat sie gerade geschickt), und ein
 * Fehlertext ohne fremde Bezeichner liest sich fuer den Bewerber besser, falls
 * ein Client ihn durchreicht.
 */
export class JobNotFoundError extends HinweisFehler {
  constructor() {
    super(
      "Zu dieser Ausschreibung gibt es keine Daten mehr - entweder ist der Bewerbungsschluss vorbei und " +
        "sie ist aus dem Bestand gefallen, oder die Kennung stimmt nicht. Suche mit list_jobs erneut und " +
        "nimm die Kennung aus dem Ergebnis; sag dem Bewerber, dass diese Stelle nicht mehr offen ist, " +
        "statt eine Störung zu melden.",
    );
    this.name = "JobNotFoundError";
  }
}

/**
 * Lädt den vollständigen `JobRecord` für eine Ausschreibung. `sync.ts`s
 * `splitJobRecord()` schreibt die Übersichtsfelder (`JobSummaryRecord`) nach
 * `jobs/{pinstGuid}` und den Volltext (`JobContentRecord`) GETRENNT nach
 * `jobs/{pinstGuid}/content/detail` - ein einzelner Read von
 * `jobs/{pinstGuid}` allein liefert also NIE `companyDesc`/`requireDesc`/etc.
 * (Die Anhänge liegen dagegen als Verweise auf dem Übersichtsdokument, s.
 * `JobSummaryRecord.dokumente`.)
 */
export async function loadJobRecord(pinstGuid: string): Promise<JobRecord> {
  const jobRef = getFirestore().collection(JOBS_COLLECTION).doc(pinstGuid);
  const [jobSnap, contentSnap] = await Promise.all([
    jobRef.get(),
    jobRef.collection(JOB_CONTENT_SUBCOLLECTION).doc(JOB_CONTENT_DOC_ID).get(),
  ]);
  if (!jobSnap.exists || !contentSnap.exists) {
    throw new JobNotFoundError();
  }
  return {
    ...(altAusV2(jobSnap.data() as Record<string, unknown>) as unknown as JobSummaryRecord),
    ...(contentSnap.data() as JobContentRecord),
  };
}
