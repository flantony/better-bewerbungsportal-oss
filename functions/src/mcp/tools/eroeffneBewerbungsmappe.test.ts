import { describe, it, expect, vi, beforeEach } from "vitest";

const erstelleMappeMock = vi.fn();
const anforderungenMock = vi.fn();
vi.mock("../../mappe/mappeStore", () => ({
  erstelleMappe: (...args: unknown[]) => erstelleMappeMock(...args),
}));
vi.mock("./getDocumentRequirements", () => ({
  getDocumentRequirements: (...args: unknown[]) => anforderungenMock(...args),
}));
const JOB = {
  pinstGuid: "abc",
  refCode: "REF-1",
  title: "Teststelle",
  applicationEnd: "2026-09-01",
  dokumente: [{ docId: "doc1", attHeader: "Bewerbungsbogen_Militärisch" }],
  laufbahngruppe: "0008",
  companyDesc: "<p>Bewerbung und Einstellung jederzeit möglich</p>",
  jobDesc: "",
  requireDesc: "",
  remarcDesc: "",
  contactDesc: "",
};
const loadJobRecordMock = vi.fn();
vi.mock("../lib/loadJobRecord", () => ({
  loadJobRecord: (...args: unknown[]) => loadJobRecordMock(...args),
}));

const { eroeffneBewerbungsmappe } = await import("./eroeffneBewerbungsmappe");

beforeEach(() => {
  loadJobRecordMock.mockReset().mockResolvedValue(JOB);
  erstelleMappeMock.mockReset().mockResolvedValue("mtest123");
  anforderungenMock.mockReset().mockResolvedValue({
    documents: [],
    bewerbungsboegen: [
      {
        attHeader: "Bewerbungsbogen_Militärisch",
        docId: "doc1",
        downloadUrl: "https://example.invalid/f.pdf",
        contentType: "application/pdf",
        sizeBytes: 1000,
        family: "militaerisch",
        ausfuellbar: true,
        benoetigteAngaben: ["nachname", "vorname"],
        optionaleAngaben: [],
        nichtVerwendeteAngaben: [],
      },
    ],
    bewerbungsbogen: null,
    geforderteUnterlagen: ["Anschreiben", "Lebenslauf"],
    unterlagenHinweise: "",
  });
});

/**
 * WOZU: Ein Aufruf soll dem Client den ganzen Arbeitsplan geben - sonst raet er
 * sich die Felder zusammen.
 */
