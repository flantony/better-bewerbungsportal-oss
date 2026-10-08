import { describe, it, expect } from "vitest";
import {
  detectTemplateFamily,
  firstFillable,
  identifyBewerbungsbogen,
  type TemplateFamily,
} from "./identifyBewerbungsbogen";
import type { JobDocument } from "../../types";

function doc(attHeader: string): JobDocument {
  return {
    attHeader,
    attType: "9100",
    attTypeTxt: "",
    category: "",
    subcategory: "",
    attachment: "000001",
    sizeLabel: "0,3 MB",
    contentType: "application/pdf",
    downloadUrl: `https://bewerbung.bundeswehr-karriere.de/${encodeURIComponent(attHeader)}.pdf`,
  };
}

describe("detectTemplateFamily", () => {
  // Header, wie sie in den echten Daten vorkommen.
  it.each([
    ["Karrierebogen für die Laufbahnen der Mannschaften bis Feldwebel", "karrierebogen-mannschaften"],
    ["Bewerbungsbogen_Militärisch", "militaerisch"],
    ["Bewerbungsbogen Seiteneinstieg und ROB ab GEWET 2027 17.07.2026", "seiteneinstieg-rob"],
    ["Bewerbungsbogen Wiedereinstellung ab GEWET 2027 Stand 17.07.2026", "wiedereinstellung"],
    ["A2 Bewerbungsbogen", "a2"],
    ["Bewerbungsbogen Zivil KC 07/2024", "zivil"],
    ["Karrierebogen Zivil", "karrierebogen-zivil"],
  ])("erkennt %s", (header, expected) => {
    expect(detectTemplateFamily(header)).toBe(expected);
  });

  // "Anlage 1" ist kein Formular - das muss auch die Erkennung so sehen.
  it("haelt Info-Anlagen fuer keine Vorlage", () => {
    expect(detectTemplateFamily("Anlage 1 zum Bewerbungsbogen")).toBeNull();
    expect(detectTemplateFamily("Anlage 1 OA-Führungskraft Reserve im Wehrdienst alle Laufbahnen")).toBeNull();
    expect(detectTemplateFamily("Anlage 1 Erklärung politische Parteien u.a.")).toBeNull();
  });

  it("haelt sonstige Anhaenge fuer keine Vorlage", () => {
    for (const header of [
      "Beiblatt Staatenliste",
      "Berufsförderungsdienst - Die Zukunft im Blick",
      "Fragebogen Stellenbörse",
      "Datenschutzblatt",
      "Stellenbeschreibung",
    ]) {
      expect(detectTemplateFamily(header), header).toBeNull();
    }
  });
});

describe("identifyBewerbungsbogen", () => {
  // Viele Stellen tragen BEIDE Boegen. Gewaenne der zufaellig zuerst gelistete
  // Mannschaften-Bogen, bekaeme ein Offizier das falsche Formular.
  it("gibt alle Boegen zurueck, nicht nur den ersten", () => {
    const matches = identifyBewerbungsbogen([
      doc("Karrierebogen für die Laufbahnen der Mannschaften bis Feldwebel"),
      doc("Bewerbungsbogen_Militärisch"),
      doc("Beiblatt Staatenliste"),
    ]);
    expect(matches.map((m) => m.family)).toEqual(["karrierebogen-mannschaften", "militaerisch"]);
  });

  it("sortiert ausfuellbare Vorlagen nach vorn", () => {
    const matches = identifyBewerbungsbogen([
      doc("Bewerbungsbogen Wiedereinstellung ab GEWET 2027 Stand 17.07.2026"),
      doc("Bewerbungsbogen_Militärisch"),
    ]);
    expect(matches[0].family).toBe("militaerisch");
    expect(matches[0].variant).not.toBeNull();
  });

  it("erkennt Vorlagen ohne Feldzuordnung, markiert sie aber als nicht ausfuellbar", () => {
    const matches = identifyBewerbungsbogen([doc("Bewerbungsbogen Wiedereinstellung ab GEWET 2027 Stand 17.07.2026")]);
    expect(matches).toHaveLength(1);
    expect(matches[0].family).toBe("wiedereinstellung");
    expect(matches[0].variant).toBeNull();
  });

  it("gibt fuer Stellen ohne Bogen eine leere Liste zurueck", () => {
    expect(identifyBewerbungsbogen([doc("Anlage 1 OA-Führungskraft Reserve im Wehrdienst alle Laufbahnen")])).toEqual([]);
    expect(identifyBewerbungsbogen([])).toEqual([]);
  });
});

