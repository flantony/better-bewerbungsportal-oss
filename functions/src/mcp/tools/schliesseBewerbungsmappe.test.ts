import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MappeRecord } from "../../mappe/mappeTypen";

const ladeMappeMock = vi.fn();
const merkeZipMock = vi.fn();
vi.mock("../../mappe/mappeStore", () => ({
  ladeMappe: (...a: unknown[]) => ladeMappeMock(...a),
  merkeZip: (...a: unknown[]) => merkeZipMock(...a),
}));

const baueZipMock = vi.fn();
const legePaketAbMock = vi.fn();
vi.mock("../../mappe/paket", () => ({
  baueZip: (...a: unknown[]) => baueZipMock(...a),
  legePaketAb: (...a: unknown[]) => legePaketAbMock(...a),
  leseAusStorage: vi.fn(),
}));

const anforderungenMock = vi.fn();
vi.mock("./getDocumentRequirements", () => ({
  getDocumentRequirements: (...a: unknown[]) => anforderungenMock(...a),
}));

const loadJobRecordMock = vi.fn();
vi.mock("../lib/loadJobRecord", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/loadJobRecord")>()),
  loadJobRecord: (...a: unknown[]) => loadJobRecordMock(...a),
}));

const { schliesseBewerbungsmappe } = await import("./schliesseBewerbungsmappe");

const mappe: MappeRecord = {
  pinstGuid: "abc",
  refCode: "REF-1",
  titel: "Teststelle",
  erstelltAm: 1,
  letzteAktivitaetAm: 1,
  verfaelltAm: 1 + 3_600_000,
  zipGebautAm: null,
  heruntergeladenAm: null,
  einmalToken: null,
  dokumente: [
    {
      docId: "f1",
      art: "formular",
      dateiname: "Bogen.pdf",
      storagePath: "p/f1",
      contentType: "application/pdf",
      sizeBytes: 10,
      herkunft: "formular",
      hinzugefuegtAm: 2,
    },
    {
      docId: "a1",
      art: "anschreiben",
      dateiname: "A.pdf",
      storagePath: "p/a1",
      contentType: "application/pdf",
      sizeBytes: 10,
      herkunft: "client",
      hinzugefuegtAm: 1,
    },
  ],
  formularstand: { "vorlage-mil": { gefuellt: 9, fehlendeAngaben: ["telefon"] } },
  anforderungen: {
    geforderteUnterlagen: [],
    unterlagenHinweise: "",
    bewerbungsschluss: "2026-09-01",
    anhaenge: [
      { docId: "factsheet", attHeader: "Factsheet_Fw_IT" },
      { docId: "vorlage-mil", attHeader: "Bewerbungsbogen_Militärisch" },
      { docId: "anlage", attHeader: "Anlage 1 zum Bewerbungsbogen" },
    ],
    laufbahngruppen: ["Feldwebel"],
    bewerbungJederzeit: false,
  },
};

beforeEach(() => {
  loadJobRecordMock
    .mockReset()
    .mockResolvedValue({ pinstGuid: "abc", refCode: "REF-1", title: "Teststelle", applicationEnd: "2026-09-01" });
  ladeMappeMock.mockReset().mockResolvedValue(mappe);
  merkeZipMock.mockReset().mockResolvedValue(undefined);
  baueZipMock.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  legePaketAbMock.mockReset().mockResolvedValue("bewerbungsmappen/m1/paket.zip");
  anforderungenMock.mockReset().mockResolvedValue({ geforderteUnterlagen: [], unterlagenHinweise: "" });
});

/**
 * WOZU: Der Einmal-Link ist eine Zusage - fehlt ein Parameter oder ist die
 * Reihenfolge (erst Paket, dann Token) vertauscht, bekommt der Bewerber einen
 * Link, der nicht funktioniert, und merkt das erst beim Anklicken.
 */
