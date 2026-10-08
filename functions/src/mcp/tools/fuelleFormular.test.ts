import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod/v3";

const ladeMappeMock = vi.fn();
const fuegeEinMock = vi.fn();
const setzeStandMock = vi.fn();
const fillMock = vi.fn();
vi.mock("../../mappe/mappeStore", () => ({
  ladeMappe: (...a: unknown[]) => ladeMappeMock(...a),
  fuegeDokumentEin: (...a: unknown[]) => fuegeEinMock(...a),
  setzeFormularstand: (...a: unknown[]) => setzeStandMock(...a),
}));
vi.mock("../../jobDocumentStore", () => ({
  loadJobDocuments: async () => [
    { docId: "f1", attHeader: "Bewerbungsbogen_Militärisch", storagePath: "p", url: "u", contentType: "application/pdf", sizeBytes: 10 },
  ],
  readStoredDocument: async () => new Uint8Array([1, 2, 3]),
}));
vi.mock("../lib/loadJobRecord", () => ({
  loadJobRecord: async () => ({ pinstGuid: "abc", refCode: "REF-1", title: "Teststelle", dokumente: [] }),
}));
vi.mock("../../fillBewerbungsbogen", async (echt) => ({
  ...(await echt<typeof import("../../fillBewerbungsbogen")>()),
  fillBewerbungsbogen: (...a: unknown[]) => fillMock(...a),
}));

const { fuelleFormular, fuelleFormularInputSchema } = await import("./fuelleFormular");

const angaben = { mappenId: "m1", docId: "f1", nachname: "Musterfrau", vorname: "Erika", geburtsdatumLabel: "12.03.1998" };

beforeEach(() => {
  ladeMappeMock.mockReset().mockResolvedValue({ pinstGuid: "abc", refCode: "REF-1", titel: "Teststelle", dokumente: [] });
  fuegeEinMock.mockReset().mockImplementation(async (_id, d) => ({ ...d, storagePath: "p", hinzugefuegtAm: 1 }));
  setzeStandMock.mockReset();
  fillMock.mockReset().mockResolvedValue({
    bytes: new Uint8Array([37, 80, 68, 70]),
    filledExtraKeys: [],
    fehlendeAngaben: ["telefon", "email", "geburtsort", "strasse", "plz", "ort", "staatsangehoerigkeit"],
  });
});

/**
 * WOZU: Als Base64 waere der militaerische Bogen rund 111.000 Token, was kein
 * Client im Gespraech verkraftet. Das PDF landet deshalb in der Mappe, und
 * zurueck kommt eine Auskunft.
 */
describe("fuelle_formular", () => {
  it("gibt KEIN Base64 zurueck", async () => {
    const ergebnis = await fuelleFormular(angaben);
    expect(JSON.stringify(ergebnis)).not.toMatch(/pdfBase64/);
    expect(JSON.stringify(ergebnis).length).toBeLessThan(2000);
  });

  it("legt das ausgefuellte Formular in die Mappe", async () => {
    await fuelleFormular(angaben);
    expect(fuegeEinMock).toHaveBeenCalledOnce();
    expect(fuegeEinMock.mock.calls[0][1]).toMatchObject({ art: "formular", herkunft: "formular" });
  });

  it("merkt sich nur Feldnamen, keine Feldwerte", async () => {
    await fuelleFormular(angaben);
    const [, , stand] = setzeStandMock.mock.calls[0];
    expect(stand.fehlendeAngaben).toContain("telefon");
    expect(JSON.stringify(stand)).not.toContain("Musterfrau");
  });

  it("nennt die fehlenden Angaben, damit kein Feld still leer bleibt", async () => {
    const ergebnis = await fuelleFormular(angaben);
    expect(ergebnis.fehlendeAngaben).toContain("plz");
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/fehlendeAngaben/);
  });

  it("scheitert laut, wenn das Formular nicht ausfuellbar ist", async () => {
    fillMock.mockRejectedValue(new Error("Diese Bewerbungsbogen-Vorlage wird noch nicht unterstützt"));
    await expect(fuelleFormular(angaben)).rejects.toThrow(/nicht unterstützt/);
  });

  // `docId` in der Eingabe ist die Vorlage, `dokument.docId` in der
  // Ausgabe das neu erzeugte Dokument - gleicher Name, andere Bedeutung, also
  // wie bei fuege_dokument_hinzu unter `dokument` verschachtelt statt flach.
  it("verschachtelt die erzeugte Kennung unter `dokument`, nicht auf oberster Ebene", async () => {
    const ergebnis = await fuelleFormular(angaben);
    expect(ergebnis.dokument.docId).toBeTruthy();
    expect(ergebnis.dokument.dateiname).toMatch(/^Bewerbungsbogen_REF-1\.pdf$/);
    expect(ergebnis).not.toHaveProperty("docId");
    expect(ergebnis).not.toHaveProperty("dateiname");
  });
});

