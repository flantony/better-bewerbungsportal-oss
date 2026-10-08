import { describe, it, expect, vi } from "vitest";

/**
 * WOZU: Die Stellenseite im Web zeigt allen ohne KI, was sie
 * einreichen muessen, samt Checkliste zum Herunterladen
 * (web/src/features/jobs/lib/einreichliste.ts). Das Web kann functions/ nicht
 * importieren und spiegelt die Logik deshalb. Eine zweite, von Hand gepflegte
 * Liste liefe auseinander, und zwei Stellen sagten dem Bewerber Verschiedenes. Dieser Test legt beide Seiten
 * nebeneinander - Einzelregeln UND das Gesamtergebnis gegen
 * `getDocumentRequirements`.
 */

const loadJobDocumentsMock = vi.fn();
vi.mock("../jobDocumentStore", () => ({
  loadJobDocuments: (...a: unknown[]) => loadJobDocumentsMock(...a),
}));

const web = await import("../../../web/src/features/jobs/lib/einreichliste");
const { normalisiereUnterlagen } = await import("./unterlagen");
const { detectTemplateFamily } = await import("../mcp/lib/identifyBewerbungsbogen");
const { anhangArt, istVerfassungstreueErklaerung } = await import("../mappe/anhangArt");
const { AUSWEISKOPIE_HINWEIS, verlangtAusweiskopie } = await import("../mappe/ausweiskopie");
const { BEWERBUNGSPORTAL_URL, einreichenSchritte } = await import("./einreichen");
const { KEINE_UNTERLAGENLISTE_FUER_BEWERBER } = await import("../mcp/lib/unterlagenHinweis");
const { getDocumentRequirements } = await import("../mcp/tools/getDocumentRequirements");

/** Echte Anhangsnamen (s. anhangArt.test.ts, identifyBewerbungsbogen) plus Grenzfaelle. */
const ANHANGSNAMEN = [
  "Anlage 1 zum Bewerbungsbogen",
  "Anlage 1 zum Karrierebogen",
  "Anlage 1 Erklärung politische Parteien u.a.",
  "Erklärung über Mitgliedschaft_Erklärung Treuepflicht",
  "Fragebogen Stellenbörse",
  "Antwortbogen",
  "Datenschutzblatt",
  "Einverständnis Beorderung",
  "Einverständniserklärung für eine Beorderung",
  "EinverständniserklärungBwDLZ_LL",
  "Leistungsdatenübersicht gtD",
  "Notenuebersicht_Stipendiaten",
  "Beiblatt Staatenliste",
  "Berufsförderungsdienst - Die Zukunft im Blick",
  "Factsheet_Fw_IT",
  "Infobroschuere-CIR",
  "Reservisten Ihre zweite Karriere",
  "Broschüre Mittlerer Verwaltungsdienst",
  "Flyer_Karrieremöglichkeiten_GeoInfoDBw",
  "Bezügebeispiele",
  "Bezuege mtD-VD",
  "Förderliche Berufsabschlüsse_mntD",
  "Info Seiteneinsteigende Militärmusik",
  "Stellenbeschreibung MSch SAZ 2 Jahre",
  "Merkblatt zu 58 LHG BW",
  "Anlage 1 OA-Führungskraft Reserve im Wehrdienst alle Laufbahnen Stand 15.07.2026",
  "2026_Fw_V1.1_Anlage",
  "Truppenversorgungsbearbeiter Anlage",
  "Bewerbungsbogen_Militärisch",
  "Bewerbungsbogen Militaerisch",
  "Bewerbungsbogen Seiteneinstieg und ROB ab GEWET 2027 17.07.2026",
  "Bewerbungsbogen Wiedereinstellung",
  "Karrierebogen Zivil",
  "Karrierebogen Mannschaften",
  "Bewerbungsformular_ziv_25_07",
  "Bewerbungsunterlagen_Bundeswehr_ziv_10_23",
  "ziv_Bewerbungsbogen_Bundeswehr_25_07",
  "Bewerbungsbogen Zivil AC 07/25",
  "Bewerbungsbogen A2",
  "Bewerbungsbogen Zivilisation",
  "TD_Teil_1_31940726",
  "Zuordnung_gtD_miS_03_2027",
  "BB_mntDDE_Maerz24",
  "  Irgendein neuer Anhang  ",
  "",
];

const UNTERLAGENLISTEN: string[][] = [
  [],
  ["Lebenslauf", "einen tabellarischen Lebenslauf", "Tabellarischer Lebenslauf", "  "],
  ["Antwortbogen", "Datenschutzblatt", "Fragebogen zur Verfassungstreueprüfung"],
  ["eine Kopie des Personalausweises", "Zeugniskopien"],
  ["Kopie des Schwerbehindertenausweises", "Passbild"],
  ["Reisepass oder Identitätsnachweis"],
  ["Ausweis", "Lichtbildausweis"],
  ["eines Nachweises über die Fahrerlaubnis", "einem Motivationsschreiben"],
];

