import { describe, it, expect } from "vitest";
import {
  BUNDESLAND_BY_NAME,
  BUNDESLAND_NAMES,
  bundeslandName,
  toBundeslandCodes,
  laufbahngruppeBedeutung,
  LAUFBAHNGRUPPE_BEDEUTUNG,
  LAUFBAHNGRUPPE_BEDEUTUNG_DE,
  LAUFBAHNGRUPPE_NAMES,
  matchesSuchbegriff,
  ORGANISATIONSBEREICH_NAMES,
  toLaufbahngruppeCodes,
  toOrganisationsbereichCodes,
} from "./filterOptions";

describe("Lesbare Namen statt SAP-Codes", () => {
  it("bietet die Teilstreitkräfte unter ihrem Klarnamen an", () => {
    for (const name of ["Marine", "Heer", "Luftwaffe", "Cyber- und Informationsraum"]) {
      expect(ORGANISATIONSBEREICH_NAMES, name).toContain(name);
    }
  });

  // Beide Listen teilen sich den Coderaum. Wuerde die Umbenennung der
  // Laufbahngruppen-Labels auch auf die Organisationsbereiche angewendet,
  // hiesse "0005" (Zentraler Sanitaetsdienst) dort "Mannschaften", und vier
  // Bereiche waeren ueberhaupt nicht auswaehlbar.
  it("benennt keinen Organisationsbereich nach einer Laufbahngruppe", () => {
    for (const name of ["Mannschaften", "Unteroffiziere", "Feldwebel", "Offiziere"]) {
      expect(ORGANISATIONSBEREICH_NAMES, name).not.toContain(name);
    }
  });

  it("bietet auch die Bereiche an, die mit Laufbahngruppen-Codes kollidieren", () => {
    for (const name of [
      "Zentraler Sanitätsdienst der Bundeswehr",
      "Bundeswehrverwaltung",
      "Ausrüstung, Informationstechnik und Nutzung",
      "Personal",
    ]) {
      expect(ORGANISATIONSBEREICH_NAMES, name).toContain(name);
    }
    expect(toOrganisationsbereichCodes(["Zentraler Sanitätsdienst der Bundeswehr"])).toEqual(["0005"]);
    expect(toOrganisationsbereichCodes(["Personal"])).toEqual(["0009"]);
  });

  it("hält beide Listen vollständig - kein Wert darf durch Umbenennung verschwinden", () => {
    expect(ORGANISATIONSBEREICH_NAMES).toHaveLength(17);
    expect(LAUFBAHNGRUPPE_NAMES).toHaveLength(9);
  });

  // Schwaechere Modelle erklaeren "Andere" sonst etwa als "technische
  // Spezialisierungen" - erfunden und falsch. Deshalb liefert
  // zaehle_treffer die Bedeutung mit, statt aufs Nachschlagen zu hoffen.
  it("hat zu JEDER Laufbahngruppe einen Klartext-Satz", () => {
    for (const name of LAUFBAHNGRUPPE_NAMES) {
      expect(laufbahngruppeBedeutung(name), `"${name}" ohne Bedeutung`).toBeTruthy();
    }
  });

  it("benennt den Sammelposten 'Andere' als solchen, statt ihn auszudeuten", () => {
    const bedeutung = laufbahngruppeBedeutung("Andere");
    expect(bedeutung).toMatch(/catch-all/i);
    expect(bedeutung).toMatch(/not a career group/i);
  });

  // WOZU: die deutsche Fassung geht ins Web-Formular, die englische an KI-Clients.
  // Fehlt dort ein Schluessel, zeigt das Formular fuer eine Option still nichts.
  it("fuehrt Deutsch und Englisch mit denselben Laufbahngruppen", () => {
    expect(Object.keys(LAUFBAHNGRUPPE_BEDEUTUNG_DE).sort()).toEqual(Object.keys(LAUFBAHNGRUPPE_BEDEUTUNG).sort());
    expect(Object.keys(LAUFBAHNGRUPPE_BEDEUTUNG_DE).sort()).toEqual([...LAUFBAHNGRUPPE_NAMES].sort());
  });

  it("entschärft die (m/w/d)-Labels der Laufbahngruppen", () => {
    for (const name of ["Offiziere", "Feldwebel", "Unteroffiziere", "Mannschaften"]) {
      expect(LAUFBAHNGRUPPE_NAMES, name).toContain(name);
    }
    expect(LAUFBAHNGRUPPE_NAMES.some((name) => name.includes("(m/w/d)"))).toBe(false);
  });

  it("übersetzt Namen in die Codes, die die Bundeswehr-API erwartet", () => {
    expect(toOrganisationsbereichCodes(["Marine"])).toEqual(["0004"]);
    expect(toLaufbahngruppeCodes(["Offiziere"])).toEqual(["0009"]);
    expect(toOrganisationsbereichCodes(["Marine", "Heer"])).toEqual(["0004", "0002"]);
  });

  it("liefert für fehlende Angaben eine leere Liste (= kein Filter)", () => {
    expect(toOrganisationsbereichCodes(undefined)).toEqual([]);
    expect(toLaufbahngruppeCodes([])).toEqual([]);
  });
});

