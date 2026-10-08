/**
 * Standalone-Verifikationsskript gegen die echte, öffentliche Bundeswehr-API.
 * Läuft ohne Firebase-Abhängigkeit (reines Node/TypeScript) - nützlich, um
 * bundeswehrClient.ts ohne Firebase-Projekt zu testen.
 *
 * Nutzung:
 *   npm run verify                  -> Übersicht laden, Details für 10 Stellen (Stichprobe)
 *   npm run verify -- --sample=30   -> Details für 30 Stellen
 *   npm run verify -- --all         -> Details für ALLE aktiven Stellen (dauert länger)
 */
import {
  ALL_SEARCH_CATEGORY_CODES,
  fetchAllJobDetails,
  fetchVertragsartLabels,
  listAllJobSummaries,
} from "./bundeswehrClient";

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const sampleArg = args.find((a) => a.startsWith("--sample="));
  const sampleSize = sampleArg ? Number(sampleArg.split("=")[1]) : 10;

  console.log(`Kategorie-Codes ("Alle Stellen"): ${ALL_SEARCH_CATEGORY_CODES.join(", ")}`);
  console.log("Lade Übersicht aller Ausschreibungen...");
  const summaries = await listAllJobSummaries();
  console.log(`-> ${summaries.length} aktive Ausschreibungen gefunden.`);

  const targets = (all ? summaries : summaries.slice(0, sampleSize)).map((s) => s.pinstGuid);
  console.log(
    `Lade Volltext + Dokumente für ${targets.length} Stelle(n)${all ? " (alle)" : " (Stichprobe)"}...`,
  );

  const [details, labels] = await Promise.all([
    fetchAllJobDetails(targets, (done, total) => {
      process.stdout.write(`\r  ${done}/${total}`);
    }),
    fetchVertragsartLabels(),
  ]);
  process.stdout.write("\n");

  let withDocs = 0;
  let errors = 0;
  for (const d of details) {
    if (d.error) errors++;
    if (d.documents.length > 0) withDocs++;
  }

  console.log("\nErgebnis:");
  console.log(`  Details geladen: ${details.length}`);
  console.log(`  Davon mit Fehlern: ${errors}`);
  console.log(`  Davon mit geforderten Dokumenten (AttSuchauftragSet): ${withDocs}`);
  console.log(`  Vertragsart-Labels geladen: ${labels.size}`);

  const example = details.find((d) => d.detail && d.documents.length > 0) ?? details[0];
  if (example?.detail) {
    console.log(`\nBeispiel: ${example.detail.Title} (${example.pinstGuid})`);
    console.log(`  Ort: ${example.detail.BesOrt || "(kein Einzelort angegeben)"}`);
    console.log(
      `  ContractType: ${example.detail.ContractType} (${
        labels.get(example.detail.ContractType) ?? "?"
      })`,
    );
    console.log(`  JobDesc-Länge: ${example.detail.JobDesc.length} Zeichen`);
    console.log(
      `  Dokumente: ${
        example.documents.map((doc) => doc.attHeader).join("; ") || "(keine strukturierten Anlagen)"
      }`,
    );
  }

  if (errors > 0) {
    console.log("\nFehler-Details (erste 10):");
    details
      .filter((d) => d.error)
      .slice(0, 10)
      .forEach((d) => console.log(`  ${d.pinstGuid}: ${d.error}`));
  }
}

main().catch((err) => {
  console.error("Verify fehlgeschlagen:", err);
  process.exitCode = 1;
});
