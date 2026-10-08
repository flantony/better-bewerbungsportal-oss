import { describe, it, expect, vi, beforeEach } from "vitest";

const loadJobRecordMock = vi.fn();
const loadJobDocumentsMock = vi.fn();
vi.mock("../lib/loadJobRecord", () => ({
  loadJobRecord: (...args: unknown[]) => loadJobRecordMock(...args),
}));
vi.mock("../../jobDocumentStore", () => ({
  loadJobDocuments: (...args: unknown[]) => loadJobDocumentsMock(...args),
}));

const { getDocumentRequirements } = await import("./getDocumentRequirements");

function gespeichertesDokument(attHeader: string, docId = `doc-${attHeader.length}`) {
  return {
    attHeader,
    docId,
    url: "https://example.invalid/formular.pdf",
    storagePath: "jobDocuments/abc.pdf",
    contentType: "application/pdf",
    sizeBytes: 1234,
  };
}

function job(over: Record<string, unknown> = {}) {
  return { pinstGuid: "abc", title: "Testausschreibung", dokumente: [], ...over };
}

beforeEach(() => {
  loadJobRecordMock.mockReset();
  loadJobDocumentsMock.mockReset();
  loadJobRecordMock.mockResolvedValue(job());
  loadJobDocumentsMock.mockResolvedValue([]);
});

describe("getDocumentRequirements", () => {
  /**
   * WOZU: Haengt kein Bogen an, wird laut Domaenenregel keiner verlangt - die
   * uebliche Vorlage einer FREMDEN Ausschreibung anzubieten waere falsch. Der
   * Leerfall muss als Antwort erkennbar sein, nicht als Luecke.
   */
  it("deutet die leere Bogenliste im Rueckgabewert, statt eine fremde Vorlage anzubieten", async () => {
    const ergebnis = await getDocumentRequirements({ pinstGuid: "abc" });

    expect(ergebnis.bewerbungsboegen).toEqual([]);
    expect(ergebnis.bewerbungsbogen).toBeNull();
    expect(ergebnis.bogenHinweis?.nurFuerDich).toMatch(/wird keiner verlangt/);
    // Die Bewerberhaelfte kommt mit durch - sonst hat der Client nichts, was er
    // ohne Umformulierung weitergeben kann (s. geteilterHinweis.ts).
    expect(ergebnis.bogenHinweis?.fuerDenBewerber).toMatch(/liegt kein Bewerbungsbogen bei/);
    expect(ergebnis).not.toHaveProperty("vorlageFallback");
  });

  it("schweigt zum Bogen, sobald einer anhaengt", async () => {
    loadJobDocumentsMock.mockResolvedValue([gespeichertesDokument("Bewerbungsbogen_Militärisch")]);

    const ergebnis = await getDocumentRequirements({ pinstGuid: "abc" });

    expect(ergebnis).not.toHaveProperty("bogenHinweis");
    expect(ergebnis.bewerbungsbogen?.ausfuellbar).toBe(true);
  });

  /**
   * WOZU: Ohne diese Liste fragt die anfragende KI alle zwoelf Angaben von
   * `fuelle_formular` ab - beim Karrierebogen sechs davon vergebens, weil
   * die Vorlage kein Telefon- und kein Adressfeld hat.
   */
  it("nennt je ausfuellbarer Vorlage genau die Angaben, die sie einsetzt", async () => {
    loadJobDocumentsMock.mockResolvedValue([
      gespeichertesDokument("Karrierebogen für die Laufbahnen der Mannschaften bis Feldwebel"),
    ]);

    const [bogen] = (await getDocumentRequirements({ pinstGuid: "abc" })).bewerbungsboegen;

    expect(bogen.benoetigteAngaben).toEqual(["nachname", "vorname", "geburtsdatumLabel"]);
    expect(bogen.nichtVerwendeteAngaben).toContain("telefon");
    expect(bogen.nichtVerwendeteAngaben).toContain("strasse");
  });

  it("behauptet keine Feldliste fuer eine Vorlage, die wir nicht ausfuellen koennen", async () => {
    // Bogen-Familie erkannt (also ein Bewerbungsbogen), aber keine bekannte
    // Ausfuell-Variante - dann gibt es kein Feld-Mapping und damit nichts zu melden.
    loadJobDocumentsMock.mockResolvedValue([gespeichertesDokument("Bewerbungsbogen Wiedereinstellung")]);

    const [bogen] = (await getDocumentRequirements({ pinstGuid: "abc" })).bewerbungsboegen;

    expect(bogen.ausfuellbar).toBe(false);
    expect(bogen).not.toHaveProperty("benoetigteAngaben");
    expect(bogen).not.toHaveProperty("nichtVerwendeteAngaben");
  });

  it("stellt ausfuellbare Boegen voran - mehrere Boegen sind der Normalfall", async () => {
    loadJobDocumentsMock.mockResolvedValue([
      gespeichertesDokument("Bewerbungsbogen Wiedereinstellung"),
      gespeichertesDokument("Bewerbungsbogen_Militärisch"),
    ]);

    const ergebnis = await getDocumentRequirements({ pinstGuid: "abc" });

    expect(ergebnis.bewerbungsboegen.map((bogen) => bogen.ausfuellbar)).toEqual([true, false]);
    expect(ergebnis.documents).toHaveLength(2);
  });

  /**
   * WOZU: `eroeffne_bewerbungsmappe` braucht `refCode`/`title` selbst und hat
   * den Datensatz darum schon in der Hand. Ohne diesen Parameter laese derselbe
   * Werkzeugaufruf dieselbe Ausschreibung zweimal - `loadJobRecord` holt zwei
   * Dokumente (Uebersicht + Volltext), also vier Reads statt zwei.
   */
  it("nimmt einen vorgeladenen Datensatz an, statt ihn erneut zu lesen", async () => {
    const vorgeladen = job({ jobAttributes: { unterlagen: ["Lebenslauf"] } });

    const ergebnis = await getDocumentRequirements({ pinstGuid: "abc" }, vorgeladen as never);

    expect(loadJobRecordMock).not.toHaveBeenCalled();
    expect(ergebnis.geforderteUnterlagen).toEqual(["Lebenslauf"]);
  });

  it("laedt selbst, wenn kein Datensatz mitkommt", async () => {
    await getDocumentRequirements({ pinstGuid: "abc" });

    expect(loadJobRecordMock).toHaveBeenCalledWith("abc");
  });
});