describe("schliesse_bewerbungsmappe", () => {
  it("gibt einen Link mit Mappe UND Token zurueck", async () => {
    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });
    expect(ergebnis.downloadUrl).toMatch(/[?&]mappe=m1(&|$)/);
    expect(ergebnis.downloadUrl).toMatch(/[?&]token=/);
  });

  it("legt das Paket ab, BEVOR es den Token hinterlegt", async () => {
    // Sonst entsteht ein Link auf ein Paket, das es nicht gibt.
    const reihenfolge: string[] = [];
    legePaketAbMock.mockImplementation(async () => {
      reihenfolge.push("paket");
      return "pfad";
    });
    merkeZipMock.mockImplementation(async () => {
      reihenfolge.push("token");
    });
    await schliesseBewerbungsmappe({ mappenId: "m1" });
    expect(reihenfolge).toEqual(["paket", "token"]);
  });

  it("hinterlegt keinen Token, wenn der Paketbau scheitert", async () => {
    baueZipMock.mockRejectedValue(new Error("Storage weg"));
    await expect(schliesseBewerbungsmappe({ mappenId: "m1" })).rejects.toThrow();
    expect(merkeZipMock).not.toHaveBeenCalled();
  });

  it("nennt die Formulare, die von Hand zu unterschreiben sind, so wie sie auch in `enthalten` stehen", async () => {
    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });
    expect(ergebnis.zuUnterschreiben.length).toBeGreaterThan(0);
    for (const name of ergebnis.zuUnterschreiben) expect(ergebnis.enthalten).toContain(name);
  });

  /**
   * WOZU: Der ZIP-Dateiname traegt bei mehreren Dokumenten derselben Art den
   * Dateinamen des Bewerbers ("Zeugnis_Mustermann_1998.pdf"). Ginge er in
   * `enthalten` hinaus, stuende der Klarname im Kontext eines fremden
   * KI-Tools, entgegen der Zusage aus DSFA und Datenschutzerklaerung. Im ZIP
   * selbst bleibt der Name (s. paketVerzeichnis.test.ts).
   */
  it("nennt dem Client nur Bezeichnungen nach Art, nie den Dateinamen des Bewerbers", async () => {
    ladeMappeMock.mockResolvedValue({
      ...mappe,
      dokumente: [
        { ...mappe.dokumente[1] },
        {
          docId: "z1",
          art: "zeugnis" as const,
          dateiname: "Zeugnis_Mustermann_1998.pdf",
          storagePath: "p/z1",
          contentType: "application/pdf",
          sizeBytes: 10,
          herkunft: "upload" as const,
          hinzugefuegtAm: 3,
        },
        {
          docId: "z2",
          art: "zeugnis" as const,
          dateiname: "Abschluss_Mustermann.pdf",
          storagePath: "p/z2",
          contentType: "application/pdf",
          sizeBytes: 10,
          herkunft: "upload" as const,
          hinzugefuegtAm: 4,
        },
      ],
    });

    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(ergebnis.enthalten).toEqual(["Anschreiben", "Zeugnis 1", "Zeugnis 2"]);
    expect(JSON.stringify(ergebnis)).not.toContain("Mustermann");
  });

  /**
   * WOZU: Bewerbungsschluss und Unterlagenliste fuer den Merkzettel stehen
   * seit dem Eroeffnen im Datensatz der Mappe. Die Ausschreibung erneut zu
   * laden (samt `get_document_requirements`) kostete vier Reads.
   */
  it("nimmt Bewerbungsschluss und Unterlagenliste aus der Mappe, ohne die Ausschreibung erneut zu lesen", async () => {
    ladeMappeMock.mockResolvedValue({
      ...mappe,
      anforderungen: {
        ...mappe.anforderungen,
        geforderteUnterlagen: ["Führungszeugnis"],
        unterlagenHinweise: "Karrierecenter Köln",
        bewerbungsschluss: "2026-12-24",
      },
    });

    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(loadJobRecordMock).not.toHaveBeenCalled();
    expect(anforderungenMock).not.toHaveBeenCalled();
    expect(ergebnis.fehlt).toEqual(["Führungszeugnis"]);
    // Der Merkzettel im Paket traegt beides - er ist das einzige, was der
    // Bewerber nach dem Loeschen der Mappe noch in der Hand hat.
    const merkzettel = baueZipMock.mock.calls[0][1] as string;
    expect(merkzettel).toContain("2026-12-24");
    expect(merkzettel).toContain("Karrierecenter Köln");
  });

  /** Eine Mappe ohne Schnappschuss darf nicht scheitern. */
  it("laedt nach, wenn eine Mappe keinen Schnappschuss hat", async () => {
    ladeMappeMock.mockResolvedValue({ ...mappe, anforderungen: undefined });

    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(loadJobRecordMock).toHaveBeenCalled();
    expect(anforderungenMock).toHaveBeenCalled();
    expect(ergebnis.downloadUrl).toMatch(/token=/);
  });

  /**
   * WOZU: Ohne Unterlagenliste ist `fehlt` leer, und ein Merkzettel, der dann
   * "vollstaendig" sagt, luegt. Ein leeres `fehlt` liest jede KI als "nichts fehlt" - der
   * Rueckgabewert muss im selben Moment sagen, dass es keine Liste gab.
   */
  it("sagt bei fehlender Unterlagenliste im Rueckgabewert UND im Merkzettel, dass das nicht 'nichts fehlt' heisst", async () => {
    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(ergebnis.fehlt).toEqual([]);
    expect(ergebnis.fehltHinweis?.nurFuerDich).toMatch(/keine Unterlagenliste/);
    expect(ergebnis.fehltHinweis?.fuerDenBewerber).toMatch(/nicht herauslesen/);
    const merkzettel = baueZipMock.mock.calls[0][1] as string;
    expect(merkzettel).not.toMatch(/vollständig/);
  });

  it("haengt keinen fehltHinweis an, wenn es eine Liste gab", async () => {
    ladeMappeMock.mockResolvedValue({
      ...mappe,
      anforderungen: { ...mappe.anforderungen, geforderteUnterlagen: ["Anschreiben"] },
    });
    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });
    expect(ergebnis).not.toHaveProperty("fehltHinweis");
  });

  it("nennt die Anhaenge der Ausschreibung, die nicht ausgefuellt im Paket liegen - im Rueckgabewert und im Merkzettel", async () => {
    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(ergebnis.anhaengeNichtImPaket).toEqual(["Factsheet_Fw_IT", "Anlage 1 zum Bewerbungsbogen"]);
    const merkzettel = baueZipMock.mock.calls[0][1] as string;
    expect(merkzettel).toContain("  - Anlage 1 zum Bewerbungsbogen");
  });

  /**
   * Anlage 1 (Erklaerung zur Verfassungstreue) darf nicht gleichrangig neben
   * einem Factsheet stehen: ohne sie ist die Bewerbung unvollstaendig.
   * Rueckgabewert und Merkzettel trennen Pflichtvordruck und Lesestoff.
   */
  it("trennt den selbst auszufuellenden Vordruck vom Informationsmaterial - mit Link", async () => {
    ladeMappeMock.mockResolvedValue({
      ...mappe,
      anforderungen: {
        ...mappe.anforderungen,
        anhaenge: [
          { docId: "factsheet", attHeader: "Factsheet_Fw_IT" },
          { docId: "vorlage-mil", attHeader: "Bewerbungsbogen_Militärisch" },
          { docId: "anlage", attHeader: "Anlage 1 zum Bewerbungsbogen", downloadUrl: "https://example.org/anlage1.pdf" },
        ],
      },
    });

    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(ergebnis.selbstAuszufuellen).toEqual([
      { titel: "Anlage 1 zum Bewerbungsbogen", downloadUrl: "https://example.org/anlage1.pdf" },
    ]);
    expect(ergebnis.zurInformation).toEqual(["Factsheet_Fw_IT"]);
    expect(ergebnis.zuPruefen).toEqual([]);
    expect(ergebnis.einreichen.join(" ")).toContain("https://bewerbung.bundeswehr-karriere.de");
    expect(ergebnis.hinweis.fuerDenBewerber).toContain("https://bewerbung.bundeswehr-karriere.de");
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/selbstAuszufuellen/);
    expect(ergebnis.hinweis.fuerDenBewerber).toMatch(/Anlage 1 zum Bewerbungsbogen/);
    const merkzettel = baueZipMock.mock.calls[0][1] as string;
    expect(merkzettel).toMatch(/AUSFÜLLEN UND UNTERSCHREIBEN \(gehört zur Bewerbung\)\n[\s\S]*- Anlage 1 zum Bewerbungsbogen\n {4}Download: https:\/\/example\.org\/anlage1\.pdf/);
    expect(merkzettel).toMatch(/ZUR INFORMATION\n[\s\S]*- Factsheet_Fw_IT/);
    expect(merkzettel).not.toContain("WEITERE DATEIEN DER AUSSCHREIBUNG");
  });

  it("nennt das Bewerbungsportal mit Adresse im Merkzettel", async () => {
    await schliesseBewerbungsmappe({ mappenId: "m1" });
    const merkzettel = (baueZipMock.mock.calls[0][1] as string).replace(/\s+/g, " ");
    expect(merkzettel).toContain("https://bewerbung.bundeswehr-karriere.de");
    expect(merkzettel).toContain("über ihre Kennung REF-1");
  });

  it("nennt je ausgefuelltem Formular, was der Bewerber von Hand ergaenzen muss - samt Laufbahn-Hinweis", async () => {
    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(ergebnis.vonHandErgaenzen).toHaveLength(1);
    expect(ergebnis.vonHandErgaenzen[0].formular).toBe("Bewerbungsbogen_Militärisch");
    const felder = ergebnis.vonHandErgaenzen[0].felder.join("\n");
    expect(felder).toMatch(/laut Ausschreibung: Feldwebel/);
    expect(felder).toMatch(/Geschlecht/);
    // Die Angabe, die beim Ausfuellen fehlte, steht mit dem Feldnamen des Vordrucks da.
    expect(felder).toMatch(/fehlte: Telefon/);
    const merkzettel = baueZipMock.mock.calls[0][1] as string;
    expect(merkzettel).toMatch(/VON HAND ERGÄNZEN/);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/vonHandErgaenzen/);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/zuPruefen/);
  });

  it("schreibt bei leerem Datum und 'jederzeit' im Text 'kein Bewerbungsschluss' in den Merkzettel", async () => {
    ladeMappeMock.mockResolvedValue({
      ...mappe,
      anforderungen: { ...mappe.anforderungen, bewerbungsschluss: "", bewerbungJederzeit: true },
    });
    await schliesseBewerbungsmappe({ mappenId: "m1" });
    const merkzettel = baueZipMock.mock.calls[0][1] as string;
    expect(merkzettel).toContain("Bewerbungsschluss: keiner, Bewerbung jederzeit möglich");
  });

  /**
   * Kennt der Schnappschuss einer Mappe keine Anhaenge, laedt sie die
   * Ausschreibung genau einmal nach.
   */
  it("laedt die Ausschreibung einmal nach, wenn der Schnappschuss keine Anhaenge kennt", async () => {
    loadJobRecordMock.mockResolvedValue({
      pinstGuid: "abc",
      refCode: "REF-1",
      title: "Teststelle",
      applicationEnd: "",
      dokumente: [{ docId: "anlage", attHeader: "Anlage 1 zum Bewerbungsbogen" }],
      laufbahngruppe: "0008",
      companyDesc: "Bewerbung und Einstellung jederzeit möglich",
      jobDesc: "",
      requireDesc: "",
      remarcDesc: "",
      contactDesc: "",
    });
    ladeMappeMock.mockResolvedValue({
      ...mappe,
      anforderungen: { geforderteUnterlagen: [], unterlagenHinweise: "", bewerbungsschluss: "" },
    });

    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(loadJobRecordMock).toHaveBeenCalledTimes(1);
    expect(anforderungenMock).not.toHaveBeenCalled();
    expect(ergebnis.anhaengeNichtImPaket).toEqual(["Anlage 1 zum Bewerbungsbogen"]);
    const merkzettel = baueZipMock.mock.calls[0][1] as string;
    expect(merkzettel).toContain("Bewerbungsschluss: keiner");
  });

  /**
   * WOZU: Die Ausschreibung kann zwischen Eroeffnen und Paketbau verschwinden
   * (zurueckgezogen, Sync). Der Nachladeweg fuer eine Mappe ohne Schnappschuss darf dann nicht
   * das Paket kosten - die Zeugnisse des Bewerbers liegen schon darin.
   */
  it("baut das Paket trotzdem, wenn die Ausschreibung beim Nachladen nicht mehr existiert", async () => {
    const { JobNotFoundError } = await import("../lib/loadJobRecord");
    loadJobRecordMock.mockRejectedValue(new JobNotFoundError());
    ladeMappeMock.mockResolvedValue({
      ...mappe,
      anforderungen: { geforderteUnterlagen: [], unterlagenHinweise: "", bewerbungsschluss: "2026-09-01" },
    });

    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(ergebnis.downloadUrl).toMatch(/token=/);
    expect(ergebnis.anhaengeNichtImPaket).toEqual([]);
    // Ohne Anhangsliste kennen wir die Vorlage nicht - der Bewerber bekommt
    // trotzdem die Aufforderung, den Bogen durchzusehen (s. merkzettel.ts).
    expect(ergebnis.vonHandErgaenzen).toHaveLength(1);
    expect(ergebnis.vonHandErgaenzen[0].felder.join(" ")).toMatch(/leere Felder/);
    const merkzettel = baueZipMock.mock.calls[0][1] as string;
    expect(merkzettel).toContain("Bewerbungsschluss: 2026-09-01");
    expect(merkzettel).toMatch(/VON HAND ERGÄNZEN/);
  });

  it("baut das Paket auch ohne jeden Schnappschuss, wenn die Ausschreibung weg ist", async () => {
    const { JobNotFoundError } = await import("../lib/loadJobRecord");
    loadJobRecordMock.mockRejectedValue(new JobNotFoundError());
    ladeMappeMock.mockResolvedValue({ ...mappe, anforderungen: undefined });

    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(ergebnis.downloadUrl).toMatch(/token=/);
    expect(ergebnis.fehltHinweis).toBeDefined();
  });

  it("reicht andere Fehler beim Nachladen weiter, statt sie zu verschlucken", async () => {
    loadJobRecordMock.mockRejectedValue(new Error("Firestore weg"));
    ladeMappeMock.mockResolvedValue({ ...mappe, anforderungen: undefined });

    await expect(schliesseBewerbungsmappe({ mappenId: "m1" })).rejects.toThrow("Firestore weg");
  });
});