describe("matchesSuchbegriff", () => {
  const titel = "Einstellung Offizierin / Offizier Schiffstechnik Fregatte (m/w/d)";

  it("ohne Suchbegriff passt alles", () => {
    expect(matchesSuchbegriff(titel, undefined)).toBe(true);
    expect(matchesSuchbegriff(titel, "")).toBe(true);
  });

  it("ignoriert Groß-/Kleinschreibung", () => {
    expect(matchesSuchbegriff(titel, "schiffstechnik")).toBe(true);
    expect(matchesSuchbegriff(titel, "SCHIFFSTECHNIK")).toBe(true);
  });

  it("verknüpft mehrere Begriffe mit UND", () => {
    expect(matchesSuchbegriff(titel, "Offizier Fregatte")).toBe(true);
    expect(matchesSuchbegriff(titel, "Offizier Panzer")).toBe(false);
  });

  it("passt nicht auf Begriffe, die nur im Fließtext stünden", () => {
    // Einschränkung: gesucht wird nur im Titel, nicht in der
    // Stellenbeschreibung (die liegt in einer eigenen Subcollection).
    expect(matchesSuchbegriff(titel, "Informatikstudium")).toBe(false);
  });

  // Ein reiner Teilstring-Vergleich liesse "IT" mitten in Woertern treffen.
  it("trifft Kurzbegriffe nicht mitten im Wort", () => {
    expect(matchesSuchbegriff("Truppenversorgungsbearbeiter/-in SK (m/w/d)", "IT")).toBe(false);
    expect(matchesSuchbegriff("Militärisches Nachrichtenwesen Feldwebel", "IT")).toBe(false);
  });

  it("trifft Kurzbegriffe am Wortanfang - auch mit Bindestrich oder Schrägstrich", () => {
    expect(matchesSuchbegriff("IT-System-Elektronikerin Cyber/IT (m/w/d)", "IT")).toBe(true);
    expect(matchesSuchbegriff("Wiedereinstellung Offizier Cyber/IT", "IT")).toBe(true);
  });

  it("findet weiterhin deutsche Komposita über den Wortanfang", () => {
    expect(matchesSuchbegriff("Softwareentwicklerin / Softwareentwickler", "Software")).toBe(true);
    expect(matchesSuchbegriff("Marineschifffahrtleitoffizier", "Marine")).toBe(true);
  });

  it("verschluckt sich nicht an Regex-Sonderzeichen", () => {
    expect(matchesSuchbegriff("Fachkraft C++ (m/w/d)", "C++")).toBe(true);
    expect(() => matchesSuchbegriff(titel, "(")).not.toThrow();
  });
});

describe("Bundesland-Zuordnung", () => {
  // Die Codes sind aus `Wertehilfen_Region` der Bundeswehr-API uebernommen, nicht
  // geraten. Ein vertauschter Code faellt sonst nirgends auf: die Suche liefert
  // dann Treffer, nur aus dem falschen Land.
  it("kennt alle 16 Laender", () => {
    expect(BUNDESLAND_NAMES).toHaveLength(16);
    expect(Object.values(BUNDESLAND_BY_NAME)).toHaveLength(new Set(Object.values(BUNDESLAND_BY_NAME)).size);
  });

  it("uebersetzt Namen in Codes und zurueck", () => {
    for (const name of BUNDESLAND_NAMES) {
      expect(bundeslandName(toBundeslandCodes([name])[0]), name).toBe(name);
    }
  });

  it("verwirft einen unbekannten Namen, statt einen leeren Code zu erzeugen", () => {
    expect(toBundeslandCodes(["Niederbayern"])).toEqual([]);
    expect(bundeslandName("99")).toBe("");
    expect(bundeslandName(undefined)).toBe("");
  });
});
