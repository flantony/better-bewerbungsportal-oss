import { describe, it, expect } from "vitest";
import { formatJobForMcp } from "./formatJobForMcp";
import type { JobRecord } from "../../types";

function buildJobRecord(over: Partial<JobRecord> = {}): JobRecord {
  return {
    pinstGuid: "abc-123",
    refCode: "REF-42",
    title: "IT-Systemelektroniker",
    contractType: "01",
    contractTypeLabel: "unbefristet",
    reqIndustry: 2,
    besOrt: "Köln",
    latitude: "50.9",
    longitude: "6.9",
    applicationEnd: "31.12.2026",
    applicationEndSortKey: null as never,
    startDate: "01.01.2027",
    endDate: "31.12.9999",
    arbeitszeit: "100.00",
    vollzeit: true,
    besoldung: null,
    suchTokens: ["systemelektroniker"],
    dokumente: [],
    hotJob: false,
    firstSeenAt: null as never,
    lastSeenAt: null as never,
    lastDetailFetchAt: null as never,
    active: true,
    removedAt: null,
    companyDesc: "<p>Firma</p>",
    jobDesc: "<p>Aufgaben</p>",
    requireDesc: "<p>Anforderungen</p>",
    remarcDesc: "<p>Bemerkungen</p>",
    contactDesc: "<p>Kontakt</p>",
    ...over,
  };
}

describe("formatJobForMcp", () => {
  it("liefert genau die oeffentlichen Felder, ohne Housekeeping", () => {
    const result = formatJobForMcp(buildJobRecord());

    expect(result).toEqual({
      pinstGuid: "abc-123",
      refCode: "REF-42",
      title: "IT-Systemelektroniker",
      contractTypeLabel: "unbefristet",
      besOrt: "Köln",
      applicationEnd: "31.12.2026",
      arbeitszeit: "100.00",
      vollzeit: true,
      reqIndustry: 2,
      hotJob: false,
      besoldung: null,
      anforderungen: null,
      companyDesc: "<p>Firma</p>",
      jobDesc: "<p>Aufgaben</p>",
      requireDesc: "<p>Anforderungen</p>",
      remarcDesc: "<p>Bemerkungen</p>",
      contactDesc: "<p>Kontakt</p>",
      dokumente: [],
      nichtMehrAktuell: false,
    });

    for (const intern of ["firstSeenAt", "lastSeenAt", "active", "suchTokens", "applicationEndSortKey"]) {
      expect(result, intern).not.toHaveProperty(intern);
    }
  });

  // Diese Felder sind in den echten Daten IMMER leer - ein Modell hielte sie
  // fuer fehlende statt nicht existierende Daten.
  it("liefert keine Totfelder aus", () => {
    const result = formatJobForMcp(buildJobRecord()) as Record<string, unknown>;
    for (const tot of ["region", "plz", "country", "place", "keywords", "newJob", "tarifgruppe1"]) {
      expect(result, tot).not.toHaveProperty(tot);
    }
  });

  it("ergaenzt die Besoldung um ein Anzeige-Label", () => {
    const result = formatJobForMcp(
      buildJobRecord({
        besoldung: { von: "A7", bis: "A9 M", tabelle: "A", vonStufe: 7, bisStufe: 9, quelle: "ausschreibung" },
      }),
    );
    expect(result.besoldung).toMatchObject({ label: "A7-A9 M", quelle: "ausschreibung" });
  });

  it("kennzeichnet extrahierte Anforderungen als abgeleitet", () => {
    const result = formatJobForMcp(
      buildJobRecord({
        jobAttributes: {
          dienstgrad: "Hauptmann",
          besoldung: { label: "A11-A12", von: 11, bis: 12 },
          laufbahngruppen: ["Offiziere"],
          abschluss: "Bachelor",
          seiteneinstieg: "ja",
          sicherheitsueberpruefung: "Ü2",
          sprachen: [],
          berufserfahrungJahre: 2,
          unterlagen: ["Lebenslauf"],
          unterlagenHinweise: "",
          belegstelle: "Einstellung als Hauptmann",
          schemaVersion: "job-attributes-v1",
        },
      }),
    );
    expect(result.anforderungen?.dienstgrad).toBe("Hauptmann");
    expect(result.anforderungen?.hinweis).toMatch(/keine amtliche Angabe/);
  });

  /**
   * `0` heisst bei uns "die Ausschreibung sagt dazu nichts" und sieht wie eine
   * Zahl aus. Aus `hoechstalter: 0` wird beim Client "keine Altersgrenze", und
   * aus `berufserfahrungJahre: 0` "keine Berufserfahrung noetig" - beides
   * grundfalsche Auskuenfte, die einen Bewerber eine Bewerbung kosten. Was nicht
   * da ist, kann nicht falsch gelesen werden.
   */
  it("laesst unbekannte Angaben weg, statt eine Null zu senden", () => {
    const result = formatJobForMcp(
      buildJobRecord({
        jobAttributes: {
          dienstgrad: "",
          besoldung: null,
          laufbahngruppen: [],
          abschluss: "",
          seiteneinstieg: "unklar",
          sicherheitsueberpruefung: "",
          sprachen: [],
          berufserfahrungJahre: 0,
          mindestalter: 0,
          hoechstalter: 0,
          verpflichtungsdauer: "",
          unterlagen: [],
          unterlagenHinweise: "",
          belegstelle: "",
          schemaVersion: "job-attributes-v1",
        },
      }),
    );
    for (const feld of ["mindestalter", "hoechstalter", "berufserfahrungJahre", "verpflichtungsdauer"]) {
      expect(result.anforderungen, feld).not.toHaveProperty(feld);
    }
    // Der Vermerk muss das fehlende Feld deuten - sonst raet das Modell.
    expect(result.anforderungen?.hinweis).toMatch(/fehlt/i);
  });

  it("behaelt bekannte Angaben unveraendert", () => {
    const result = formatJobForMcp(
      buildJobRecord({
        jobAttributes: {
          dienstgrad: "Oberfeldwebel",
          besoldung: null,
          laufbahngruppen: [],
          abschluss: "",
          seiteneinstieg: "unklar",
          sicherheitsueberpruefung: "",
          sprachen: [],
          berufserfahrungJahre: 3,
          mindestalter: 17,
          hoechstalter: 0,
          verpflichtungsdauer: "8 bis 13 Jahre",
          unterlagen: [],
          unterlagenHinweise: "",
          belegstelle: "",
          schemaVersion: "job-attributes-v1",
        },
      }),
    );
    expect(result.anforderungen).toMatchObject({
      mindestalter: 17,
      berufserfahrungJahre: 3,
      verpflichtungsdauer: "8 bis 13 Jahre",
    });
    expect(result.anforderungen).not.toHaveProperty("hoechstalter");
  });

  it("gibt nur die Anhangs-Namen aus (Links liefert get_document_requirements)", () => {
    const result = formatJobForMcp(
      buildJobRecord({ dokumente: [{ docId: "d1", attHeader: "Bewerbungsbogen_Militärisch" }] }),
    );
    expect(result.dokumente).toEqual(["Bewerbungsbogen_Militärisch"]);
  });

  it("meldet eine archivierte Ausschreibung als nicht mehr aktuell", () => {
    // get_job liefert archivierte Stellen weiterhin aus (Nachlesen erlaubt) -
    // dann muss aber unmissverstaendlich dranstehen, dass eine Bewerbung nicht
    // mehr moeglich ist.
    expect(formatJobForMcp(buildJobRecord({ active: false })).nichtMehrAktuell).toBe(true);
  });
});

