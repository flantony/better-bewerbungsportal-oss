import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { baueZip } from "./paket";
import type { MappenDokument } from "./mappeTypen";

function dok(over: Partial<MappenDokument>): MappenDokument {
  return {
    docId: "d1",
    art: "zeugnis",
    dateiname: "Abitur.pdf",
    storagePath: "pfad/d1",
    contentType: "application/pdf",
    sizeBytes: 4,
    herkunft: "upload",
    hinzugefuegtAm: 1,
    ...over,
  };
}

const leseDatei = async () => new Uint8Array([37, 80, 68, 70]);

describe("baueZip", () => {
  it("legt jede Datei unter ihrem sprechenden Namen ab", async () => {
    const bytes = await baueZip(
      [dok({}), dok({ docId: "d2", art: "anschreiben", dateiname: "A.pdf", hinzugefuegtAm: 2 })],
      "Merkzettel",
      leseDatei,
    );
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(["01_Anschreiben.pdf", "02_Zeugnis.pdf", "WAS-NOCH-ZU-TUN.txt"]);
  });

  it("legt den Merkzettel immer bei, auch wenn nur ein Dokument drin ist", async () => {
    const zip = await JSZip.loadAsync(await baueZip([dok({})], "Bitte unterschreiben", leseDatei));
    await expect(zip.file("WAS-NOCH-ZU-TUN.txt")?.async("string")).resolves.toBe("Bitte unterschreiben");
  });

  /**
   * WOZU: Die Downloads haengen nicht voneinander ab. Sequenziell wartet ein
   * Paket mit zehn Dateien zehn Storage-Roundtrips hintereinander ab, in einem
   * Aufruf, auf den der Bewerber wartet.
   */
  it("laedt die Dateien gleichzeitig, nicht eine nach der anderen", async () => {
    let offen = 0;
    let maximalOffen = 0;
    const langsamesLesen = async () => {
      offen++;
      maximalOffen = Math.max(maximalOffen, offen);
      await new Promise((fertig) => setTimeout(fertig, 5));
      offen--;
      return new Uint8Array([37, 80, 68, 70]);
    };

    await baueZip(
      [
        dok({}),
        dok({ docId: "d2", storagePath: "pfad/d2", dateiname: "Praktikum.pdf", hinzugefuegtAm: 2 }),
        dok({ docId: "d3", storagePath: "pfad/d3", dateiname: "Abschluss.pdf", hinzugefuegtAm: 3 }),
      ],
      "Merkzettel",
      langsamesLesen,
    );

    expect(maximalOffen).toBe(3);
  });

  /**
   * Die Reihenfolge im ZIP darf NICHT davon abhaengen, welcher Download zuerst
   * zurueckkommt - die Nummerierung ist das, woran der Bewerber seinen Stapel
   * erkennt. Hier kommt die erste Datei absichtlich als letzte zurueck.
   */
  it("behaelt die Reihenfolge des Verzeichnisses, egal wann ein Download zurueckkommt", async () => {
    const verzoegerung: Record<string, number> = { "pfad/d1": 20, "pfad/d2": 1 };
    const leseDurcheinander = async (pfad: string) => {
      await new Promise((fertig) => setTimeout(fertig, verzoegerung[pfad] ?? 0));
      return new Uint8Array([37, 80, 68, 70]);
    };

    const bytes = await baueZip(
      [dok({}), dok({ docId: "d2", storagePath: "pfad/d2", art: "anschreiben", dateiname: "A.pdf", hinzugefuegtAm: 2 })],
      "Merkzettel",
      leseDurcheinander,
    );

    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(["01_Anschreiben.pdf", "02_Zeugnis.pdf", "WAS-NOCH-ZU-TUN.txt"]);
  });

  it("baut auch ein Paket ohne Dokumente - der Merkzettel allein hat Wert", async () => {
    const zip = await JSZip.loadAsync(await baueZip([], "Es fehlt noch alles", leseDatei));
    expect(Object.keys(zip.files)).toEqual(["WAS-NOCH-ZU-TUN.txt"]);
  });
});
