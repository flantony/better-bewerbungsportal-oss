import { describe, it, expect } from "vitest";
import { parseJsonLenient, sanitizeAttributes, SCHEMA_VERSION } from "./extractJobAttributes";

describe("parseJsonLenient", () => {
  it("liest saubere Antworten", () => {
    expect(parseJsonLenient('{"dienstgrad":"Hauptmann"}')).toEqual({ dienstgrad: "Hauptmann" });
  });

  // Beides kommt trotz responseMimeType vor.
  it("verzeiht Markdown-Zäune", () => {
    expect(parseJsonLenient('```json\n{"dienstgrad":"Major"}\n```')).toEqual({ dienstgrad: "Major" });
  });

  it("verzeiht Begleittext um das JSON", () => {
    expect(parseJsonLenient('Hier das Ergebnis:\n{"dienstgrad":"Major"}\nViel Erfolg!')).toEqual({
      dienstgrad: "Major",
    });
  });

  it("gibt null zurück, wenn wirklich kein Objekt drin ist", () => {
    expect(parseJsonLenient("Ich kann das nicht extrahieren.")).toBeNull();
    expect(parseJsonLenient("")).toBeNull();
    // Ein Array ist kein Attributobjekt.
    expect(parseJsonLenient('["Hauptmann"]')).toBeNull();
  });
});

describe("sanitizeAttributes", () => {
  it("leitet die Besoldung aus der amtlichen Tabelle ab, nicht vom Modell", () => {
    const result = sanitizeAttributes({ dienstgrad: "Hauptmann", seiteneinstieg: "ja" });
    expect(result.besoldung).toEqual({ label: "A11-A12", von: 11, bis: 12 });
    expect(result.laufbahngruppen).toEqual(["Offiziere"]);
  });

  // Der eigentliche Schutz: erfindet das Modell einen Dienstgrad, gibt es dafür
  // keine Tabellenzeile - und damit auch keine Besoldungsangabe.
  it("verwirft Dienstgrade, die es nicht gibt", () => {
    const result = sanitizeAttributes({ dienstgrad: "Obergeneralfeldmarschall" });
    expect(result.dienstgrad).toBe("");
    expect(result.besoldung).toBeNull();
    expect(result.laufbahngruppen).toEqual([]);
  });

  it("normalisiert auf die Schreibweise der Tabelle", () => {
    expect(sanitizeAttributes({ dienstgrad: "kapitänleutnant" }).dienstgrad).toBe("Kapitänleutnant");
  });

  it("fällt bei ungültigem Seiteneinstieg-Wert auf 'unklar' zurück", () => {
    expect(sanitizeAttributes({ seiteneinstieg: "vielleicht" }).seiteneinstieg).toBe("unklar");
    expect(sanitizeAttributes({}).seiteneinstieg).toBe("unklar");
    expect(sanitizeAttributes({ seiteneinstieg: "JA" }).seiteneinstieg).toBe("ja");
  });

  it("begrenzt Berufserfahrung auf plausible Werte", () => {
    expect(sanitizeAttributes({ berufserfahrungJahre: 2 }).berufserfahrungJahre).toBe(2);
    expect(sanitizeAttributes({ berufserfahrungJahre: -5 }).berufserfahrungJahre).toBe(0);
    expect(sanitizeAttributes({ berufserfahrungJahre: 999 }).berufserfahrungJahre).toBe(40);
    expect(sanitizeAttributes({ berufserfahrungJahre: "zwei" }).berufserfahrungJahre).toBe(0);
    expect(sanitizeAttributes({ berufserfahrungJahre: 2.6 }).berufserfahrungJahre).toBe(3);
  });

  it("räumt Sprachlisten auf", () => {
    expect(sanitizeAttributes({ sprachen: ["Englisch B2", 42, " Französisch "] }).sprachen).toEqual([
      "Englisch B2",
      "Französisch",
    ]);
    expect(sanitizeAttributes({ sprachen: "Englisch" }).sprachen).toEqual([]);
    expect(sanitizeAttributes({ sprachen: new Array(20).fill("Englisch") }).sprachen).toHaveLength(8);
  });

  it("kürzt überlange Freitextfelder", () => {
    const lang = "x".repeat(500);
    expect(sanitizeAttributes({ abschluss: lang }).abschluss).toHaveLength(120);
    expect(sanitizeAttributes({ belegstelle: lang }).belegstelle).toHaveLength(200);
  });

  it("übernimmt plausible Altersgrenzen und verwirft unplausible", () => {
    expect(sanitizeAttributes({ mindestalter: 17, hoechstalter: 34 })).toMatchObject({
      mindestalter: 17,
      hoechstalter: 34,
    });
    // Eine falsch gelesene Jahreszahl ist der wahrscheinlichste Fehlerfall.
    expect(sanitizeAttributes({ hoechstalter: 2026 }).hoechstalter).toBe(0);
    expect(sanitizeAttributes({ mindestalter: 3 }).mindestalter).toBe(0);
  });

  it("verwirft ein Höchstalter unter dem Mindestalter statt eine unmögliche Spanne zu liefern", () => {
    expect(sanitizeAttributes({ mindestalter: 30, hoechstalter: 20 })).toMatchObject({
      mindestalter: 30,
      hoechstalter: 0,
    });
  });

  it("nimmt die Verpflichtungsdauer wörtlich, weil die Formen uneinheitlich sind", () => {
    expect(sanitizeAttributes({ verpflichtungsdauer: "mindestens 12 Jahre" }).verpflichtungsdauer).toBe(
      "mindestens 12 Jahre",
    );
    expect(sanitizeAttributes({}).verpflichtungsdauer).toBe("");
  });

  it("stempelt die Schema-Version für die Auditierbarkeit", () => {
    expect(sanitizeAttributes({}).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("liefert bei komplett leerer Antwort einen sauberen Leerbefund", () => {
    expect(sanitizeAttributes({})).toMatchObject({
      dienstgrad: "",
      besoldung: null,
      abschluss: "",
      sprachen: [],
      berufserfahrungJahre: 0,
    });
  });
});
