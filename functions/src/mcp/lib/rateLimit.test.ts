import { describe, it, expect } from "vitest";
import {
  classifyRequest,
  clientKeyFromForwardedFor,
  createRateLimiter,
  DOKUMENT_QUOTA,
  extractRequestId,
  extractToolName,
  FILL_QUOTA,
  GENERAL_QUOTA,
  MAPPE_QUOTA,
  ANLEGEN_QUOTA,
  quotaFor,
  type Quota,
} from "./rateLimit";

const QUOTA: Quota = { capacity: 3, refillPerMinute: 60 };

describe("createRateLimiter", () => {
  it("allows up to capacity, then blocks", () => {
    const limiter = createRateLimiter(() => 0);
    expect(limiter.check("1.2.3.4", QUOTA, "general").allowed).toBe(true);
    expect(limiter.check("1.2.3.4", QUOTA, "general").allowed).toBe(true);
    expect(limiter.check("1.2.3.4", QUOTA, "general").allowed).toBe(true);

    const blocked = limiter.check("1.2.3.4", QUOTA, "general");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    let now = 0;
    const limiter = createRateLimiter(() => now);
    for (let i = 0; i < 3; i++) limiter.check("1.2.3.4", QUOTA, "general");
    expect(limiter.check("1.2.3.4", QUOTA, "general").allowed).toBe(false);

    // 60 Aufrufe/Minute -> nach einer Sekunde ist genau ein Token zurück.
    now += 1_000;
    expect(limiter.check("1.2.3.4", QUOTA, "general").allowed).toBe(true);
    expect(limiter.check("1.2.3.4", QUOTA, "general").allowed).toBe(false);
  });

  it("tracks clients independently", () => {
    const limiter = createRateLimiter(() => 0);
    for (let i = 0; i < 3; i++) limiter.check("1.1.1.1", QUOTA, "general");
    expect(limiter.check("1.1.1.1", QUOTA, "general").allowed).toBe(false);
    expect(limiter.check("2.2.2.2", QUOTA, "general").allowed).toBe(true);
  });

  it("keeps separate buckets per kind so fill abuse cannot block reads", () => {
    const limiter = createRateLimiter(() => 0);
    for (let i = 0; i < 3; i++) limiter.check("1.2.3.4", QUOTA, "fuelle_formular");
    expect(limiter.check("1.2.3.4", QUOTA, "fuelle_formular").allowed).toBe(false);
    expect(limiter.check("1.2.3.4", QUOTA, "general").allowed).toBe(true);
  });
});

describe("extractToolName", () => {
  it("returns the tool name of a tools/call body", () => {
    expect(
      extractToolName({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "fuelle_formular" } }),
    ).toBe("fuelle_formular");
  });

  it("returns null for non-tool-call bodies", () => {
    expect(extractToolName({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })).toBeNull();
    expect(extractToolName({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })).toBeNull();
  });

  it("finds a tool call inside a batch", () => {
    expect(
      extractToolName([
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_jobs" } },
      ]),
    ).toBe("list_jobs");
  });

  it("survives malformed input", () => {
    expect(extractToolName(null)).toBeNull();
    expect(extractToolName("nonsense")).toBeNull();
    expect(extractToolName({ method: "tools/call" })).toBeNull();
    expect(extractToolName({ method: "tools/call", params: { name: 42 } })).toBeNull();
  });
});