describe("eroeffne_bewerbungsmappe", () => {
  it("gibt Kennung und Upload-Seite zurueck", async () => {
    const ergebnis = await eroeffneBewerbungsmappe({ pinstGuid: "abc" });
    expect(ergebnis.mappenId).toBe("mtest123");
    expect(ergebnis.uploadSeite).toContain("mtest123");
    expect(ergebnis.uploadSeite).toMatch(/^https:\/\//);
  });

  it("traegt die Unterlagenliste und die Feldliste je Formular mit", async () => {
    const ergebnis = await eroeffneBewerbungsmappe({ pinstGuid: "abc" });
    expect(ergebnis.benoetigteUnterlagen).toEqual(["Anschreiben", "Lebenslauf"]);
    expect(ergebnis.formulare[0].benoetigteAngaben).toEqual(["nachname", "vorname"]);
    expect(ergebnis.formulare[0].docId).toBe("doc1");
  });

  it("nennt die Frist, damit der Client sie dem Bewerber sagen kann", async () => {
    const ergebnis = await eroeffneBewerbungsmappe({ pinstGuid: "abc" });
    expect(ergebnis.gueltigMinuten).toBe(60);
    expect(ergebnis.hinweis.fuerDenBewerber).toMatch(/Stunde/);
  });

  /**
   * WOZU: "eine Stunde nach dem Paket" laesst den haeufigsten Abbruchfall offen -
   * die Mappe, zu der es nie ein Paket gibt. Auch die wird geloescht, eine
   * Stunde nach der letzten Aenderung; wer das nicht weiss, glaubt seine
   * hochgeladenen Zeugnisse lägen dort auf unbestimmte Zeit.
   */
  it("nennt dem Bewerber auch die Frist fuer die Mappe, zu der es nie ein Paket gibt", async () => {
    const ergebnis = await eroeffneBewerbungsmappe({ pinstGuid: "abc" });
    expect(ergebnis.hinweis.fuerDenBewerber).toMatch(/letzten Änderung/);
  });

  it("sagt der KI, dass der Bewerber den Link braucht", async () => {
    const ergebnis = await eroeffneBewerbungsmappe({ pinstGuid: "abc" });
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/uploadSeite/);
  });

  /**
   * WOZU: `mappe_status` wird dutzendfach gepollt; die Anforderungen bei jedem
   * Aufruf neu zu berechnen kostete je 4 Firestore-Reads. Sie stehen deshalb
   * einmalig im Datensatz. DSGVO: ausschliesslich oeffentliche
   * Ausschreibungsdaten, keine Bewerberangabe.
   */
  it("legt die Anforderungen der Ausschreibung als Schnappschuss in die Mappe", async () => {
    await eroeffneBewerbungsmappe({ pinstGuid: "abc" });

    expect(erstelleMappeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        anforderungen: {
          geforderteUnterlagen: ["Anschreiben", "Lebenslauf"],
          unterlagenHinweise: "",
          bewerbungsschluss: "2026-09-01",
          // Fuer den Merkzettel im Paket: welche Anhaenge es gibt (Namen sind
          // oeffentlich), welche Laufbahngruppe die Stelle hat und ob ihr Text
          // die Bewerbung jederzeit zulaesst - einmal hier statt beim Paketbau.
          anhaenge: [{ docId: "doc1", attHeader: "Bewerbungsbogen_Militärisch" }],
          laufbahngruppen: ["Feldwebel"],
          // Mit Datum gibt es keine "jederzeit"-Deutung (s. bewerbungJederzeitFuerJob).
          bewerbungJederzeit: false,
        },
      }),
    );
  });

  it("liest 'jederzeit' fuer den Schnappschuss nicht aus contactDesc", async () => {
    loadJobRecordMock.mockResolvedValue({
      ...JOB,
      applicationEnd: "",
      companyDesc: "",
      contactDesc: "Bewerbung und Einstellung jederzeit möglich",
    });
    await eroeffneBewerbungsmappe({ pinstGuid: "abc" });
    expect(erstelleMappeMock.mock.calls[0][0].anforderungen.bewerbungJederzeit).toBe(false);
  });

  /**
   * WOZU: Dieses Werkzeug braucht `refCode`/`title` selbst und hat den
   * Datensatz darum schon in der Hand. Ohne die Weitergabe laese derselbe Aufruf
   * dieselbe Ausschreibung zweimal - vier Reads statt zwei.
   */
  it("gibt den geladenen Datensatz weiter, statt ihn zweimal zu holen", async () => {
    await eroeffneBewerbungsmappe({ pinstGuid: "abc" });

    expect(loadJobRecordMock).toHaveBeenCalledTimes(1);
    expect(anforderungenMock).toHaveBeenCalledWith({ pinstGuid: "abc" }, JOB);
  });
});

/** Die Upload-Seite nimmt keine Ausweiskopie an - die KI darf nicht darum bitten. */
describe("eroeffne_bewerbungsmappe — Ausweiskopie", () => {
  it("sagt bei verlangter Ausweiskopie, dass der Bewerber sie selbst beilegt", async () => {
    anforderungenMock.mockResolvedValue({
      ...(await anforderungenMock()),
      geforderteUnterlagen: ["Lebenslauf", "Kopie des Personalausweises"],
    });

    const ergebnis = await eroeffneBewerbungsmappe({ pinstGuid: "abc" });

    expect(ergebnis.hinweis.nurFuerDich).toMatch(/Ausweiskopie/);
    expect(ergebnis.hinweis.fuerDenBewerber).toMatch(/selbst bei/);
  });

  it("erwaehnt keine Ausweiskopie, wenn keine verlangt ist", async () => {
    const ergebnis = await eroeffneBewerbungsmappe({ pinstGuid: "abc" });
    expect(JSON.stringify(ergebnis.hinweis)).not.toMatch(/Ausweis/);
  });
});

describe("eroeffne_bewerbungsmappe — selbstBeilegen", () => {
  it("fuehrt eine verlangte Ausweiskopie unter selbstBeilegen statt unter benoetigteUnterlagen", async () => {
    anforderungenMock.mockResolvedValue({
      ...(await anforderungenMock()),
      geforderteUnterlagen: ["Lebenslauf", "Kopie des Personalausweises"],
    });

    const ergebnis = await eroeffneBewerbungsmappe({ pinstGuid: "abc" });

    expect(ergebnis.benoetigteUnterlagen).toEqual(["Lebenslauf"]);
    expect(ergebnis.selbstBeilegen).toEqual(["Kopie des Personalausweises"]);
  });

  it("liefert selbstBeilegen leer, wenn keine Ausweiskopie verlangt ist", async () => {
    const ergebnis = await eroeffneBewerbungsmappe({ pinstGuid: "abc" });
    expect(ergebnis.selbstBeilegen).toEqual([]);
  });
});