describe("firstFillable", () => {
  it("waehlt die ausfuellbare Vorlage, auch wenn eine andere zuerst kam", () => {
    const matches = identifyBewerbungsbogen([
      doc("Bewerbungsbogen Wiedereinstellung ab GEWET 2027 Stand 17.07.2026"),
      doc("Karrierebogen für die Laufbahnen der Mannschaften bis Feldwebel"),
    ]);
    expect(firstFillable(matches)?.family).toBe("karrierebogen-mannschaften");
  });

  it("gibt null zurueck, wenn keine Vorlage ausfuellbar ist", () => {
    const matches = identifyBewerbungsbogen([doc("A2 Bewerbungsbogen")]);
    expect(firstFillable(matches)).toBeNull();
  });
});

/**
 * WOZU: Diese Liste enthaelt echte Bogen-Anhangnamen aus `jobDocuments`, keine
 * erfundenen Beispiele. Ein verfehlter Bogen kostet den Bewerber die Auskunft
 * "es wird kein Formular verlangt", weil ein leeres `bewerbungsboegen`
 * ausdruecklich als Antwort gilt.
 */
describe("detectTemplateFamily - echter Anhangbestand", () => {
  const erkannt: [string, TemplateFamily][] = [
    ["Bewerbungsbogen_Militärisch", "militaerisch"],
    ["Bewerbungsbogen Seiteneinstieg und ROB ab GEWET 2027 17.07.2026", "seiteneinstieg-rob"],
    ["Bewerbungsbogen Wiedereinstellung ab GEWET 2027 Stand 17.07.2026", "wiedereinstellung"],
    ["Bewerbungsbogen Zivil KC 07/2024", "zivil"],
    ["Bewerbungsbogen Zivil AC 07/25", "zivil"],
    ["Karrierebogen Zivil", "karrierebogen-zivil"],
    ["A2 Bewerbungsbogen", "a2"],
    ["A2 Bewerbungsbogen (2)", "a2"],
  ];

  it.each(erkannt)("%s → %s", (header, familie) => {
    expect(detectTemplateFamily(header)).toBe(familie);
  });

  // Die beiden Sonderfaelle: `ziv_` statt `zivil`, und "Formular" statt "Bogen".
  it("erkennt den mit ziv_ abgekuerzten Zivil-Bogen", () => {
    expect(detectTemplateFamily("ziv_Bewerbungsbogen_Bundeswehr_25_07")).toBe("zivil");
  });

  it("erkennt ein Bewerbungsformular als Bogen - dasselbe Dokument, anderes Wort", () => {
    expect(detectTemplateFamily("Bewerbungsformular_ziv_25_07")).toBe("zivil");
  });

  /**
   * Diese drei Namen und "Bewerbungsbogen Zivil AC 07/25" fuehren auf EIN
   * Dokument mit 269
   * AcroForm-Feldern. Der Name sagt "Unterlagen", der Inhalt ist das Formular.
   */
  it("erkennt auch die als Bewerbungsunterlagen benannte Fassung derselben Datei", () => {
    expect(detectTemplateFamily("Bewerbungsunterlagen_Bundeswehr_ziv_10_23")).toBe("zivil");
    expect(detectTemplateFamily("Bewerbungsunterlagen_Bundeswehr_ziv_10_23 (1)")).toBe("zivil");
  });

  /**
   * Und der Grund, warum wir sie trotzdem nicht ausfuellen: das Namensfeld heisst
   * dort `Name`, nicht `Nachname`. Der Laufzeit-Schutz in fillBewerbungsbogen
   * wuerde also greifen - aber richtig ist, gar nicht erst hinzugehen.
   */
  it("bietet die Zivil-Fassung nicht zum Ausfuellen an", () => {
    expect(identifyBewerbungsbogen([doc("ziv_Bewerbungsbogen_Bundeswehr_25_07")])[0].variant).toBeNull();
  });

  // Die Gegenprobe: was kein Bewerbungsformular ist, bleibt draussen. Sonst
  // wuerde der Bewerber ein Informationsblatt ausfuellen wollen.
  const keinBogen = [
    "Anlage 1 zum Bewerbungsbogen",
    "Anlage 1 Erklärung politische Parteien u.a.",
    "Antwortbogen",
    "Datenschutzblatt",
    "Fragebogen Stellenbörse",
    "Infobroschuere-KdoCIR",
    "Bezügebeispiel Offizier",
  ];

  it.each(keinBogen)("%s ist kein Bewerbungsbogen", (header) => {
    expect(detectTemplateFamily(header)).toBeNull();
  });
});