describe("Spiegel der Einzelregeln", () => {
  it.each(ANHANGSNAMEN.map((name) => [name]))("'%s': Bogenfamilie, Anhangsart und Verfassungstreue gleich", (name) => {
    expect(web.detectTemplateFamily(name)).toBe(detectTemplateFamily(name));
    expect(web.anhangArt(name)).toBe(anhangArt(name));
    expect(web.istVerfassungstreueErklaerung(name)).toBe(istVerfassungstreueErklaerung(name));
  });

  it.each(UNTERLAGENLISTEN.map((liste) => [liste]))("Unterlagenliste %j: Normalisierung und Ausweiskopie gleich", (liste) => {
    expect(web.normalisiereUnterlagen(liste)).toEqual(normalisiereUnterlagen(liste));
    expect(web.verlangtAusweiskopie(liste)).toBe(verlangtAusweiskopie(liste));
  });

  it("Einreichweg, Portaladresse und feste Saetze sind wortgleich", () => {
    expect(web.BEWERBUNGSPORTAL_URL).toBe(BEWERBUNGSPORTAL_URL);
    expect(web.einreichenSchritte("2026-1-CIR-Fw-IT-E")).toEqual(einreichenSchritte("2026-1-CIR-Fw-IT-E"));
    expect(web.einreichenSchritte()).toEqual(einreichenSchritte());
    expect(web.AUSWEISKOPIE_HINWEIS).toBe(AUSWEISKOPIE_HINWEIS);
    expect(web.KEINE_UNTERLAGENLISTE_FUER_BEWERBER).toBe(KEINE_UNTERLAGENLISTE_FUER_BEWERBER);
  });
});

// ─── Gesamtergebnis gegen get_document_requirements ─────────────────────────

interface Fall {
  name: string;
  unterlagen: string[];
  unterlagenHinweise: string;
  anhaenge: string[];
}

const FAELLE: Fall[] = [
  {
    name: "CIR mit Anlage 1, Beiblatt und Bogen",
    unterlagen: ["tabellarischer Lebenslauf", "Zeugniskopien", "Kopie des Personalausweises"],
    unterlagenHinweise: "Alle Unterlagen als ein PDF.",
    anhaenge: [
      "Factsheet_Fw_IT",
      "Beiblatt Staatenliste",
      "Anlage 1 zum Bewerbungsbogen",
      "Bewerbungsbogen_Militärisch",
      "Karrierebogen Mannschaften",
    ],
  },
  { name: "ohne Liste, ohne Anhang", unterlagen: [], unterlagenHinweise: "", anhaenge: [] },
  { name: "ohne Liste, mit Infomaterial", unterlagen: [], unterlagenHinweise: "", anhaenge: ["Bezügebeispiele"] },
  {
    name: "Reserve: nur Vordrucke, kein Bogen",
    unterlagen: ["Antwortbogen", "Lebenslauf"],
    unterlagenHinweise: "  ",
    anhaenge: ["Fragebogen Stellenbörse", "Datenschutzblatt", "TD_Teil_1_31940726"],
  },
  {
    name: "Verfassungstreue und weitere Vordrucke gemischt",
    unterlagen: ["Lebenslauf"],
    unterlagenHinweise: "",
    anhaenge: ["Erklärung über Mitgliedschaft_Erklärung Treuepflicht", "Notenuebersicht_Stipendiaten", "Karrierebogen Zivil"],
  },
];

describe("Gesamtergebnis: Stellenseite und get_document_requirements sagen dasselbe", () => {
  it.each(FAELLE.map((fall) => [fall.name, fall]))("%s", async (_name, fall) => {
    const gespeichert = fall.anhaenge.map((attHeader, i) => ({
      docId: `doc${i}`,
      attHeader,
      url: `https://example.org/doc${i}.pdf`,
      contentType: "application/pdf",
      sizeBytes: 1000,
    }));
    loadJobDocumentsMock.mockResolvedValue(gespeichert);
    const job = {
      pinstGuid: "0123456789ABCDEF0123456789ABCDEF",
      refCode: "REF-1",
      dokumente: gespeichert.map(({ docId, attHeader }) => ({ docId, attHeader })),
      jobAttributes: { unterlagen: fall.unterlagen, unterlagenHinweise: fall.unterlagenHinweise },
    };
    const server = await getDocumentRequirements({ pinstGuid: job.pinstGuid }, job as never);
    const seite = web.einreichlisteFuer({
      refCode: job.refCode,
      unterlagen: fall.unterlagen,
      unterlagenHinweise: fall.unterlagenHinweise,
      anhaenge: gespeichert.map((doc) => ({ attHeader: doc.attHeader, downloadUrl: doc.url })),
    });

    expect(seite.unterlagen).toEqual(server.geforderteUnterlagen);
    expect(seite.unterlagenHinweis).toBe(server.hinweis?.fuerDenBewerber ?? null);
    expect(seite.formaleHinweise).toBe(server.unterlagenHinweise.trim());
    expect(seite.ausweiskopieSelbstBeilegen).toBe(verlangtAusweiskopie(server.geforderteUnterlagen));
    // Reihenfolge der Boegen: der Server stellt ausfuellbare nach vorn, die Seite
    // behaelt die der Ausschreibung - verglichen wird, WELCHE es sind.
    expect(seite.bewerbungsboegen.map((b) => b.attHeader).sort()).toEqual(server.bewerbungsboegen.map((b) => b.attHeader).sort());
    expect(seite.selbstAuszufuellen.map((v) => v.attHeader)).toEqual(server.selbstAuszufuellen.map((v) => v.attHeader));
    expect(seite.vordruckHinweis).toBe(server.vordruckHinweis?.fuerDenBewerber ?? null);
    if (server.bewerbungsboegen.length === 0) {
      expect(seite.bogenHinweis).toBe(server.bogenHinweis?.fuerDenBewerber ?? null);
    } else {
      expect(seite.bogenHinweis).toBeNull();
    }
    expect(seite.einreichen).toEqual(einreichenSchritte(job.refCode));
  });
});