/**
 * Platzhalter wie "[Telefon]" gingen sonst unbemerkt ins PDF.
 * fuege_dokument_hinzu merkt sich ihre NAMEN am Dokument; der Merkzettel und
 * die Antwort nennen sie beim Paketbau noch einmal.
 */
describe("schliesse_bewerbungsmappe — offene Platzhalter", () => {
  it("nennt die Platzhalter je Dokument im Merkzettel und in der Antwort", async () => {
    ladeMappeMock.mockResolvedValue({
      ...mappe,
      dokumente: mappe.dokumente.map((dokument) =>
        dokument.art === "anschreiben" ? { ...dokument, platzhalter: ["[Telefon]", "[Datum]"] } : dokument,
      ),
    });

    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    const merkzettel = (baueZipMock.mock.calls[0][1] as string).replace(/\s+/g, " ");
    expect(merkzettel).toContain(
      "In 01_Anschreiben.pdf stehen noch Platzhalter: [Telefon], [Datum]. Ersetze sie vor dem Einreichen.",
    );
    expect(ergebnis.offenePlatzhalter).toEqual([{ dokument: "Anschreiben", platzhalter: ["[Telefon]", "[Datum]"] }]);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/offenePlatzhalter/);
    expect(ergebnis.hinweis.fuerDenBewerber).toMatch(/Platzhalter/);
  });

  it("laesst Abschnitt und Feld weg, wenn kein Dokument Platzhalter hat", async () => {
    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });
    expect(baueZipMock.mock.calls[0][1] as string).not.toMatch(/PLATZHALTER/);
    expect(ergebnis).not.toHaveProperty("offenePlatzhalter");
  });
});

/** Keine Ausweiskopie in der Mappe - der Bewerber legt sie selbst bei. */
describe("schliesse_bewerbungsmappe — Ausweiskopie", () => {
  it("nennt eine verlangte Ausweiskopie in der Antwort und im Merkzettel als selbst beizulegen", async () => {
    ladeMappeMock.mockResolvedValue({
      ...mappe,
      anforderungen: { ...mappe.anforderungen, geforderteUnterlagen: ["Kopie des Personalausweises"] },
    });

    const ergebnis = await schliesseBewerbungsmappe({ mappenId: "m1" });

    expect(ergebnis.fehlt).toEqual([]);
    expect(ergebnis.selbstBeilegen).toEqual(["Kopie des Personalausweises"]);
    expect(ergebnis.hinweis.fuerDenBewerber).toMatch(/selbst bei/);
    const merkzettel = String(baueZipMock.mock.calls[0][1]).replace(/\s+/g, " ");
    expect(merkzettel).toContain("lege sie selbst bei. Wir nehmen keine Ausweiskopien entgegen");
  });
});
