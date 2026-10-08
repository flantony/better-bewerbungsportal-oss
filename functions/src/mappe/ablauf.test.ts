import { describe, it, expect } from "vitest";
import { MAPPE_FRIST_MS, istAbgelaufen } from "./ablauf";

const JETZT = 1_800_000_000_000;

/**
 * WOZU: Die Stundenfrist ist eine DSGVO-Zusage (s. DSFA-Eintrag), kein
 * Aufräumkomfort. Sie muss ohne Warten testbar sein, deshalb ist `jetzt` ein
 * Parameter und keine Uhr im Code.
 */
describe("istAbgelaufen", () => {
  it("laesst eine frisch gebaute Mappe stehen", () => {
    expect(istAbgelaufen({ zipGebautAm: JETZT - 60_000, letzteAktivitaetAm: JETZT - 60_000 }, JETZT)).toBe(false);
  });

  it("loescht eine Stunde nach dem Paketbau", () => {
    expect(
      istAbgelaufen({ zipGebautAm: JETZT - MAPPE_FRIST_MS - 1, letzteAktivitaetAm: JETZT - 10_000 }, JETZT),
    ).toBe(true);
  });

  it("loescht auch die liegengelassene Mappe, die nie ein Paket bekam", () => {
    expect(istAbgelaufen({ zipGebautAm: null, letzteAktivitaetAm: JETZT - MAPPE_FRIST_MS - 1 }, JETZT)).toBe(true);
  });

  it("rechnet ohne Paket ab der letzten Aktivitaet, nicht ab der Anlage", () => {
    expect(istAbgelaufen({ zipGebautAm: null, letzteAktivitaetAm: JETZT - 10_000 }, JETZT)).toBe(false);
  });
});