describe("classifyRequest", () => {
  it("erkennt das Ausfuellen als teuersten Pfad", () => {
    expect(classifyRequest({ method: "tools/call", params: { name: "fuelle_formular" } })).toBe("fill");
  });

  it("erkennt die Formular-Auslieferung ueber das Tool", () => {
    expect(classifyRequest({ method: "tools/call", params: { name: "hole_formular" } })).toBe("dokument");
  });

  it("erkennt das Eroeffnen einer Mappe - sonst ist sie ein kostenloser Dateiserver", () => {
    expect(classifyRequest({ method: "tools/call", params: { name: "eroeffne_bewerbungsmappe" } })).toBe("anlegen");
    expect(quotaFor("mappe")).toBe(MAPPE_QUOTA);
  });

  /**
   * WOZU: es gibt einen globalen Deckel
   * offener Mappen. Mit dem Mappen-Kontingent (10/Minute) haette eine IP rund
   * 600 Mappen je Stunde anlegen und den Deckel fuer alle fuellen koennen.
   */
  it("drosselt das Anlegen strenger als das Bestuecken - hoechstens rund 60 Mappen je IP und Stunde", () => {
    expect(quotaFor("anlegen")).toBe(ANLEGEN_QUOTA);
    expect(ANLEGEN_QUOTA.capacity + ANLEGEN_QUOTA.refillPerMinute * 60).toBeLessThanOrEqual(65);
    // Ein zweiter und dritter Anlauf bleibt moeglich.
    const limiter = createRateLimiter(() => 0);
    const erlaubt = Array.from({ length: 4 }, () => limiter.check("1.2.3.4", ANLEGEN_QUOTA, "anlegen").allowed);
    expect(erlaubt).toEqual([true, true, true, false]);
  });

  /**
   * WOZU: `fuege_dokument_hinzu` rendert je Aufruf ein PDF, schreibt es nach
   * Storage und ergaenzt das Firestore-Verzeichnis - dieselbe Kostenklasse wie
   * Eroeffnen und Schliessen. Fehlt es in MAPPE_TOOL_NAMES, faellt es unter
   * GENERAL_QUOTA (60/Minute): ausgerechnet der schreibende Weg laege im
   * Kontingent fuer lesende Abfragen.
   */
  it("stuft auch fuege_dokument_hinzu als Mappen-Aufruf ein, nicht als lesende Abfrage", () => {
    expect(classifyRequest({ method: "tools/call", params: { name: "fuege_dokument_hinzu" } })).toBe("mappe");
  });

  it("stuft das Schliessen der Mappe als Mappen-Aufruf ein", () => {
    expect(classifyRequest({ method: "tools/call", params: { name: "schliesse_bewerbungsmappe" } })).toBe("mappe");
  });

  /**
   * WOZU: Die Mengengrenze der Mappe erlaubt zehn Dateien. Eroeffnen (1) + zehn
   * `fuege_dokument_hinzu` + Schliessen (1) sind 12 Aufrufe in einem legitimen
   * Ablauf - ein Kontingent darunter bremst einen echten Bewerber, statt
   * Missbrauch zu treffen.
   */
  it("laesst den laengsten legitimen Mappen-Ablauf durch (12 Aufrufe im Burst)", () => {
    const limiter = createRateLimiter(() => 0);
    for (let i = 0; i < 12; i++) {
      expect(limiter.check("1.2.3.4", MAPPE_QUOTA, "mappe").allowed).toBe(true);
    }
  });

  // Ohne dieses Verhalten liesse sich die Drosselung aushebeln: mappe (strenger,
  // refillPerMinute 3) und dokument (laxer, refillPerMinute 15) im selben Batch -
  // gewinnen darf nur die strengere Art, unabhaengig von der Reihenfolge im Array.
  it("laesst die strengere Art gewinnen, egal in welcher Reihenfolge sie im Batch steht", () => {
    const mappeZuerst = [
      { method: "tools/call", params: { name: "eroeffne_bewerbungsmappe" } },
      { method: "tools/call", params: { name: "hole_formular" } },
    ];
    const dokumentZuerst = [...mappeZuerst].reverse();
    expect(classifyRequest(mappeZuerst)).toBe("anlegen");
    expect(classifyRequest(dokumentZuerst)).toBe("anlegen");
  });

  it("laesst sich auch nicht ueber general herunterhandeln", () => {
    const gemischt = [
      { method: "tools/call", params: { name: "eroeffne_bewerbungsmappe" } },
      { method: "tools/call", params: { name: "list_jobs" } },
    ];
    expect(classifyRequest(gemischt)).toBe("anlegen");
  });

  it("laesst fill nicht durch general verdraengen", () => {
    const batch = [
      { method: "tools/call", params: { name: "fuelle_formular" } },
      { method: "tools/call", params: { name: "list_jobs" } },
    ];
    expect(classifyRequest(batch)).toBe("fill");
  });

  it("laesst list_jobs im allgemeinen Kontingent", () => {
    expect(classifyRequest({ method: "tools/call", params: { name: "list_jobs" } })).toBe("general");
  });

  // Der eigentliche Sinn dieser Funktion: ueber resources/read laesst sich
  // dieselbe Datei holen. Wuerde nur der Tool-Weg gedrosselt, waere ausgerechnet
  // der teure Pfad der ungedrosselte.
  it("erkennt die Formular-Auslieferung auch ueber resources/read", () => {
    expect(classifyRequest({ method: "resources/read", params: { uri: "bw://formular/abc123" } })).toBe("dokument");
  });

  it("laesst das Lesen der Wissensseiten im allgemeinen Kontingent", () => {
    expect(classifyRequest({ method: "resources/read", params: { uri: "bw://wissen/besoldung" } })).toBe("general");
  });

  it("stuft lesende Tools und den Handshake als allgemein ein", () => {
    expect(classifyRequest({ method: "tools/call", params: { name: "list_jobs" } })).toBe("general");
    expect(classifyRequest({ method: "initialize" })).toBe("general");
    expect(classifyRequest(null)).toBe("general");
  });

  it("nimmt im Batch das strengste Kontingent", () => {
    const batch = [
      { method: "tools/call", params: { name: "list_jobs" } },
      { method: "resources/read", params: { uri: "bw://formular/abc" } },
      { method: "tools/call", params: { name: "fuelle_formular" } },
    ];
    expect(classifyRequest(batch)).toBe("fill");
  });

  it("ordnet jeder Art ihr Kontingent zu, streng vor grosszuegig", () => {
    expect(quotaFor("fill")).toBe(FILL_QUOTA);
    expect(quotaFor("dokument")).toBe(DOKUMENT_QUOTA);
    expect(quotaFor("general")).toBe(GENERAL_QUOTA);
    expect(FILL_QUOTA.capacity).toBeLessThan(DOKUMENT_QUOTA.capacity);
    expect(DOKUMENT_QUOTA.capacity).toBeLessThan(GENERAL_QUOTA.capacity);
  });
});