/**
 * WOZU: Ein leerer `applicationEnd` ohne Hinweis ist ein Fehler, kein Ergebnis.
 * Fast alle Stellen ohne Datum sagen im Text "Bewerbung und Einstellung
 * jederzeit moeglich" - ohne Hinweis saehe der Client davon nur den leeren
 * String.
 */
describe("formatJobForMcp — leerer Bewerbungsschluss", () => {
  it("sagt bei leerem Datum und passendem Text: keine Frist, jederzeit", () => {
    const result = formatJobForMcp(
      buildJobRecord({ applicationEnd: "", companyDesc: "<p>Bewerbung und Einstellung jederzeit möglich</p>" }),
    );
    expect(result.bewerbungsschlussHinweis?.fuerDenBewerber).toMatch(/jederzeit möglich/);
    expect(result.bewerbungsschlussHinweis?.nurFuerDich).toMatch(/applicationEnd/);
  });

  it("verweist bei leerem Datum ohne Aussage im Text an die Karriereberatung, statt 'keine Frist' zu behaupten", () => {
    const result = formatJobForMcp(buildJobRecord({ applicationEnd: "" }));
    expect(result.bewerbungsschlussHinweis?.fuerDenBewerber).toMatch(/Karriereberatung/);
    expect(result.bewerbungsschlussHinweis?.fuerDenBewerber).not.toMatch(/jederzeit/);
  });

  // Kontaktsaetze ("steht Ihnen jederzeit zur Verfuegung") sind die Hauptquelle
  // falscher Treffer - contactDesc wird darum nicht gelesen.
  it("liest 'jederzeit' nicht aus contactDesc", () => {
    const result = formatJobForMcp(
      buildJobRecord({ applicationEnd: "", contactDesc: "<p>Bewerbung und Einstellung jederzeit möglich</p>" }),
    );
    expect(result.bewerbungsschlussHinweis?.fuerDenBewerber).not.toMatch(/jederzeit/);
  });

  it("haengt keinen Hinweis an, wenn ein Datum da ist", () => {
    expect(formatJobForMcp(buildJobRecord())).not.toHaveProperty("bewerbungsschlussHinweis");
  });
});
