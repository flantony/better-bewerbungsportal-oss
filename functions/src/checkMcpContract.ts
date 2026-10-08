/**
 * Vergleicht den Vertrag des DEPLOYTEN MCP-Servers mit dem, was der Quellcode
 * hergibt - und gibt ihn auf Wunsch vollständig aus.
 *
 * WOZU: Die Unit-Tests prüfen den Server, den der Quellcode baut. Was fremde
 * KI-Clients tatsächlich sehen, ist aber die deployte Fassung. Zwischen beiden
 * kann alles Mögliche stehen: ein vergessener Deploy, ein Deploy aus einem
 * anderen Branch, ein halb durchgelaufener Rollout - dann beschreibt sich ein
 * Tool live noch anders, als der Quellcode es längst tut.
 *
 * Läuft automatisch nach jedem Function-Deploy (s. `postdeploy` in
 * firebase.json) und liefert die Faktengrundlage für jede Prüfung der
 * MCP-Oberfläche.
 *
 *   npm run mcp:contract          # Vertrag der Live-Fassung ausgeben
 *   npm run mcp:check             # Live gegen Quellcode prüfen (Exit-Code)
 *   npx tsx src/checkMcpContract.ts --url <andere-url>
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildMcpServer } from "./mcp/server";

const STANDARD_URL = "https://europe-west3-better-bewerbungsportal.cloudfunctions.net/mcpServer/mcp";

const argv = process.argv.slice(2);
const DUMP = argv.includes("--dump");
const urlIndex = argv.indexOf("--url");
const URL_ = urlIndex >= 0 ? argv[urlIndex + 1] : STANDARD_URL;
/** Nach einem Deploy braucht die neue Revision einen Moment. */
const VERSUCHE = argv.includes("--no-retry") ? 1 : 6;
const WARTE_MS = 10_000;

interface Vertrag {
  version: string;
  instructionsLen: number;
  tools: Record<string, { title: string; description: string; annotations: string; params: Record<string, string> }>;
  resources: Record<string, string>;
  templates: string[];
  prompts: string[];
}

function normalise(client: Client, tools: Awaited<ReturnType<Client["listTools"]>>["tools"], resources: { uri: string; title?: string; description?: string }[], templates: string[], prompts: string[]): Vertrag {
  return {
    version: client.getServerVersion()?.version ?? "?",
    instructionsLen: (client.getInstructions() ?? "").length,
    tools: Object.fromEntries(
      tools
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((tool) => [
          tool.name,
          {
            title: tool.title ?? "",
            description: tool.description ?? "",
            annotations: JSON.stringify(tool.annotations ?? null),
            params: Object.fromEntries(
              Object.entries((tool.inputSchema?.properties ?? {}) as Record<string, { description?: string }>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([feld, schema]) => [feld, schema.description ?? ""]),
            ),
          },
        ]),
    ),
    resources: Object.fromEntries(
      resources.slice().sort((a, b) => a.uri.localeCompare(b.uri)).map((r) => [r.uri, `${r.title ?? ""}|${r.description ?? ""}`]),
    ),
    templates: templates.slice().sort(),
    prompts: prompts.slice().sort(),
  };
}

async function leseVertrag(client: Client): Promise<Vertrag> {
  const { tools } = await client.listTools();
  const { resources } = await client.listResources();
  const { resourceTemplates } = await client.listResourceTemplates();
  const { prompts } = await client.listPrompts();
  return normalise(
    client,
    tools,
    resources,
    (resourceTemplates ?? []).map((t) => t.uriTemplate),
    prompts.map((p) => p.name),
  );
}

