import { describe, expect, it } from "vitest";
import { istGeschlossen, merke, merkeAusMail, ohneGeschlossene, ohnePlatzAufMerkliste, vergiss } from "./merkliste";
import { MERKLISTE_MAX, type GemerkteStelle } from "./kontoTypen";

const JETZT = 1_800_000_000_000;

/**
 * WOZU: Doppelklick, zwei Tabs, ein Retry nach Netzfehler - jeder davon darf
 * eine Stelle nicht zweimal auf die Liste setzen. Und die Obergrenze haelt das
 * Dokument unter der Firestore-Grenze von 1 MiB.
 */
describe("merke", () => {
  it("setzt eine neue Stelle vorne an", () => {
    const alt: GemerkteStelle[] = [{ pinstGuid: "A", gemerktAm: JETZT - 1 }];
    const { liste, ergebnis } = merke(alt, "B", JETZT);
    expect(ergebnis).toBe("gemerkt");
    expect(liste.map((s) => s.pinstGuid)).toEqual(["B", "A"]);
  });

  it("merkt dieselbe Stelle nicht zweimal", () => {
    const alt: GemerkteStelle[] = [{ pinstGuid: "A", gemerktAm: JETZT - 1 }];
    const { liste, ergebnis } = merke(alt, "A", JETZT);
    expect(ergebnis).toBe("schon-gemerkt");
    expect(liste).toEqual(alt);
  });

  it("verweigert bei voller Liste, statt still die aelteste zu verdraengen", () => {
    const voll = Array.from({ length: MERKLISTE_MAX }, (_, i) => ({ pinstGuid: `S${i}`, gemerktAm: i }));
    const { liste, ergebnis } = merke(voll, "NEU", JETZT);
    expect(ergebnis).toBe("liste-voll");
    expect(liste).toHaveLength(MERKLISTE_MAX);
  });
});

describe("vergiss", () => {
  it("entfernt genau diese Stelle", () => {
    const alt: GemerkteStelle[] = [
      { pinstGuid: "A", gemerktAm: 1 },
      { pinstGuid: "B", gemerktAm: 2 },
    ];
    expect(vergiss(alt, "A").map((s) => s.pinstGuid)).toEqual(["B"]);
  });

  it("ist bei einer unbekannten Stelle folgenlos", () => {
    const alt: GemerkteStelle[] = [{ pinstGuid: "A", gemerktAm: 1 }];
    expect(vergiss(alt, "X")).toEqual(alt);
  });
});

/**
 * WOZU: was eine Treffer-Mail meldet, kommt auf
 * die Merkliste - dort findet der Bewerber die Stellen wieder, auch die, die
 * die Mail nur als "und N weitere" zaehlt. Nichts Vorhandenes darf sich dabei
 * aendern, und eine volle Liste verdraengt nichts.
 */
describe("merkeAusMail", () => {
  it("setzt die Stellen in Mail-Reihenfolge (neueste zuerst) oben an und vermerkt die Mail", () => {
    const alt: GemerkteStelle[] = [{ pinstGuid: "A", gemerktAm: 1 }];
    const { liste, hinzugefuegt, keinPlatz } = merkeAusMail(alt, ["NEU1", "NEU2"], JETZT);
    expect(liste).toEqual([
      { pinstGuid: "NEU1", gemerktAm: JETZT, ausMail: JETZT },
      { pinstGuid: "NEU2", gemerktAm: JETZT, ausMail: JETZT },
      { pinstGuid: "A", gemerktAm: 1 },
    ]);
    expect(hinzugefuegt).toBe(2);
    expect(keinPlatz).toBe(0);
  });

  it("laesst eine schon gemerkte Stelle unveraendert - auch ein selbst gemerkter Eintrag bleibt einer", () => {
    const alt: GemerkteStelle[] = [{ pinstGuid: "A", gemerktAm: 1 }];
    const { liste, hinzugefuegt } = merkeAusMail(alt, ["A", "B", "B"], JETZT);
    expect(liste).toEqual([
      { pinstGuid: "B", gemerktAm: JETZT, ausMail: JETZT },
      { pinstGuid: "A", gemerktAm: 1 },
    ]);
    expect(hinzugefuegt).toBe(1);
  });

  it("gibt dieselbe Liste zurueck, wenn nichts dazukommt", () => {
    const alt: GemerkteStelle[] = [{ pinstGuid: "A", gemerktAm: 1 }];
    const ergebnis = merkeAusMail(alt, ["A"], JETZT);
    expect(ergebnis.liste).toBe(alt);
    expect(ergebnis.hinzugefuegt).toBe(0);
  });

  it("fuellt eine fast volle Liste nur bis MERKLISTE_MAX auf und zaehlt den Rest - ohne zu verdraengen", () => {
    const fastVoll = Array.from({ length: MERKLISTE_MAX - 1 }, (_, i) => ({ pinstGuid: `S${i}`, gemerktAm: i }));
    const { liste, hinzugefuegt, keinPlatz } = merkeAusMail(fastVoll, ["N1", "N2", "N3"], JETZT);
    expect(liste).toHaveLength(MERKLISTE_MAX);
    expect(liste[0].pinstGuid).toBe("N1");
    expect(liste.slice(1)).toEqual(fastVoll);
    expect(hinzugefuegt).toBe(1);
    expect(keinPlatz).toBe(2);
  });

  it("aendert eine volle Liste gar nicht", () => {
    const voll = Array.from({ length: MERKLISTE_MAX }, (_, i) => ({ pinstGuid: `S${i}`, gemerktAm: i }));
    const ergebnis = merkeAusMail(voll, ["N1"], JETZT);
    expect(ergebnis.liste).toBe(voll);
    expect(ergebnis.keinPlatz).toBe(1);
    expect(ohnePlatzAufMerkliste(voll, ["N1", "S0"])).toBe(1);
  });
});

/**
 * WOZU: geschlossen heisst, was der Sync dazu macht - `active: false` oder
 * ganz geloescht. Ein Dokument ohne `active`-Feld ist KEIN Beleg; geloescht
 * wird nur auf einen Beleg hin.
 */
describe("istGeschlossen / ohneGeschlossene", () => {
  it("geschlossen: Dokument fehlt oder active === false", () => {
    expect(istGeschlossen({ exists: false })).toBe(true);
    expect(istGeschlossen({ exists: true, active: false })).toBe(true);
  });

  it("offen: active === true, und im Zweifel (Feld fehlt, kaputter Wert)", () => {
    expect(istGeschlossen({ exists: true, active: true })).toBe(false);
    expect(istGeschlossen({ exists: true })).toBe(false);
    expect(istGeschlossen({ exists: true, active: "false" })).toBe(false);
  });

  it("entfernt geschlossene Stellen - selbst gemerkte wie aus der Mail, Eintraege ohne Herkunft eingeschlossen", () => {
    const liste: GemerkteStelle[] = [
      { pinstGuid: "A", gemerktAm: 1, ausMail: 1 },
      { pinstGuid: "B", gemerktAm: 2 },
      { pinstGuid: "C", gemerktAm: 3 },
    ];
    expect(ohneGeschlossene(liste, new Set(["A", "B"]))).toEqual([{ pinstGuid: "C", gemerktAm: 3 }]);
  });
});
