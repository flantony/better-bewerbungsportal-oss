import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MappeRecord } from "../../mappe/mappeTypen";

const ladeMappeMock = vi.fn();
vi.mock("../../mappe/mappeStore", () => ({
  ladeMappe: (...a: unknown[]) => ladeMappeMock(...a),
}));

const anforderungenMock = vi.fn();
vi.mock("./getDocumentRequirements", () => ({
  getDocumentRequirements: (...a: unknown[]) => anforderungenMock(...a),
}));

const loadJobRecordMock = vi.fn();
vi.mock("../lib/loadJobRecord", () => ({
  loadJobRecord: (...a: unknown[]) => loadJobRecordMock(...a),
}));

const { mappeStatus } = await import("./mappeStatus");

const ANFORDERUNGEN = {
  geforderteUnterlagen: ["Lebenslauf", "Zeugniskopien"],
  unterlagenHinweise: "",
  bewerbungsschluss: "2026-09-01",
};

function mappe(teil: Partial<MappeRecord> = {}): MappeRecord {
  return {
    pinstGuid: "abc",
    refCode: "REF-1",
    titel: "Teststelle",
    erstelltAm: 1,
    letzteAktivitaetAm: 1,
    verfaelltAm: 1 + 3_600_000,
    zipGebautAm: null,
    heruntergeladenAm: null,
    einmalToken: null,
    dokumente: [],
    formularstand: {},
    anforderungen: ANFORDERUNGEN,
    ...teil,
  };
}

beforeEach(() => {
  ladeMappeMock.mockReset().mockResolvedValue(mappe());
  anforderungenMock.mockReset().mockResolvedValue({
    geforderteUnterlagen: ["Lebenslauf", "Zeugniskopien"],
    unterlagenHinweise: "",
  });
  loadJobRecordMock.mockReset().mockResolvedValue({ pinstGuid: "abc", applicationEnd: "2026-09-01" });
});

/**
 * WOZU: `mappe_status` ist der Aufruf, den ein Client am oeftesten wiederholt -
 * er MUSS ihn wiederholen, weil der Upload im Browser des Bewerbers laeuft und
 * nicht durch das Gespraech. Rechnete er `get_document_requirements` jedes Mal
 * neu, kostete jeder Aufruf 4 Firestore-Reads; bei 30 bis 60 Wiederholungen
 * also bis zu 240 Reads, von denen nur einer je Aufruf neue Information
 * tragen kann.
 */
describe("mappe_status", () => {
  it("liest die Anforderungen aus der Mappe, statt sie neu zu berechnen", async () => {
    const ergebnis = await mappeStatus({ mappenId: "m1" });

    expect(anforderungenMock).not.toHaveBeenCalled();
    expect(loadJobRecordMock).not.toHaveBeenCalled();
    expect(ergebnis.fehlendeUnterlagen).toEqual(["Lebenslauf", "Zeugniskopien"]);
  });

  it("zieht den Stand aus dem Schnappschuss richtig ab, wenn eine Unterlage vorliegt", async () => {
    ladeMappeMock.mockResolvedValue(
      mappe({
        dokumente: [
          {
            docId: "d1",
            art: "lebenslauf",
            dateiname: "Lebenslauf.pdf",
            storagePath: "p/d1",
            contentType: "application/pdf",
            sizeBytes: 10,
            herkunft: "client",
            hinzugefuegtAm: 2,
          },
        ],
      }),
    );

    const ergebnis = await mappeStatus({ mappenId: "m1" });

    expect(ergebnis.fehlendeUnterlagen).toEqual(["Zeugniskopien"]);
  });

  /**
   * Eine Mappe ohne Schnappschuss: ohne den Nachladeweg liefe sie in
   * `undefined`, und der Bewerber verliert seine hochgeladenen Zeugnisse,
   * weil sein KI-Tool eine Stoerung meldet.
   */
  it("laedt nach, wenn eine Mappe keinen Schnappschuss hat", async () => {
    ladeMappeMock.mockResolvedValue(mappe({ anforderungen: undefined }));

    const ergebnis = await mappeStatus({ mappenId: "m1" });

    expect(anforderungenMock).toHaveBeenCalled();
    expect(ergebnis.fehlendeUnterlagen).toEqual(["Lebenslauf", "Zeugniskopien"]);
  });
});

/**
 * WOZU: Ohne Unterlagenliste ist `fehlendeUnterlagen` leer. Ein Hinweis
 * "Deine Mappe ist vollstaendig" waere dann eine Behauptung ohne Grundlage.
 */
describe("mappe_status ohne Unterlagenliste", () => {
  it("nennt die Mappe nicht vollstaendig, wenn es gar keine Liste gab", async () => {
    ladeMappeMock.mockResolvedValue(mappe({ anforderungen: { ...ANFORDERUNGEN, geforderteUnterlagen: [] } }));

    const ergebnis = await mappeStatus({ mappenId: "m1" });

    expect(ergebnis.hinweis.fuerDenBewerber).not.toMatch(/vollständig/);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/keine Unterlagenliste/);
  });

  it("darf 'vollstaendig' sagen, wenn eine Liste da war und nichts fehlt", async () => {
    ladeMappeMock.mockResolvedValue(
      mappe({
        anforderungen: { ...ANFORDERUNGEN, geforderteUnterlagen: ["Lebenslauf"] },
        dokumente: [
          {
            docId: "l1",
            art: "lebenslauf",
            dateiname: "cv.pdf",
            storagePath: "p",
            contentType: "application/pdf",
            sizeBytes: 1,
            herkunft: "upload",
            hinzugefuegtAm: 1,
          },
        ],
      }),
    );

    const ergebnis = await mappeStatus({ mappenId: "m1" });

    expect(ergebnis.hinweis.fuerDenBewerber).toMatch(/vollständig/);
  });
});

/**
 * WOZU: Die Mappe nimmt keine Ausweiskopie an. Stuende sie in
 * `fehlendeUnterlagen`, baete die KI den Bewerber, sie hochzuladen - und die
 * Mappe wuerde nie vollstaendig.
 */
describe("mappe_status mit verlangter Ausweiskopie", () => {
  it("fuehrt sie unter selbstBeilegen und sagt, dass der Bewerber sie selbst beilegt", async () => {
    ladeMappeMock.mockResolvedValue(
      mappe({ anforderungen: { ...ANFORDERUNGEN, geforderteUnterlagen: ["Kopie des Personalausweises"] } }),
    );

    const ergebnis = await mappeStatus({ mappenId: "m1" });

    expect(ergebnis.fehlendeUnterlagen).toEqual([]);
    expect(ergebnis.selbstBeilegen).toEqual(["Kopie des Personalausweises"]);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/selbstBeilegen/);
    expect(ergebnis.hinweis.fuerDenBewerber).toMatch(/selbst bei/);
  });

  it("erwaehnt keine Ausweiskopie, wenn keine verlangt ist", async () => {
    const ergebnis = await mappeStatus({ mappenId: "m1" });
    expect(JSON.stringify(ergebnis.hinweis)).not.toMatch(/Ausweis/);
  });
});
