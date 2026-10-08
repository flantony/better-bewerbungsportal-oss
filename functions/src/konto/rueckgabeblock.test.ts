import { describe, expect, it } from "vitest";
import { parseRueckgabeblock } from "./rueckgabeblock";

describe("parseRueckgabeblock", () => {
  it("liest nur einen Abschnitt", () => {
    const text = "=== BEWERBUNG:ANSCHREIBEN ===\nSehr geehrte Damen und Herren,\n\nmit großem Interesse ...\n=== ENDE ===";
    const ergebnis = parseRueckgabeblock(text);
    expect(ergebnis.anschreiben).toBe("Sehr geehrte Damen und Herren,\n\nmit großem Interesse ...");
    expect(ergebnis.lebenslauf).toBeUndefined();
    expect(ergebnis.unbekannteAbschnitte).toEqual([]);
  });

  it("liest beide Abschnitte", () => {
    const text = [
      "=== BEWERBUNG:ANSCHREIBEN ===",
      "Anschreiben-Text",
      "=== BEWERBUNG:LEBENSLAUF ===",
      "Lebenslauf-Text",
      "=== ENDE ===",
    ].join("\n");
    const ergebnis = parseRueckgabeblock(text);
    expect(ergebnis.anschreiben).toBe("Anschreiben-Text");
    expect(ergebnis.lebenslauf).toBe("Lebenslauf-Text");
  });

  it("beendet einen Abschnitt auch ohne === ENDE ===, wenn der naechste Marker kommt", () => {
    const text = ["=== BEWERBUNG:ANSCHREIBEN ===", "Anschreiben-Text", "=== BEWERBUNG:LEBENSLAUF ===", "Lebenslauf-Text"].join(
      "\n",
    );
    const ergebnis = parseRueckgabeblock(text);
    expect(ergebnis.anschreiben).toBe("Anschreiben-Text");
    expect(ergebnis.lebenslauf).toBe("Lebenslauf-Text");
  });

  it("nimmt den letzten Abschnitt bei einem doppelten Abschnitt und meldet es als Hinweis", () => {
    const text = [
      "=== BEWERBUNG:ANSCHREIBEN ===",
      "Erster Versuch",
      "=== BEWERBUNG:ANSCHREIBEN ===",
      "Zweiter Versuch",
      "=== ENDE ===",
    ].join("\n");
    const ergebnis = parseRueckgabeblock(text);
    expect(ergebnis.anschreiben).toBe("Zweiter Versuch");
    expect(ergebnis.unbekannteAbschnitte).toEqual(["BEWERBUNG:ANSCHREIBEN (doppelt)"]);
  });

  it("meldet einen unbekannten Marker, statt ihn stillschweigend zu verwerfen", () => {
    const text = ["=== BEWERBUNG:SONSTIGES ===", "Text", "=== ENDE ==="].join("\n");
    const ergebnis = parseRueckgabeblock(text);
    expect(ergebnis.anschreiben).toBeUndefined();
    expect(ergebnis.lebenslauf).toBeUndefined();
    expect(ergebnis.unbekannteAbschnitte).toEqual(["BEWERBUNG:SONSTIGES"]);
  });

  it("toleriert Leerzeilen, fuehrende/abschliessende Leerzeichen und CRLF", () => {
    const text = [
      "  === BEWERBUNG:ANSCHREIBEN ===  ",
      "",
      "  Zeile mit Leerraum drumherum  ",
      "",
      "=== ENDE ===",
    ].join("\r\n");
    const ergebnis = parseRueckgabeblock(text);
    expect(ergebnis.anschreiben).toBe("Zeile mit Leerraum drumherum");
  });

  it("toleriert einen Markdown-Codezaun um den ganzen Block", () => {
    const text = ["```", "=== BEWERBUNG:ANSCHREIBEN ===", "Anschreiben-Text", "=== ENDE ===", "```"].join("\n");
    const ergebnis = parseRueckgabeblock(text);
    expect(ergebnis.anschreiben).toBe("Anschreiben-Text");
  });

  it("liefert leeres Ergebnis ohne jeden Marker", () => {
    const ergebnis = parseRueckgabeblock("Nur ein normaler Text ohne Marker.");
    expect(ergebnis).toEqual({ unbekannteAbschnitte: [] });
  });

  it("behandelt Text vor dem ersten Marker als nicht zugeordnet (kein Abschnittsinhalt)", () => {
    const text = ["Einleitender Text", "=== BEWERBUNG:ANSCHREIBEN ===", "Anschreiben-Text", "=== ENDE ==="].join("\n");
    const ergebnis = parseRueckgabeblock(text);
    expect(ergebnis.anschreiben).toBe("Anschreiben-Text");
  });

  it("trimmt Inhalt am Anfang und Ende eines Abschnitts, behaelt innere Leerzeilen", () => {
    const text = ["=== BEWERBUNG:ANSCHREIBEN ===", "", "Zeile 1", "", "Zeile 2", "", "=== ENDE ==="].join("\n");
    const ergebnis = parseRueckgabeblock(text);
    expect(ergebnis.anschreiben).toBe("Zeile 1\n\nZeile 2");
  });
});
