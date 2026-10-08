import { describe, it, expect } from "vitest";
import {
  EINSTIEGSWEG_BEDEUTUNG,
  EINSTIEGSWEG_BEDEUTUNG_DE,
  einstiegswegAus,
  einstiegswegBedeutung,
  EINSTIEGSWEG_WERTE,
} from "./einstiegsweg";

describe("einstiegswegAus", () => {
  // Echte refCodes aus dem Bestand.
  it("erkennt Reserveoffizier am ROB-Praefix", () => {
    expect(einstiegswegAus("ROB-Nautik-Offz-2026-01-E")).toBe("reserveoffizier");
    expect(einstiegswegAus("ROB-SeeHa-Offz-2026-01-E")).toBe("reserveoffizier");
  });

  it("erkennt Seiteneinstieg am SE_-Praefix", () => {
    expect(einstiegswegAus("SE_OFFZ_STF_2026-01-E")).toBe("seiteneinstieg");
    expect(einstiegswegAus("SE_HUM_FA_THC_ULM_2026-E")).toBe("seiteneinstieg");
  });

  it("erkennt Wiedereinstellung am WE_-Praefix", () => {
    expect(einstiegswegAus("WE_OFFZ_CYBER_2026-01-E")).toBe("wiedereinstellung");
  });

  it("liefert leer fuer den Normalfall", () => {
    expect(einstiegswegAus("B750222HA-2026-00006154-E")).toBe("");
    expect(einstiegswegAus("SE_OFFZ".slice(0, 2))).toBe("");
    expect(einstiegswegAus("")).toBe("");
  });

  // Ein Praefix darf nicht mitten im Kennzeichen treffen - sonst wuerde jede
  // Ausschreibung mit "SE_" irgendwo im Code falsch eingeordnet.
  it("trifft nur am Anfang, nicht irgendwo im Kennzeichen", () => {
    expect(einstiegswegAus("B750-SE_OFFZ-2026")).toBe("");
    expect(einstiegswegAus("XROB-Nautik")).toBe("");
  });

  it("ist unabhaengig von Gross-/Kleinschreibung und Leerraum", () => {
    expect(einstiegswegAus("  rob-nautik-offz  ")).toBe("reserveoffizier");
    expect(einstiegswegAus("se_hum_fa")).toBe("seiteneinstieg");
  });

  // ROB wird vor SE/WE geprueft, damit eine kombinierte Kennung nicht als
  // reiner Seiteneinstieg durchgeht.
  it("gibt Reserveoffizier den Vorrang vor Seiteneinstieg", () => {
    expect(einstiegswegAus("ROB-SE_kombiniert-2026")).toBe("reserveoffizier");
  });
});

describe("einstiegswegBedeutung", () => {
  it("hat zu jedem Wert einen Klartext", () => {
    for (const wert of EINSTIEGSWEG_WERTE) {
      expect(einstiegswegBedeutung(wert), wert).toBeTruthy();
    }
  });

  it("liefert leer fuer den Normalfall, statt etwas zu erfinden", () => {
    expect(einstiegswegBedeutung("")).toBe("");
    expect(einstiegswegBedeutung("gibtsnicht")).toBe("");
  });

  it("erklaert Reserveoffizier als Dienst neben dem Zivilberuf", () => {
    expect(einstiegswegBedeutung("reserveoffizier")).toMatch(/civilian job|outside regular/i);
  });

  it("fuehrt Deutsch und Englisch mit denselben Werten", () => {
    expect(Object.keys(EINSTIEGSWEG_BEDEUTUNG_DE).sort()).toEqual(Object.keys(EINSTIEGSWEG_BEDEUTUNG).sort());
    expect(Object.keys(EINSTIEGSWEG_BEDEUTUNG_DE).sort()).toEqual([...EINSTIEGSWEG_WERTE].sort());
  });
});