/**
 * `partialFillNote` erklaert, welche Teile eines Vordrucks
 * (z.B. beim Mannschaften-Karrierebogen der groessere Teil) dieser Server
 * NICHT ausfuellt. Ohne eine Anweisung im Hinweis liest kein Client
 * das Feld und gibt es nie an den Bewerber weiter - die Regel gehoert in den
 * Rueckgabewert, nicht in die Instructions.
 */
describe("fuelle_formular — partialFillNote wird angewiesen, nicht nur mitgeliefert", () => {
  it("weist bei gesetztem partialFillNote an, es an den Bewerber weiterzugeben", async () => {
    fillMock.mockResolvedValue({
      bytes: new Uint8Array([37, 80, 68, 70]),
      filledExtraKeys: [],
      fehlendeAngaben: [],
      partialFillNote: "Bitte die Verwendungswünsche selbst ausfüllen.",
    });
    const ergebnis = await fuelleFormular(angaben);
    expect(ergebnis.partialFillNote).toBeTruthy();
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/partialFillNote/);
  });

  it("schweigt ueber partialFillNote, wenn es nicht gesetzt ist", async () => {
    const ergebnis = await fuelleFormular(angaben);
    expect(ergebnis.partialFillNote).toBeUndefined();
    expect(ergebnis.hinweis.nurFuerDich).not.toMatch(/partialFillNote/);
  });
});

/**
 * WOZU: Felder brauchen Laengengrenzen, und ausgefuellte Formulare duerfen nicht
 * an der Mengengrenze der Mappe vorbeilaufen - jeder Korrekturlauf legte sonst ein
 * weiteres Formular dazu, obwohl der Hinweis "ein zweiter Aufruf ersetzt das
 * Formular" verspricht.
 */
describe("fuelle_formular - Grenzen und Ersetzen", () => {
  const schema = z.object(fuelleFormularInputSchema);
  const gueltig = { ...angaben, mappenId: "m" + "0".repeat(24) + "1" };

  it("nimmt echte Angaben an und lehnt ueberlange ab", () => {
    expect(schema.safeParse(gueltig).success).toBe(true);
    expect(schema.safeParse({ ...gueltig, nachname: "x".repeat(101) }).success).toBe(false);
    expect(schema.safeParse({ ...gueltig, strasse: "x".repeat(101) }).success).toBe(false);
    expect(schema.safeParse({ ...gueltig, plz: "1".repeat(11) }).success).toBe(false);
    expect(schema.safeParse({ ...gueltig, fuehrerschein: "B".repeat(201) }).success).toBe(false);
    expect(schema.safeParse({ ...gueltig, mappenId: "m1" }).success).toBe(false);
  });

  it("gibt dem neuen Formular die Vorlage mit und ersetzt nur ein Formular derselben Vorlage", async () => {
    await fuelleFormular(angaben);
    const [, dokument, , ersetzt] = fuegeEinMock.mock.calls[0];
    expect(dokument).toMatchObject({ vorlageDocId: "f1" });
    expect(ersetzt({ herkunft: "formular", vorlageDocId: "f1" })).toBe(true);
    expect(ersetzt({ herkunft: "formular", vorlageDocId: "f2" })).toBe(false);
    expect(ersetzt({ herkunft: "upload", vorlageDocId: undefined })).toBe(false);
  });

  it("fuellt nichts in eine volle Mappe - ausser es ersetzt ein Formular derselben Vorlage", async () => {
    const voll = Array.from({ length: 10 }, (_, i) => ({ docId: `t${i}`, herkunft: "upload", sizeBytes: 100 }));
    ladeMappeMock.mockResolvedValue({ pinstGuid: "abc", refCode: "REF-1", titel: "Teststelle", dokumente: voll });
    await expect(fuelleFormular(angaben)).rejects.toThrow(/mappe_status/);
    expect(fillMock).not.toHaveBeenCalled();

    const mitFormular = [...voll.slice(0, 9), { docId: "t9", herkunft: "formular", vorlageDocId: "f1", sizeBytes: 100 }];
    ladeMappeMock.mockResolvedValue({ pinstGuid: "abc", refCode: "REF-1", titel: "Teststelle", dokumente: mitFormular });
    await expect(fuelleFormular(angaben)).resolves.toBeTruthy();
  });
});
