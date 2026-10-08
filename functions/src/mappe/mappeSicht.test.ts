import { describe, it, expect } from "vitest";
import { mappenSicht } from "./mappeSicht";
import { paketVerzeichnis } from "./paketVerzeichnis";
import type { MappeRecord, MappenDokument } from "./mappeTypen";

function mappe(over: Partial<MappeRecord> = {}): MappeRecord {
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
    ...over,
  };
}

const zeugnis = {
  docId: "d1",
  art: "zeugnis" as const,
  dateiname: "Abitur.pdf",
  storagePath: "p",
  contentType: "application/pdf",
  sizeBytes: 100,
  herkunft: "upload" as const,
  hinzugefuegtAm: 2,
};

/**
 * WOZU: Der Client muss ohne Raten wissen, was noch fehlt - sonst erfindet
 * eine KI Angaben, weil ihr niemand sagt, was gebraucht wird.
 */
describe("mappenSicht", () => {
  it("nennt die Unterlagen, die noch fehlen", () => {
    const sicht = mappenSicht(mappe(), ["Anschreiben", "Lebenslauf"]);
    expect(sicht.fehlendeUnterlagen).toEqual(["Anschreiben", "Lebenslauf"]);
  });

  it("streicht eine Unterlage, sobald ein Dokument dieser Art liegt", () => {
    const sicht = mappenSicht(mappe({ dokumente: [zeugnis] }), ["Zeugniskopien", "Anschreiben"]);
    expect(sicht.fehlendeUnterlagen).toEqual(["Anschreiben"]);
  });

  it("nennt offene Formulare mit ihren fehlenden Angaben", () => {
    const sicht = mappenSicht(
      mappe({ formularstand: { f1: { gefuellt: 3, fehlendeAngaben: ["telefon", "plz"] } } }),
      [],
    );
    expect(sicht.offeneFormulare).toEqual([{ docId: "f1", fehlendeAngaben: ["telefon", "plz"] }]);
  });

  it("laesst ein vollstaendig gefuelltes Formular aus den offenen heraus", () => {
    const sicht = mappenSicht(mappe({ formularstand: { f1: { gefuellt: 9, fehlendeAngaben: [] } } }), []);
    expect(sicht.offeneFormulare).toEqual([]);
  });

  it("gibt die Dateien ohne Storage-Pfad heraus - der gehoert dem Client nicht", () => {
    const sicht = mappenSicht(mappe({ dokumente: [zeugnis] }), []);
    expect(sicht.dokumente).toEqual([{ docId: "d1", art: "zeugnis", bezeichnung: "Zeugnis", sizeBytes: 100 }]);
  });

  /**
   * WOZU: Der Rueckgabewert geht an ein fremdes KI-Tool - zugesagt ist, dass es
   * nur erfaehrt, WAS angekommen ist, nie die Dateien selbst. Bewerber benennen
   * Scans nach sich ("Perso_Max_Mustermann.jpg"); mit dem Originalnamen stuende
   * der Klarname im Kontext eines fremden Modells. Der Name bleibt im ZIP und
   * auf der Upload-Seite - beides sieht nur der Bewerber selbst.
   */
  it("gibt den Dateinamen des Bewerbers NICHT heraus, sondern eine Bezeichnung nach Art", () => {
    const sicht = mappenSicht(
      mappe({ dokumente: [{ ...zeugnis, art: "sonstiges", dateiname: "Fuehrerschein_Max_Mustermann.jpg" }] }),
      [],
    );

    expect(sicht.dokumente).toEqual([{ docId: "d1", art: "sonstiges", bezeichnung: "Unterlage", sizeBytes: 100 }]);
    expect(JSON.stringify(sicht)).not.toContain("Mustermann");
  });

  it("nummeriert mehrere Dokumente derselben Art durch, damit der Client sie auseinanderhaelt", () => {
    const sicht = mappenSicht(
      mappe({
        dokumente: [zeugnis, { ...zeugnis, docId: "d2", dateiname: "Zeugnis_Mustermann_1998.pdf" }],
      }),
      [],
    );

    expect(sicht.dokumente.map((dokument) => dokument.bezeichnung)).toEqual(["Zeugnis 1", "Zeugnis 2"]);
    expect(sicht.dokumente.map((dokument) => dokument.docId)).toEqual(["d1", "d2"]);
    expect(JSON.stringify(sicht)).not.toContain("Mustermann");
  });

  it("streicht keine fremde Unterlage, die nur zufaellig denselben Wortteil hat", () => {
    // Viele Ausschreibungen verlangen eine Kopie des
    // Schwerbehindertenausweises. Das ist keine Ausweiskopie: sie bleibt
    // offen und wandert NICHT nach `selbstBeilegen`.
    const sicht = mappenSicht(mappe({ dokumente: [zeugnis] }), [
      "Kopie des Schwerbehindertenausweises oder des Bescheides über die Gleichstellung",
    ]);
    expect(sicht.fehlendeUnterlagen).toHaveLength(1);
    expect(sicht.selbstBeilegen).toEqual([]);
  });

  /**
   * WOZU: Die Mappe nimmt keine Ausweiskopie an. Stuende
   * sie in `fehlendeUnterlagen`, wuerde die KI den Bewerber bitten, sie
   * hochzuladen - und die Mappe wuerde nie "vollstaendig". Sie steht darum
   * getrennt: das legt der Bewerber selbst bei.
   */
  it("fuehrt eine verlangte Ausweiskopie unter selbstBeilegen statt unter fehlendeUnterlagen", () => {
    const sicht = mappenSicht(mappe({ dokumente: [zeugnis] }), ["Zeugniskopien", "Kopie des Personalausweises"]);
    expect(sicht.fehlendeUnterlagen).toEqual([]);
    expect(sicht.selbstBeilegen).toEqual(["Kopie des Personalausweises"]);
  });

  it("streicht Fuehrungszeugnis nicht durch ein Schulzeugnis", () => {
    const sicht = mappenSicht(mappe({ dokumente: [zeugnis] }), ["Führungszeugnis", "Zeugniskopien"]);
    expect(sicht.fehlendeUnterlagen).toEqual(["Führungszeugnis"]);
  });

  it("erkennt die tatsaechlich vorkommenden Schreibweisen", () => {
    const sicht = mappenSicht(mappe({ dokumente: [zeugnis] }), ["Zeugniskopien"]);
    expect(sicht.fehlendeUnterlagen).toEqual([]);
  });

  it("meldet paketGebaut, sobald zipGebautAm gesetzt ist", () => {
    const sicht = mappenSicht(mappe({ zipGebautAm: 123 }), []);
    expect(sicht.paketGebaut).toBe(true);
  });

  it("streicht keine Unterlage durch eine Datei der Art sonstiges", () => {
    const sicht = mappenSicht(
      mappe({ dokumente: [{ ...zeugnis, art: "sonstiges", dateiname: "Sonstiges.pdf" }] }),
      ["Anschreiben"],
    );
    expect(sicht.fehlendeUnterlagen).toEqual(["Anschreiben"]);
  });

  it("meldet keine fehlenden Unterlagen bei leerer Checkliste", () => {
    const sicht = mappenSicht(mappe({ dokumente: [zeugnis] }), []);
    expect(sicht.fehlendeUnterlagen).toEqual([]);
  });
});

/**
 * Ein gespeichertes Dokument kann eine Art tragen, die DOKUMENT_ARTEN nicht
 * kennt. Dann darf weder "undefined" beim Client noch im ZIP-Namen landen.
 */
describe("Dokument mit unbekannter Art", () => {
  const alt = {
    docId: "d9",
    art: "ausweiskopie" as unknown as MappenDokument["art"],
    dateiname: "Perso.jpg",
    storagePath: "p/d9",
    contentType: "image/jpeg",
    sizeBytes: 5,
    herkunft: "upload" as const,
    hinzugefuegtAm: 1,
  };

  it("bezeichnet sie neutral als Unterlage", () => {
    const sicht = mappenSicht(mappe({ dokumente: [alt] }), ["Lebenslauf"]);
    expect(sicht.dokumente[0].bezeichnung).toBe("Unterlage");
    expect(sicht.fehlendeUnterlagen).toEqual(["Lebenslauf"]);
  });

  it("benennt sie im ZIP neutral", () => {
    expect(paketVerzeichnis([alt])[0].nameImZip).toBe("01_Unterlage.jpg");
  });
});
