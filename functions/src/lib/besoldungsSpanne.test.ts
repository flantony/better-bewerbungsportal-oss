import { describe, it, expect } from "vitest";
import { parseTarifgruppe, spanneAusTarifgruppen, spanneLabel } from "./besoldungsSpanne";

describe("parseTarifgruppe", () => {
  // Die Formen, die in den Ausschreibungen vorkommen.
  it.each([
    ["A7", "A", 7],
    ["A12", "A", 12],
    ["A5 M", "A", 5],
    ["A9 M", "A", 9],
    ["A13 H", "A", 13],
    ["E5", "E", 5],
    ["E9A", "E", 9],
    ["E9B", "E", 9],
  ])("zerlegt %s", (raw, tabelle, stufe) => {
    expect(parseTarifgruppe(raw)).toMatchObject({ tabelle, stufe, anzeige: raw });
  });

  it("gibt null bei unbrauchbaren Werten zurueck", () => {
    for (const raw of ["", "   ", "unbekannt", "X7", "A", "A99"]) {
      expect(parseTarifgruppe(raw), raw).toBeNull();
    }
  });
});

describe("spanneAusTarifgruppen", () => {
  // Die haeufigsten echten Paare.
  it("bildet die Spanne aus beiden Rohfeldern", () => {
    expect(spanneAusTarifgruppen("E5", "E7")).toMatchObject({
      von: "E5",
      bis: "E7",
      tabelle: "E",
      vonStufe: 5,
      bisStufe: 7,
      quelle: "ausschreibung",
    });
    expect(spanneAusTarifgruppen("A7", "A9 M")).toMatchObject({ vonStufe: 7, bisStufe: 9, tabelle: "A" });
  });

  it("erlaubt eine einzelne Gruppe (von = bis)", () => {
    expect(spanneAusTarifgruppen("E3", "E3")).toMatchObject({ von: "E3", bis: "E3", vonStufe: 3, bisStufe: 3 });
  });

  it("faellt auf die Untergrenze zurueck, wenn die Obergrenze fehlt oder unbrauchbar ist", () => {
    expect(spanneAusTarifgruppen("A7", "")).toMatchObject({ von: "A7", bis: "A7", bisStufe: 7 });
    expect(spanneAusTarifgruppen("A7", "Quatsch")).toMatchObject({ bis: "A7", bisStufe: 7 });
  });

  // Eine Spanne ueber zwei Besoldungssysteme hat keine Bedeutung.
  it("verwirft eine Obergrenze aus einer anderen Tabelle", () => {
    expect(spanneAusTarifgruppen("A7", "E9")).toMatchObject({ tabelle: "A", von: "A7", bis: "A7", bisStufe: 7 });
  });

  it("verwirft eine Obergrenze, die unter der Untergrenze liegt", () => {
    expect(spanneAusTarifgruppen("A9", "A7")).toMatchObject({ von: "A9", bis: "A9", bisStufe: 9 });
  });

  it("gibt null zurueck, wenn gar keine Angabe da ist", () => {
    expect(spanneAusTarifgruppen("", "")).toBeNull();
    expect(spanneAusTarifgruppen(undefined, undefined)).toBeNull();
  });
});

describe("spanneLabel", () => {
  it("zeigt eine Spanne mit Bindestrich, einen Einzelwert ohne", () => {
    expect(spanneLabel(spanneAusTarifgruppen("A7", "A9 M")!)).toBe("A7-A9 M");
    expect(spanneLabel(spanneAusTarifgruppen("E3", "E3")!)).toBe("E3");
  });
});
