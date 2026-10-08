import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

let record: Record<string, unknown> | null = null;
let fehler: Error | null = null;
const gelesen: string[] = [];

vi.mock("../jobDocumentStore", async (echt) => ({
  ...(await echt<typeof import("../jobDocumentStore")>()),
  loadJobDocument: async () => {
    if (fehler) throw fehler;
    return record;
  },
  readStoredDocument: async (pfad: string) => {
    gelesen.push(pfad);
    return new Uint8Array([37, 80, 68, 70]);
  },
}));

const { buildMcpServer } = await import("./server");
const { MAX_TOOL_BYTES } = await import("./lib/formularAusliefern");
const { UNERWARTETER_WERKZEUGFEHLER } = await import("./lib/werkzeugFehler");

const DOC_ID = "0123456789abcdef01234567";

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([buildMcpServer().connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

beforeEach(() => {
  fehler = null;
  gelesen.length = 0;
  record = {
    docId: DOC_ID,
    attHeader: "Bewerbungsbogen Militärisch",
    contentType: "application/pdf",
    sizeBytes: 50_000,
    storagePath: `jobDocuments/${DOC_ID}.pdf`,
    url: "https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media",
  };
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

/**
 * WOZU: die Resource ist anonym abrufbar - ohne Groessenschranke waere jeder
 * Abruf ein ganzer Storage-Download samt Base64. Ihre Fehler gehen als
 * JSON-RPC-Fehler hinaus und duerfen deshalb nie den rohen Text tragen.
 */
describe("Resource bw://formular/{docId}", () => {
  it("liefert eine kleine Datei als Blob", async () => {
    const client = await connect();
    const antwort = await client.readResource({ uri: `bw://formular/${DOC_ID}` });
    expect(antwort.contents[0]).toMatchObject({ mimeType: "application/pdf", blob: expect.any(String) });
  });

  it("liefert eine grosse Datei nicht aus, sondern Text mit Name und downloadUrl", async () => {
    record = { ...record, sizeBytes: MAX_TOOL_BYTES + 1 };
    const client = await connect();
    const antwort = await client.readResource({ uri: `bw://formular/${DOC_ID}` });
    const inhalt = antwort.contents[0] as { mimeType: string; text: string };
    expect(inhalt.mimeType).toBe("text/plain");
    expect(inhalt.text).toContain("Bewerbungsbogen Militärisch");
    expect(inhalt.text).toContain("downloadUrl: https://");
    expect(gelesen).toEqual([]);
  });

  it("gibt einen fremden Fehler nur als festen Satz heraus", async () => {
    fehler = new Error("7 PERMISSION_DENIED: projects/x/databases/(default)/documents/jobDocuments/geheim");
    const client = await connect();
    const ergebnis = await client.readResource({ uri: `bw://formular/${DOC_ID}` }).catch((f: unknown) => f);
    expect((ergebnis as Error).message).toContain(UNERWARTETER_WERKZEUGFEHLER);
    expect((ergebnis as Error).message).not.toContain("PERMISSION_DENIED");
  });

  it("laesst den eigenen Hinweis bei unbekannter Kennung durch", async () => {
    record = null;
    const client = await connect();
    const ergebnis = await client.readResource({ uri: `bw://formular/${DOC_ID}` }).catch((f: unknown) => f);
    expect((ergebnis as Error).message).toMatch(/get_document_requirements/);
  });
});
