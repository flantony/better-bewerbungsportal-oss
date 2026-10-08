import { describe, it, expect, vi, beforeEach } from "vitest";

let record: Record<string, unknown> | null = null;
let gelesenerPfad: string | null = null;

vi.mock("../../jobDocumentStore", () => ({
  loadJobDocument: async () => record,
  readStoredDocument: async (storagePath: string) => {
    gelesenerPfad = storagePath;
    return new Uint8Array([1, 2, 3, 4]);
  },
}));

const { ladeFormular, MAX_TOOL_BYTES, FormularNichtGefundenError } = await import("./formularAusliefern");

beforeEach(() => {
  gelesenerPfad = null;
  record = {
    docId: "0123456789abcdef01234567",
    attHeader: "Bewerbungsbogen Militärisch",
    contentType: "application/pdf",
    sizeBytes: 50_000,
    storagePath: "jobDocuments/0123456789abcdef01234567.pdf",
    url: "https://storage.googleapis.com/bucket/jobDocuments/0123456789abcdef01234567.pdf",
  };
});

describe("ladeFormular", () => {
  it("liefert die Datei als base64 mit Namen und Typ", async () => {
    const formular = await ladeFormular("0123456789abcdef01234567", MAX_TOOL_BYTES);
    expect(formular.base64).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
    expect(formular.dateiname).toBe("Bewerbungsbogen Militärisch");
    expect(formular.contentType).toBe("application/pdf");
    expect(gelesenerPfad).toBe("jobDocuments/0123456789abcdef01234567.pdf");
  });

  // base64 blaeht um ein Drittel auf und die Tool-Antwort landet vollstaendig im
  // Modellkontext - eine zu grosse Datei macht den Aufruf nicht langsam, sondern
  // unbrauchbar. Dann lieber der Link.
  it("bettet zu grosse Dateien nicht ein, sondern verweist auf den Link", async () => {
    record = { ...record, sizeBytes: MAX_TOOL_BYTES + 1 };
    const formular = await ladeFormular("0123456789abcdef01234567", MAX_TOOL_BYTES);
    expect(formular.base64).toBeUndefined();
    expect(formular.downloadUrl).toContain("https://");
    expect(formular.hinweis).toMatch(/downloadUrl/);
    // Wichtig: die Datei wird dann auch gar nicht erst aus Storage geladen.
    expect(gelesenerPfad).toBeNull();
  });

  it("kennt mit maxBytes null keine Schranke", async () => {
    record = { ...record, sizeBytes: 20 * 1024 * 1024 };
    const formular = await ladeFormular("0123456789abcdef01234567", null);
    expect(formular.base64).toBeTruthy();
    expect(formular.hinweis).toBeUndefined();
  });

  it("sagt bei unbekannter Kennung, wo die richtige steht", async () => {
    record = null;
    await expect(ladeFormular("ffffffffffffffffffffffff", MAX_TOOL_BYTES)).rejects.toBeInstanceOf(FormularNichtGefundenError);
    await expect(ladeFormular("ffffffffffffffffffffffff", MAX_TOOL_BYTES)).rejects.toThrow(/get_document_requirements/);
  });

  // Eine Kennung mit "/" waere sonst ein Pfad in Firestore, und die Eingabe
  // stuende woertlich in der Fehlermeldung.
  it("weist eine Kennung im falschen Format ab, ohne nachzuschlagen und ohne sie zurueckzugeben", async () => {
    record = null;
    const boese = "jobDocuments/../konten/x" + "a".repeat(200);
    const fehler = await ladeFormular(boese, MAX_TOOL_BYTES).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(FormularNichtGefundenError);
    expect((fehler as Error).message).not.toContain("konten");
    expect(gelesenerPfad).toBeNull();
  });
});

/**
 * WOZU: Die Schranke misst die DATEIGROESSE, bezahlt wird aber die Base64-Kette
 * im Kontext - 1 MB Datei sind ~1,37 MB Text, also ueber 300.000 Token. So
 * lange Ketten kuerzen Clients: Datenmuell statt Datei. 100 KB sind ~137 KB
 * Text und damit vertretbar.
 */
describe("MAX_TOOL_BYTES", () => {
  it("liegt bei 100 KB", () => {
    expect(MAX_TOOL_BYTES).toBe(100 * 1024);
  });
});
