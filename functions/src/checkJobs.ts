/**
 * Dev-Utility: Stichprobe der jobs-Collection gegen das echte Firestore-
 * Backend, für den Fall dass die Firebase-Konsole nicht eingeloggt ist.
 * Nutzung: GOOGLE_APPLICATION_CREDENTIALS=./.secrets/sync-local-dev-key.json npx tsx src/checkJobs.ts
 */
import { getFirestore } from "firebase-admin/firestore";
import { initDevApp } from "./lib/devApp";

initDevApp();

async function main() {
  const db = getFirestore();

  const activeCountSnap = await db.collection("jobs").where("active", "==", true).count().get();
  console.log(`Aktive Jobs: ${activeCountSnap.data().count}`);

  const totalCountSnap = await db.collection("jobs").count().get();
  console.log(`Jobs insgesamt (inkl. inaktiv): ${totalCountSnap.data().count}`);

  const sample = await db.collection("jobs").limit(3).get();
  console.log(`\nStichprobe (${sample.size} Dokumente):`);
  for (const doc of sample.docs) {
    const d = doc.data();
    console.log(`- [${doc.id}] ${d.title} | Ort: ${d.besOrt || "-"} | ContractType: ${d.contractType} (${d.contractTypeLabel}) | reqIndustry: ${d.reqIndustry}`);
  }

  const runsSnap = await db.collection("syncRuns").orderBy("startedAt", "desc").limit(1).get();
  if (!runsSnap.empty) {
    console.log("\nLetzter syncRuns-Eintrag:");
    console.log(JSON.stringify(runsSnap.docs[0].data(), null, 2));
  } else {
    console.log("\nNoch kein syncRuns-Eintrag vorhanden (Sync läuft evtl. noch).");
  }
}

main().catch((err) => {
  console.error("checkJobs fehlgeschlagen:", err);
  process.exitCode = 1;
});
