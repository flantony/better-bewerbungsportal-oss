import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "../server";
import { beschreibeAusfuehrungsfehler, bereinigeName, UNERWARTETER_WERKZEUGFEHLER } from "./werkzeugFehler";

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function protokolle(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.filter((aufruf) => aufruf[0] === "mcpServer: Werkzeugfehler").map((aufruf) => aufruf[1]);
}

const PII = {
  nachname: "Mustermann",
  vorname: "Erika",
  geburtsdatumLabel: "01.02.1980",
  telefon: "0151 2345678",
  email: "erika@example.com",
  strasse: "Musterweg 12",
  plz: "12345",
  ort: "Musterstadt",
  staatsangehoerigkeit: "deutsch",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Werkzeugfehler-Protokoll", () => {
  // Ein typischer Fall: fuelle_formular ohne mappenId, aber mit
  // vollstaendigen Bewerberangaben. Das Protokoll muss sagen, WELCHES Feld
  // fehlte - und darf keinen einzigen Wert enthalten.
  it("protokolliert Eingabefehler mit Feldnamen und ohne einen einzigen Wert", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await connect();

    const antwort = await client.callTool({
      name: "fuelle_formular",
      arguments: { docId: "1614371e36521a481f22b880", ...PII },
    });

    expect(antwort.isError).toBe(true);
    const [eintrag] = protokolle(warn);
    expect(eintrag).toMatchObject({ werkzeug: "fuelle_formular", art: "eingabe" });
    expect(eintrag.felder).toContainEqual(expect.objectContaining({ pfad: "mappenId" }));
    const alsText = JSON.stringify(eintrag);
    for (const wert of Object.values(PII)) {
      expect(alsText).not.toContain(wert);
    }
  });

  it("nennt erfundene Parameternamen, nicht deren Werte", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await connect();

    await client.callTool({
      name: "fuelle_formular",
      arguments: { mappenId: "m1", docId: "d1", ...PII, geburtsname: "Geheim" },
    });

    const [eintrag] = protokolle(warn);
    expect(eintrag.felder).toContainEqual(expect.objectContaining({ unbekannteNamen: ["geburtsname"] }));
    expect(JSON.stringify(eintrag)).not.toContain("Geheim");
  });

  it("protokolliert einen unbekannten Werkzeugnamen", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await connect();

    const antwort = await client.callTool({ name: "fill_bewerbungsbogen", arguments: {} });

    expect(antwort.isError).toBe(true);
    expect(protokolle(warn)).toContainEqual({ werkzeug: "fill_bewerbungsbogen", art: "unbekanntes-werkzeug" });
  });

  it("protokolliert Handler-Fehler einmal, mit Klasse statt Text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await connect();

    // Gueltige Eingabe, aber ohne Firebase-App im Test scheitert der Handler.
    const antwort = await client.callTool({
      name: "fuelle_formular",
      arguments: { mappenId: "m3k9x0q7w2e8r5t1y6u4i2o9pq", docId: "d1", ...PII },
    });

    expect(antwort.isError).toBe(true);
    const eintraege = protokolle(warn);
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toMatchObject({ werkzeug: "fuelle_formular", art: "ausfuehrung" });
    const alsText = JSON.stringify(eintraege[0]);
    expect(alsText).not.toContain("m3k9x0q7w2e8r5t1y6u4i2o9pq");
    for (const wert of Object.values(PII)) {
      expect(alsText).not.toContain(wert);
    }
  });

  // Das SDK gibt `Error.message` unveraendert als Werkzeugantwort heraus -
  // hier waere es die Meldung des Firebase-SDK, im Ernstfall ein Storage-Pfad
  // mit der mappenId.
  it("gibt bei einem fremden Fehler nur den festen Satz heraus, nicht dessen Text", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await connect();

    const antwort = await client.callTool({
      name: "mappe_status",
      arguments: { mappenId: "m3k9x0q7w2e8r5t1y6u4i2o9pq" },
    });

    expect(antwort.isError).toBe(true);
    const text = (antwort.content as { type: string; text: string }[])[0].text;
    expect(text).toBe(UNERWARTETER_WERKZEUGFEHLER);
    expect(text).not.toMatch(/firebase/i);
  });

  it("laesst unseren eigenen Hinweistext durch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await connect();

    // zaehle_treffer lehnt Suchbegriff UND Ort zugleich mit einem eigenen Satz
    // ab, bevor es Firestore anfasst.
    const antwort = await client.callTool({
      name: "zaehle_treffer",
      arguments: { suchbegriff: "Koch", wunschort: "Köln" },
    });

    expect(antwort.isError).toBe(true);
    const text = (antwort.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/gleichzeitig/);
    expect(text).not.toBe(UNERWARTETER_WERKZEUGFEHLER);
  });

  it("ersetzt Parameternamen, die keine Bezeichner sind", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await connect();

    await client.callTool({
      name: "fuelle_formular",
      arguments: { mappenId: "m1", docId: "d1", ...PII, "Erika Mustermann, 12345 Musterstadt": "x" },
    });

    const [eintrag] = protokolle(warn);
    expect(eintrag.felder).toContainEqual(expect.objectContaining({ unbekannteNamen: ["(ungueltiger Name)"] }));
    expect(JSON.stringify(eintrag)).not.toContain("Mustermann");
  });

  it("schreibt bei erfolgreichen Aufrufen nichts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await connect();

    await client.listTools();

    expect(protokolle(warn)).toEqual([]);
  });
});

describe("beschreibeAusfuehrungsfehler", () => {
  // Storage-Meldungen tragen den Objektpfad mit der
  // mappenId - dem einzigen Zugriffsschutz einer Mappe. Deshalb nie den Text.
  it("protokolliert Klasse und Code, nie den Fehlertext", () => {
    const fehler = Object.assign(
      new Error("No such object: bucket/bewerbungsmappen/m3k9x0q7w2e8r5t1y6u4i2o9p/t5a7 fuer Erika Mustermann"),
      { code: 404 },
    );
    const protokoll = beschreibeAusfuehrungsfehler("schliesse_bewerbungsmappe", fehler);
    expect(protokoll).toEqual({
      werkzeug: "schliesse_bewerbungsmappe",
      art: "ausfuehrung",
      fehlerklasse: "Error",
      statuscode: 404,
    });
  });

  it("nimmt den Namen eigener Fehlerklassen", () => {
    class MappeNichtGefundenError extends Error {
      constructor() {
        super("Mappe m3k9x0q7w2e8r5t1y6u4i2o9p gibt es nicht");
        this.name = "MappeNichtGefundenError";
      }
    }
    expect(beschreibeAusfuehrungsfehler("mappe_status", new MappeNichtGefundenError()).fehlerklasse).toBe(
      "MappeNichtGefundenError",
    );
  });

  it("verwirft Statuscodes, die kein Code sind", () => {
    const fehler = Object.assign(new Error("x"), { code: "Erika Mustermann, Musterweg 12" });
    expect(beschreibeAusfuehrungsfehler("fuelle_formular", fehler).statuscode).toBeUndefined();
  });
});

describe("bereinigeName", () => {
  it("laesst Bezeichner durch und ersetzt alles andere", () => {
    expect(bereinigeName("geburtsname")).toBe("geburtsname");
    expect(bereinigeName("Erika Mustermann")).toBe("(ungueltiger Name)");
    expect(bereinigeName("x".repeat(41))).toBe("(ungueltiger Name)");
    expect(bereinigeName(42)).toBe("(ungueltiger Name)");
  });
});
