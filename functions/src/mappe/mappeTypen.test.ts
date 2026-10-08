import { describe, it, expect } from "vitest";
import { DOKUMENT_ARTEN, mappenBestand, mappenPrefix } from "./mappeTypen";

describe("mappenBestand", () => {
  it("zaehlt Anzahl und Summe der Dateien", () => {
    const bestand = mappenBestand({
      dokumente: [
        { docId: "a", art: "zeugnis", dateiname: "z.pdf", storagePath: "x", contentType: "application/pdf", sizeBytes: 100, herkunft: "upload", hinzugefuegtAm: 1 },
        { docId: "b", art: "lebenslauf", dateiname: "l.pdf", storagePath: "y", contentType: "application/pdf", sizeBytes: 250, herkunft: "client", hinzugefuegtAm: 2 },
      ],
    });
    expect(bestand).toEqual({ anzahl: 2, summeBytes: 350 });
  });

  it("kommt mit der leeren Mappe klar", () => {
    expect(mappenBestand({ dokumente: [] })).toEqual({ anzahl: 0, summeBytes: 0 });
  });
});

describe("mappenPrefix", () => {
  it("haengt alle Dateien einer Mappe unter einen loeschbaren Pfad", () => {
    expect(mappenPrefix("mabc")).toBe("bewerbungsmappen/mabc/");
  });
});

describe("DOKUMENT_ARTEN", () => {
  it("umfasst genau diese Dokumentarten", () => {
    expect([...DOKUMENT_ARTEN]).toEqual(["anschreiben", "lebenslauf", "zeugnis", "formular", "sonstiges"]);
  });

  it("kennt keine Ausweiskopie", () => {
    expect(DOKUMENT_ARTEN as readonly string[]).not.toContain("ausweiskopie");
  });
});
