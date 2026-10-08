/**
 * Erzeugt das Skill-Bundle fuer die /ki-Seite.
 *
 * WOZU: Nutzer, die den MCP-Server verbunden haben, bekommen die
 * Server-Instructions automatisch - die muessen aber kurz bleiben, weil sie bei
 * jedem Verbindungsaufbau uebertragen werden. Der Skill darf ausfuehrlich sein
 * und wird nur geladen, wenn er gebraucht wird.
 *
 * KEINE ZWEITE TEXTQUELLE: Ablauf und Nachschlagewerke stammen aus
 * `mcp/knowledge/` - denselben Konstanten, aus denen auch die MCP-Resources
 * entstehen. Wer am Wissen etwas aendert, aendert beides.
 *
 * Liest das Glossar aus Firestore, schreibt sonst nur lokale Dateien. Keine
 * Firestore-Writes.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./.secrets/sync-local-dev-key.json \
 *     npx tsx src/baueSkillBundle.ts [--apply]   (oder: npm run skill:bundle -- --apply)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import { initDevApp } from "./lib/devApp";
import { WISSENSDOKUMENTE } from "./mcp/knowledge";
import { SKILL_NAME, skillMarkdown } from "./mcp/knowledge/skill";

initDevApp();

const APPLY = process.argv.includes("--apply");
/**
 * Landet im Bundle als Server-Adresse. Muss mit `KI_VERBINDUNGS_URL` in
 * web/src/features/ki-anbindung/lib/connection.ts uebereinstimmen - dort steht
 * die Quelle der Wahrheit fuer die Anbindung. Bewusst hier dupliziert statt
 * importiert: functions/ und web/ teilen kein Paket.
 */
const MCP_URL = "https://europe-west3-better-bewerbungsportal.cloudfunctions.net/mcpServer/mcp";
const ZIEL = join(process.cwd(), "..", "web", "public", `${SKILL_NAME}.zip`);

async function main() {
  console.log(`Modus: ${APPLY ? "SCHREIBEN" : "Trockenlauf"}`);
  console.log(`Server-Adresse im Bundle: ${MCP_URL}\n`);

  const zip = new JSZip();
  const ordner = zip.folder(SKILL_NAME);
  if (!ordner) throw new Error("Ordner im Zip konnte nicht angelegt werden");

  const skill = skillMarkdown(MCP_URL);
  ordner.file("SKILL.md", skill);
  console.log(`SKILL.md: ${skill.length} Zeichen`);

  for (const dokument of WISSENSDOKUMENTE) {
    const markdown = await dokument.markdown();
    ordner.file(`referenzen/${dokument.slug}.md`, markdown);
    console.log(`referenzen/${dokument.slug}.md: ${markdown.length} Zeichen`);
  }

  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  console.log(`\nBundle: ${Math.round(bytes.byteLength / 1024)} KB -> ${ZIEL}`);

  if (!APPLY) {
    console.log("\nTrockenlauf - nichts geschrieben. Mit --apply erneut starten.");
    return;
  }

  await mkdir(dirname(ZIEL), { recursive: true });
  await writeFile(ZIEL, bytes);
  console.log("Geschrieben.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