async function lokalerVertrag(): Promise<Vertrag> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer();
  const client = new Client({ name: "contract-check", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return leseVertrag(client);
}

async function liveVertrag(url: string): Promise<Vertrag> {
  const client = new Client({ name: "contract-check", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const vertrag = await leseVertrag(client);
  await client.close();
  return vertrag;
}

/** Flacht den Vertrag zu vergleichbaren Pfad/Wert-Paaren ab. */
function flach(vertrag: Vertrag): Map<string, string> {
  const map = new Map<string, string>();
  map.set("version", vertrag.version);
  for (const [name, tool] of Object.entries(vertrag.tools)) {
    map.set(`tool ${name}.title`, tool.title);
    map.set(`tool ${name}.description`, tool.description);
    map.set(`tool ${name}.annotations`, tool.annotations);
    for (const [feld, beschreibung] of Object.entries(tool.params)) {
      map.set(`tool ${name}.param.${feld}`, beschreibung);
    }
  }
  for (const [uri, wert] of Object.entries(vertrag.resources)) map.set(`resource ${uri}`, wert);
  map.set("templates", vertrag.templates.join(","));
  map.set("prompts", vertrag.prompts.join(","));
  return map;
}

function kurz(wert: string): string {
  return wert.length > 110 ? `${wert.slice(0, 110)}…` : wert;
}

function vergleiche(live: Vertrag, lokal: Vertrag): string[] {
  const a = flach(live);
  const b = flach(lokal);
  const abweichungen: string[] = [];

  for (const [pfad, lokalWert] of b) {
    if (!a.has(pfad)) {
      abweichungen.push(`FEHLT LIVE   ${pfad}\n  Quellcode: ${kurz(lokalWert)}`);
      continue;
    }
    const liveWert = a.get(pfad) as string;
    if (liveWert !== lokalWert) {
      abweichungen.push(`ABWEICHUNG   ${pfad}\n  live:      ${kurz(liveWert)}\n  Quellcode: ${kurz(lokalWert)}`);
    }
  }
  for (const pfad of a.keys()) {
    if (!b.has(pfad)) abweichungen.push(`NUR LIVE     ${pfad} - im Quellcode nicht mehr vorhanden`);
  }
  // Die Instructions-Länge separat, weil der Text selbst zu lang zum Diffen ist.
  if (live.instructionsLen !== lokal.instructionsLen) {
    abweichungen.push(
      `ABWEICHUNG   instructions (Länge)\n  live:      ${live.instructionsLen}\n  Quellcode: ${lokal.instructionsLen}`,
    );
  }
  return abweichungen;
}

async function main() {
  const lokal = await lokalerVertrag();

  if (DUMP) {
    const live = await liveVertrag(URL_);
    console.log(JSON.stringify({ url: URL_, live, lokal }, null, 2));
    return;
  }

  console.log(`Vertrag prüfen: ${URL_}`);
  let abweichungen: string[] = [];
  for (let versuch = 1; versuch <= VERSUCHE; versuch++) {
    const live = await liveVertrag(URL_);
    abweichungen = vergleiche(live, lokal);
    if (abweichungen.length === 0) {
      console.log(`\nLive-Fassung stimmt mit dem Quellcode überein (Version ${live.version}, ${Object.keys(live.tools).length} Tools, ${Object.keys(live.resources).length} Resources).`);
      return;
    }
    if (versuch < VERSUCHE) {
      // Direkt nach einem Deploy beantwortet oft noch die alte Revision.
      console.log(`Abweichungen (Versuch ${versuch}/${VERSUCHE}) - warte ${WARTE_MS / 1000}s auf den Rollout...`);
      await new Promise((resolve) => setTimeout(resolve, WARTE_MS));
    }
  }

  console.error(`\n${abweichungen.length} Abweichung(en) zwischen Live-Fassung und Quellcode:\n`);
  for (const abweichung of abweichungen) console.error(`${abweichung}\n`);
  console.error(
    "Das heisst: fremde KI-Clients sehen etwas anderes als der Quellcode beschreibt.\n" +
      "Entweder fehlt ein Deploy (firebase deploy --only functions:mcpServer) oder es wurde aus einem anderen Stand deployt.",
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Vertragsprüfung fehlgeschlagen:", (err as Error).message);
  process.exitCode = 1;
});