/**
 * WOZU: "Anlage 1 zum Bewerbungsbogen" steht sonst nur als ein Eintrag in
 * `documents` - gleichrangig mit einer Infobroschuere. Ohne die Erklaerung ist die Bewerbung unvollstaendig. Der
 * Rueckgabewert muss sie benennen, und er muss sagen, dass die KI sie NICHT
 * im Chat abfragt (Mitgliedschaften in Parteien - Art.-9-nah).
 */
describe("getDocumentRequirements — Vordrucke zum Selbst-Ausfuellen", () => {
  it("nennt Anlage 1 als selbst auszufuellenden Vordruck, mit Link, und die Broschuere nicht", async () => {
    loadJobDocumentsMock.mockResolvedValue([
      gespeichertesDokument("Bewerbungsbogen_Militärisch", "bogen"),
      gespeichertesDokument("Factsheet_Fw_IT", "fact"),
      gespeichertesDokument("Beiblatt Staatenliste", "beiblatt"),
      gespeichertesDokument("Anlage 1 zum Bewerbungsbogen", "anlage1"),
      gespeichertesDokument("Berufsförderungsdienst - Die Zukunft im Blick", "bfd"),
    ]);

    const ergebnis = await getDocumentRequirements({ pinstGuid: "abc" });

    expect(ergebnis.selbstAuszufuellen).toEqual([
      { attHeader: "Anlage 1 zum Bewerbungsbogen", docId: "anlage1", downloadUrl: "https://example.invalid/formular.pdf" },
    ]);
    expect(ergebnis.vordruckHinweis?.nurFuerDich).toMatch(/selbstAuszufuellen/);
    expect(ergebnis.vordruckHinweis?.nurFuerDich).toMatch(/Stelle ihre Fragen NICHT im Chat/);
    expect(ergebnis.vordruckHinweis?.nurFuerDich).toMatch(/Beiblatt Staatenliste/);
    expect(ergebnis.vordruckHinweis?.fuerDenBewerber).toMatch(/Anlage 1 zum Bewerbungsbogen/);
    expect(ergebnis.vordruckHinweis?.fuerDenBewerber).toMatch(/von Hand/);
    expect(ergebnis.vordruckHinweis?.fuerDenBewerber).toMatch(/Ohne ihn ist die Bewerbung unvollständig/);
  });

  // Das Verbot, bei den Fragen zu helfen,
  // und "unvollstaendig" gelten nur fuer die Erklaerung zur Verfassungstreue.
  it("behauptet bei einem gewoehnlichen Vordruck weder Pflicht noch Politik", async () => {
    loadJobDocumentsMock.mockResolvedValue([gespeichertesDokument("Fragebogen Stellenbörse", "frage")]);

    const ergebnis = await getDocumentRequirements({ pinstGuid: "abc" });

    expect(ergebnis.vordruckHinweis?.nurFuerDich).not.toMatch(/Parteien/);
    expect(ergebnis.vordruckHinweis?.fuerDenBewerber).toMatch(/soweit sie auf dich zutreffen: Fragebogen Stellenbörse/);
    expect(ergebnis.vordruckHinweis?.fuerDenBewerber).not.toMatch(/unvollständig/);
  });

  // Ohne Bewerbungsbogen sagt bogenHinweis "es muss keiner ausgefuellt werden" -
  // das darf nicht neben einem vordruckHinweis stehen, der das Gegenteil sagt.
  it("schraenkt den Leerfall-Satz zum Bogen ein, wenn Vordrucke beiliegen", async () => {
    loadJobDocumentsMock.mockResolvedValue([gespeichertesDokument("Fragebogen Stellenbörse", "frage")]);

    const ergebnis = await getDocumentRequirements({ pinstGuid: "abc" });

    expect(ergebnis.bogenHinweis?.nurFuerDich).toMatch(/gehören trotzdem dazu/);
    expect(ergebnis.bogenHinweis?.fuerDenBewerber).toMatch(/übrigen beiliegenden Vordrucke gelten davon unabhängig/);
  });

  it("liefert eine leere Liste und keinen Hinweis, wenn kein solcher Vordruck anhaengt", async () => {
    loadJobDocumentsMock.mockResolvedValue([gespeichertesDokument("Factsheet_Fw_IT", "fact")]);

    const ergebnis = await getDocumentRequirements({ pinstGuid: "abc" });

    expect(ergebnis.selbstAuszufuellen).toEqual([]);
    expect(ergebnis).not.toHaveProperty("vordruckHinweis");
  });
});