describe("clientKeyFromForwardedFor", () => {
  it("nimmt den rechtesten Eintrag, damit ein gefälschter Header nicht greift", () => {
    // Ein Angreifer schickt "1.1.1.1" selbst mit; die Google-Infrastruktur
    // hängt die echte IP rechts an. Nur der rechteste Wert ist vertrauenswürdig.
    expect(clientKeyFromForwardedFor('1.1.1.1, 203.0.113.7', undefined)).toBe('203.0.113.7');
  });

  it("verhindert, dass wechselnde Fake-IPs eigene Kontingente bekommen", () => {
    const echt = '203.0.113.7';
    const a = clientKeyFromForwardedFor(`10.0.0.1, ${echt}`, undefined);
    const b = clientKeyFromForwardedFor(`10.0.0.2, ${echt}`, undefined);
    expect(a).toBe(b);
  });

  it("kommt mit einem einzelnen Eintrag und mit Array-Headern klar", () => {
    expect(clientKeyFromForwardedFor('203.0.113.7', undefined)).toBe('203.0.113.7');
    expect(clientKeyFromForwardedFor(['1.1.1.1', '203.0.113.7'], undefined)).toBe('203.0.113.7');
  });

  it("fällt auf die Socket-Adresse und zuletzt auf 'unknown' zurück", () => {
    expect(clientKeyFromForwardedFor(undefined, '198.51.100.4')).toBe('198.51.100.4');
    expect(clientKeyFromForwardedFor('   ', undefined)).toBe('unknown');
    expect(clientKeyFromForwardedFor(undefined, undefined)).toBe('unknown');
  });
});

describe("extractRequestId", () => {
  it("passes through string and number ids", () => {
    expect(extractRequestId({ id: 7 })).toBe(7);
    expect(extractRequestId({ id: "abc" })).toBe("abc");
  });

  it("returns null when there is no usable id", () => {
    expect(extractRequestId({})).toBeNull();
    expect(extractRequestId(null)).toBeNull();
    expect(extractRequestId([{ id: 1 }])).toBeNull();
  });
});
