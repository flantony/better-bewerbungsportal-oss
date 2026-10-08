import { describe, it, expect } from "vitest";
import { deriveBesoldung, DIENSTGRAD_BESOLDUNG } from "./besoldung";

describe("Dienstgrad-Tabelle (Anlage I BBesG)", () => {
  it("bildet die im Gesetz mehrdeutigen Dienstgrade als Spanne ab", () => {
    // Hauptmann/Kapitänleutnant stehen in Anlage I sowohl unter A 11 als auch
    // unter A 12 - eine Festlegung auf einen Wert wäre schlicht falsch.
    const hauptmann = DIENSTGRAD_BESOLDUNG.find((e) => e.dienstgrad === "Hauptmann");
    expect(hauptmann).toMatchObject({ von: 11, bis: 12 });
    const oberstleutnant = DIENSTGRAD_BESOLDUNG.find((e) => e.dienstgrad === "Oberstleutnant");
    expect(oberstleutnant).toMatchObject({ von: 14, bis: 15 });
  });

  it("hält sich an die Grenzen der Besoldungsordnung A (A3-A16)", () => {
    for (const eintrag of DIENSTGRAD_BESOLDUNG) {
      expect(eintrag.von, eintrag.dienstgrad).toBeGreaterThanOrEqual(3);
      expect(eintrag.bis, eintrag.dienstgrad).toBeLessThanOrEqual(16);
      expect(eintrag.bis, eintrag.dienstgrad).toBeGreaterThanOrEqual(eintrag.von);
    }
  });

  it("führt keinen Dienstgrad doppelt", () => {
    const namen = DIENSTGRAD_BESOLDUNG.map((e) => e.dienstgrad);
    expect(new Set(namen).size).toBe(namen.length);
  });
});

describe("deriveBesoldung", () => {
  it("leitet für einen mehrdeutigen Dienstgrad die Spanne ab", () => {
    const result = deriveBesoldung("Einstellung als Hauptmann (m/w/d)");
    expect(result?.label).toBe("A11-A12");
    expect(result?.laufbahngruppen).toEqual(["Offiziere"]);
  });

  it("gibt bei eindeutigen Dienstgraden einen einzelnen Wert aus", () => {
    expect(deriveBesoldung("Major (m/w/d)")?.label).toBe("A13");
    expect(deriveBesoldung("Oberst (m/w/d)")?.label).toBe("A16");
  });

  // Der eigentliche Fallstrick: kürzere Dienstgrade stecken in längeren drin.
  it("verwechselt längere Dienstgrade nicht mit den enthaltenen kürzeren", () => {
    expect(deriveBesoldung("Oberleutnant zur See")?.dienstgrade).toEqual(["Oberleutnant zur See"]);
    expect(deriveBesoldung("Oberstleutnant")?.dienstgrade).toEqual(["Oberstleutnant"]);
    expect(deriveBesoldung("Oberstabsfeldwebel")?.dienstgrade).toEqual(["Oberstabsfeldwebel"]);
    expect(deriveBesoldung("Hauptbootsmann")?.dienstgrade).toEqual(["Hauptbootsmann"]);
  });

  it("erkennt Marine-Dienstgrade", () => {
    expect(deriveBesoldung("Kapitänleutnant (m/w/d)")?.label).toBe("A11-A12");
    expect(deriveBesoldung("Kapitän zur See")?.label).toBe("A16");
    expect(deriveBesoldung("Bootsmann (m/w/d)")?.laufbahngruppen).toEqual(["Feldwebel"]);
  });

  it("spannt über mehrere genannte Dienstgrade auf", () => {
    const result = deriveBesoldung("Verwendung als Leutnant bis Hauptmann");
    expect(result?.von).toBe(9);
    expect(result?.bis).toBe(12);
    expect(result?.label).toBe("A9-A12");
  });

  it("gibt lieber nichts zurück als etwas Falsches", () => {
    expect(deriveBesoldung("Fachinformatikerin / Fachinformatiker (m/w/d)")).toBeNull();
    expect(deriveBesoldung("")).toBeNull();
    expect(deriveBesoldung("Sachbearbeitung Personalgewinnung")).toBeNull();
  });

  // Der Ortsname enthält "Oberst".
  it("hält Ortsnamen und Komposita nicht für Dienstgrade", () => {
    expect(deriveBesoldung("Fachärztin / Facharzt (m/w/d) für Arbeitsmedizin Idar-Oberstein")).toBeNull();
    expect(deriveBesoldung("Leitung Bootsmannschaft")).toBeNull();
  });

  it("arbeitet unabhängig von der Groß-/Kleinschreibung", () => {
    expect(deriveBesoldung("bewerbung als HAUPTMANN")?.label).toBe("A11-A12");
  });

  // "mit Portepee" ist die Sammelbezeichnung der Feldwebel-Dienstgrade, nicht
  // der Dienstgrad "Unteroffizier" - die naive Zuordnung ergaebe A5 statt A7+.
  it("versteht die Portepee-Sammelbegriffe", () => {
    const mit = deriveBesoldung("Mindestens im Dienstgrad eines Unteroffizier mit Portepee");
    expect(mit?.label).toBe("A7-A9");
    expect(mit?.laufbahngruppen).toEqual(["Feldwebel"]);

    const ohne = deriveBesoldung("Unteroffizier ohne Portepee");
    expect(ohne?.label).toBe("A5-A6");
    expect(ohne?.laufbahngruppen).toEqual(["Unteroffiziere"]);
  });

  it("erkennt den einfachen Dienstgrad weiterhin ohne Zusatz", () => {
    expect(deriveBesoldung("Unteroffizier (m/w/d)")?.label).toBe("A5");
  });

  it("erkennt Dienstgrade in echten Ausschreibungstiteln", () => {
    expect(deriveBesoldung("S6 Feldwebel (m/w/d)")?.label).toBe("A7");
    expect(deriveBesoldung("Militärisches Nachrichtenwesen Feldwebel/Bootsmann (m/w/d)")?.label).toBe("A7");
  });
});
