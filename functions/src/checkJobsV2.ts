/**
 * Vergleicht `jobs` und `jobsV2` Feld fuer Feld - die Bedingung dafuer, die
 * Leser auf `jobsV2` umzuschalten.
 *
 * WOZU: Der Sync schreibt in beide Collections. Ob das wirklich deckungsgleich
 * passiert, sieht man einem gruenen Sync-Lauf nicht an: Ein vergessener
 * Schreibpfad faellt erst auf, wenn Bestaende auseinanderlaufen. Umgeschaltet
 * wird deshalb erst, wenn dieses Skript sauber durchlaeuft.
 *
 * WAS ES PRUEFT:
 *  1. Bestandsgleichheit in beide Richtungen (nur in jobs / nur in jobsV2)
 *  2. je Feld: kommt der Wert im neuen Schema an der richtigen Stelle an
 *  3. Volltext: existiert `content/detail` auf beiden Seiten
 *
 * WAS ES NICHT PRUEFEN KANN: Es benutzt dieselbe Zuordnung wie die Schreiber
 * (`lib/jobsV2Shape.ts`). Eine FALSCHE Zuordnung findet es daher nicht - nur
 * eine nicht angewandte. Fuer die Richtigkeit der Zuordnung ist der Blick in
 * das Schema zustaendig, nicht dieses Skript.
 *
 * Nur lesend. Exit-Code 1, sobald etwas abweicht.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./.secrets/sync-local-dev-key.json \
 *     npx tsx src/checkJobsV2.ts
 *   ... --details            (jede Abweichung einzeln auflisten)
 */
import { getFirestore } from "firebase-admin/firestore";
import { initDevApp } from "./lib/devApp";
import { JOB_CONTENT_DOC_ID, JOB_CONTENT_SUBCOLLECTION } from "./types";
import { API_AUS_ALT, JOBS_V2_COLLECTION, UEBERNEHMEN } from "./lib/jobsV2Shape";

initDevApp();
const db = getFirestore();
const DETAILS = process.argv.includes("--details");
const BEISPIELE = 3;

/**
 * Timestamps und verschachtelte Objekte vergleichbar machen.
 *
 * Schluessel werden sortiert, und zwar zwingend: Firestore gibt die Felder einer
 * Map nicht in stabiler Reihenfolge zurueck. Ein reines JSON.stringify meldet
 * dann `jobAttributes` als verschieden, die Feld fuer Feld identisch sind -
 * ein Fehlalarm, der das ganze Werkzeug entwerten wuerde.
 */
function normal(wert: unknown): string {
  if (wert === undefined || wert === null || wert === "") return "";
  const alsTs = wert as { toMillis?: () => number };
  if (typeof alsTs?.toMillis === "function") return String(alsTs.toMillis());
  if (typeof wert === "object") return stabil(wert);
  return String(wert);
}

/** JSON mit sortierten Schluesseln, rekursiv. */
function stabil(wert: unknown): string {
  if (wert === null || typeof wert !== "object") return JSON.stringify(wert) ?? "";
  if (Array.isArray(wert)) return `[${wert.map(stabil).join(",")}]`;
  const eintraege = Object.entries(wert as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${eintraege.map(([k, v]) => `${JSON.stringify(k)}:${stabil(v)}`).join(",")}}`;
}

interface Abweichung {
  feld: string;
  anzahl: number;
  beispiele: string[];
}

async function main() {
  const [altSnap, neuSnap] = await Promise.all([
    db.collection("jobs").get(),
    db.collection(JOBS_V2_COLLECTION).get(),
  ]);
  const alt = new Map(altSnap.docs.map((d) => [d.id, d.data()]));
  const neu = new Map(neuSnap.docs.map((d) => [d.id, d.data()]));

  console.log(`jobs: ${alt.size}  |  jobsV2: ${neu.size}\n`);

  const nurAlt = [...alt.keys()].filter((id) => !neu.has(id));
  const nurNeu = [...neu.keys()].filter((id) => !alt.has(id));
  if (nurAlt.length) console.log(`NUR IN jobs   : ${nurAlt.length}  z.B. ${nurAlt.slice(0, BEISPIELE).join(", ")}`);
  if (nurNeu.length) console.log(`NUR IN jobsV2 : ${nurNeu.length}  z.B. ${nurNeu.slice(0, BEISPIELE).join(", ")}`);
  if (!nurAlt.length && !nurNeu.length) console.log("Bestand deckungsgleich.");

  const abweichungen = new Map<string, Abweichung>();
  const merke = (feld: string, id: string, a: string, b: string) => {
    const e = abweichungen.get(feld) ?? { feld, anzahl: 0, beispiele: [] };
    e.anzahl += 1;
    if (e.beispiele.length < BEISPIELE || DETAILS) e.beispiele.push(`${id}: alt=${a.slice(0, 40)} neu=${b.slice(0, 40)}`);
    abweichungen.set(feld, e);
  };

  for (const [id, a] of alt) {
    const b = neu.get(id);
    if (!b) continue;
    const bApi = (b.api ?? {}) as Record<string, unknown>;

    for (const [apiFeld, altFeld] of Object.entries(API_AUS_ALT)) {
      if (!altFeld) continue;
      const links = normal(a[altFeld]);
      const rechts = normal(bApi[apiFeld]);
      if (links !== rechts) merke(`api.${apiFeld} <- ${altFeld}`, id, links, rechts);
    }
    for (const feld of UEBERNEHMEN) {
      const links = normal(a[feld]);
      const rechts = normal(b[feld]);
      if (links !== rechts) merke(feld, id, links, rechts);
    }
  }

  console.log(`\nFelder mit Abweichungen: ${abweichungen.size}`);
  if (abweichungen.size) {
    console.log("Feld".padEnd(44), "betroffen".padStart(9));
    console.log("-".repeat(58));
    for (const e of [...abweichungen.values()].sort((x, y) => y.anzahl - x.anzahl)) {
      console.log(e.feld.padEnd(44), String(e.anzahl).padStart(9));
      for (const bsp of e.beispiele.slice(0, DETAILS ? e.beispiele.length : BEISPIELE)) console.log(`    ${bsp}`);
    }
  }

  // Volltext stichprobenartig: ein fehlendes content/detail waere der teuerste
  // stille Fehler, weil get_job dann leer antwortet.
  const stichprobe = [...alt.keys()].slice(0, 25);
  let fehlt = 0;
  for (const id of stichprobe) {
    const [ca, cb] = await Promise.all([
      db.collection("jobs").doc(id).collection(JOB_CONTENT_SUBCOLLECTION).doc(JOB_CONTENT_DOC_ID).get(),
      db.collection(JOBS_V2_COLLECTION).doc(id).collection(JOB_CONTENT_SUBCOLLECTION).doc(JOB_CONTENT_DOC_ID).get(),
    ]);
    if (ca.exists && !cb.exists) fehlt += 1;
  }
  console.log(`\nVolltext-Stichprobe (${stichprobe.length}): ${fehlt} fehlen in jobsV2`);

  const sauber = !nurAlt.length && !nurNeu.length && abweichungen.size === 0 && fehlt === 0;
  console.log(sauber ? "\nOK - jobsV2 ist deckungsgleich. Umschalten moeglich." : "\nNICHT deckungsgleich - nicht umschalten.");
  if (!sauber) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
