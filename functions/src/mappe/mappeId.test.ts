import { describe, it, expect } from "vitest";
import { EINMAL_TOKEN_REGEX, MAPPEN_ID_REGEX, neueMappenId, neuerEinmalToken } from "./mappeId";

/**
 * WOZU: Die Kennung ist der einzige Zugriffsschutz der Mappe - es gibt kein
 * Konto. Ist sie ratbar, liest ein Fremder Zeugnisse.
 */
describe("neueMappenId", () => {
  it("ist URL-sicher und lang genug", () => {
    const id = neueMappenId();
    expect(id).toMatch(/^[0-9a-z]{26,}$/);
  });

  // web/src/features/mappe/lib/mappen-id.ts: die Mappenseite liest nur, wenn die
  // Kennung aus der URL genau dieses Format hat - weicht es ab, findet die
  // Seite keine Mappe mehr.
  it("hat genau das Format, das die Mappenseite vor dem Lesen prueft", async () => {
    const { istMappenId } = await import("../../../web/src/features/mappe/lib/mappen-id");
    for (let i = 0; i < 200; i++) expect(istMappenId(neueMappenId())).toBe(true);
  });

  it("wiederholt sich nicht", () => {
    const ids = new Set(Array.from({ length: 500 }, () => neueMappenId()));
    expect(ids.size).toBe(500);
  });

  it("erzeugt Token getrennt von der Kennung", () => {
    expect(neuerEinmalToken()).not.toBe(neueMappenId());
    expect(neuerEinmalToken()).toMatch(/^[0-9a-z]{26,}$/);
  });
});

/**
 * WOZU: eine docId aus dem Konto-Endpunkt wird gegen
 * dieses Format geprueft, BEVOR ueberhaupt nachgeschlagen wird - alles, was
 * nicht von `neuerEinmalToken` stammen kann, wird ohne Firestore-/
 * Storage-Zugriff abgelehnt.
 */
describe("EINMAL_TOKEN_REGEX", () => {
  it("passt auf 500 echt erzeugte Token", () => {
    for (let i = 0; i < 500; i++) {
      expect(neuerEinmalToken()).toMatch(EINMAL_TOKEN_REGEX);
    }
  });

  it("lehnt eine falsche Laenge ab", () => {
    expect("t123").not.toMatch(EINMAL_TOKEN_REGEX);
    expect("t" + "a".repeat(26)).not.toMatch(EINMAL_TOKEN_REGEX);
  });

  it("lehnt ein fehlendes/falsches Praefix ab", () => {
    expect("0".repeat(26)).not.toMatch(EINMAL_TOKEN_REGEX);
    expect("m" + "0".repeat(25)).not.toMatch(EINMAL_TOKEN_REGEX);
  });

  it("lehnt Grossbuchstaben und Sonderzeichen ab", () => {
    expect("t" + "A".repeat(25)).not.toMatch(EINMAL_TOKEN_REGEX);
    expect("t" + "../".padEnd(25, "0")).not.toMatch(EINMAL_TOKEN_REGEX);
  });
});

/**
 * WOZU: die Mappen-Kennung kommt aus Werkzeug-
 * aufrufen und HTTP-Bodies und wird zu einem Firestore-Pfad und einem
 * Storage-Praefix. Alles, was `neueMappenId` nicht erzeugt haben kann, wird
 * vor jedem Zugriff abgelehnt.
 */
describe("MAPPEN_ID_REGEX", () => {
  it("passt auf 500 echt erzeugte Kennungen", () => {
    for (let i = 0; i < 500; i++) {
      expect(neueMappenId()).toMatch(MAPPEN_ID_REGEX);
    }
  });

  it("lehnt Pfadbestandteile, falsche Laenge und ein Token ab", () => {
    expect("m" + "0".repeat(24)).not.toMatch(MAPPEN_ID_REGEX);
    expect("m" + "0".repeat(26)).not.toMatch(MAPPEN_ID_REGEX);
    expect("m" + "../x".padEnd(25, "0")).not.toMatch(MAPPEN_ID_REGEX);
    expect("m" + "0".repeat(24) + "/").not.toMatch(MAPPEN_ID_REGEX);
    expect(neuerEinmalToken()).not.toMatch(MAPPEN_ID_REGEX);
  });
});
