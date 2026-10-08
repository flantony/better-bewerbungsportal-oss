/**
 * Prüft das Berufswunsch-Register gegen den LIVE-Bestand.
 *
 * WOZU: Das Register verspricht in seinem eigenen Kopfkommentar, dass jeder
 * Eintrag gegen den echten Bestand geprüft ist - "ein Vorschlag, der wieder ins
 * Leere führt, ist schlimmer als gar keiner". Eine Prüfung von Hand veraltet
 * aber: ändert die Bundeswehr einen Stellentitel, zeigt
 * der Vorschlag ins Leere, und der Bewerber bekommt zwei leere Suchen statt
 * einer. Genau das fällt sonst niemandem auf, weil das Register nur im
 * Fehlerfall überhaupt sichtbar wird.
 *
 * Läuft ohne Firestore-Zugangsdaten: geprüft wird über den öffentlichen
 * MCP-Server, also gegen genau das, was ein fremder Client auch sähe.
 *
 *   npm run wuensche:check              # gegen die deployte Fassung
 *   npx tsx src/checkBerufswuensche.ts --url http://localhost:8080/mcp
 *   npx tsx src/checkBerufswuensche.ts --alias   # auch die Schreibvarianten
 *
 * Exit-Code 1, sobald ein Eintrag nicht mehr trägt.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BERUFSWUENSCHE, type Berufswunsch } from "./mcp/knowledge/berufswuensche";

const STANDARD_URL = "https://europe-west3-better-bewerbungsportal.cloudfunctions.net/mcpServer/mcp";

const argv = process.argv.slice(2);
const urlIndex = argv.indexOf("--url");
const URL_ = urlIndex >= 0 ? argv[urlIndex + 1] : STANDARD_URL;
const MIT_ALIAS = argv.includes("--alias");

async function trefferzahl(client: Client, argumente: Record<string, unknown>): Promise<number> {
  const antwort = await client.callTool({ name: "list_jobs", arguments: { ...argumente, limit: 1 } });
  const inhalt = antwort.content as { type: string; text: string }[];
  return (JSON.parse(inhalt[0].text) as { totalCount: number }).totalCount;
}

interface Befund {
  schwere: "FEHLER" | "HINWEIS";
  text: string;
}

async function pruefeEintrag(client: Client, eintrag: Berufswunsch): Promise<Befund[]> {
  const befunde: Befund[] = [];
  const hatSuche = Boolean(eintrag.suche.suchbegriff || eintrag.suche.organisationsbereich?.length);

  // 1. Trägt der Vorschlag noch? Ein Eintrag ohne Suche (bewusster Null-Eintrag)
  //    verspricht nichts und kann deshalb auch nichts brechen.
  let vorschlagTreffer = 0;
  if (hatSuche) {
    const treffer = await trefferzahl(client, eintrag.suche);
    vorschlagTreffer = treffer;
    if (treffer === 0) {
      befunde.push({
        schwere: "FEHLER",
        text: `${eintrag.wunsch}: der Vorschlag ${JSON.stringify(eintrag.suche)} findet nichts mehr. Neue Suchstrategie ermitteln oder den Eintrag entfernen.`,
      });
    } else {
      console.log(`  ok      ${eintrag.wunsch} -> ${treffer} Treffer`);
    }
  } else {
    console.log(`  ok      ${eintrag.wunsch} -> bewusster Null-Eintrag, kein Vorschlag zu prüfen`);
  }

  // 2. Wird das Wort selbst ausgeschrieben? Dann feuert der Hinweis
  //    bei leerer Suche dafür nie. Das ist KEIN Fehler - der Registereintrag
  //    kann trotzdem der bessere Weg sein, wenn er deutlich mehr findet.
  //    Deshalb beide Zahlen nebeneinander, entscheiden muss ein Mensch.
  const woerter = MIT_ALIAS ? [eintrag.wunsch, ...(eintrag.auch ?? [])] : [eintrag.wunsch];
  for (const wort of woerter) {
    const direkt = await trefferzahl(client, { suchbegriff: wort });
    if (direkt > 0) {
      befunde.push({
        schwere: "HINWEIS",
        text: `${eintrag.wunsch}: "${wort}" findet direkt ${direkt} Stellen, der Registervorschlag ${vorschlagTreffer}. Bringt der Eintrag hier noch etwas?`,
      });
    }
  }

  return befunde;
}

async function main(): Promise<void> {
  console.log(`Berufswunsch-Register prüfen gegen: ${URL_}\n`);
  const client = new Client({ name: "wuensche-check", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(URL_)));

  const befunde: Befund[] = [];
  // Bewusst nacheinander: der Server begrenzt pro IP, und ein Rate-Limit-Fehler
  // wäre hier nicht von einem echten Befund zu unterscheiden.
  for (const eintrag of BERUFSWUENSCHE) {
    befunde.push(...(await pruefeEintrag(client, eintrag)));
  }
  await client.close();

  const fehler = befunde.filter((b) => b.schwere === "FEHLER");
  if (befunde.length === 0) {
    console.log(`\nAlle ${BERUFSWUENSCHE.length} Einträge tragen.`);
    return;
  }

  console.log("");
  for (const befund of befunde) console.log(`${befund.schwere}  ${befund.text}`);
  if (fehler.length > 0) {
    console.log(`\n${fehler.length} Eintrag/Einträge zeigen ins Leere.`);
    process.exitCode = 1;
  }
}

main().catch((fehler) => {
  console.error(fehler);
  process.exitCode = 1;
});
