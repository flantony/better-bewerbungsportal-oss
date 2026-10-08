import { describe, it, expect } from "vitest";
import { facetsFor, invertGuidLists, type FacetIndex } from "./deriveJobFacets";

describe("invertGuidLists", () => {
  it("dreht 'Wert -> Stellen' in 'Stelle -> Wert' um", () => {
    const result = invertGuidLists(
      new Map([
        ["0004", ["marine-a", "marine-b"]],
        ["0002", ["heer-a"]],
      ]),
    );
    expect(result.get("marine-a")).toBe("0004");
    expect(result.get("marine-b")).toBe("0004");
    expect(result.get("heer-a")).toBe("0002");
    expect(result.size).toBe(3);
  });

  it("bleibt bei (in den Daten nicht auftretenden) Mehrfachtreffern deterministisch", () => {
    // Erster Code in Iterationsreihenfolge gewinnt - die Codes werden in fester
    // Reihenfolge abgefragt, das Ergebnis ist damit reproduzierbar.
    const result = invertGuidLists(
      new Map([
        ["0002", ["doppelt"]],
        ["0004", ["doppelt"]],
      ]),
    );
    expect(result.get("doppelt")).toBe("0002");
  });

  it("kommt mit leeren Trefferlisten klar", () => {
    expect(invertGuidLists(new Map([["0012", []]])).size).toBe(0);
    expect(invertGuidLists(new Map()).size).toBe(0);
  });
});

describe("facetsFor", () => {
  const index: FacetIndex = {
    organisationsbereichByGuid: new Map([["a", "0004"]]),
    laufbahngruppeByGuid: new Map([
      ["a", "0009"],
      ["b", "0008"],
    ]),
  };

  it("liefert beide Facetten einer Stelle", () => {
    expect(facetsFor(index, "a")).toEqual({ organisationsbereich: "0004", laufbahngruppe: "0009" });
  });

  it("gibt leere Strings statt undefined zurück, wenn ein Wert fehlt", () => {
    // Viele Stellen haben keinen Organisationsbereich - das ist der
    // Normalfall, kein Fehler, und darf das Firestore-Update
    // nicht mit `undefined` sprengen.
    expect(facetsFor(index, "b")).toEqual({ organisationsbereich: "", laufbahngruppe: "0008" });
    expect(facetsFor(index, "unbekannt")).toEqual({ organisationsbereich: "", laufbahngruppe: "" });
  });
});
