import JSZip from "jszip";
import { getStorage } from "firebase-admin/storage";
import { paketVerzeichnis } from "./paketVerzeichnis";
import { mappenPrefix, type MappenDokument } from "./mappeTypen";

export const PAKET_DATEINAME = "paket.zip";
export const MERKZETTEL_NAME = "WAS-NOCH-ZU-TUN.txt";

/**
 * `leseDatei` ist injiziert, damit das Verpacken ohne Storage testbar bleibt -
 * die Benennung im ZIP ist der Teil, der beim Bewerber ankommt.
 */
export async function baueZip(
  dokumente: MappenDokument[],
  merkzettel: string,
  leseDatei: (storagePath: string) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const zip = new JSZip();
  const verzeichnis = paketVerzeichnis(dokumente);

  // Alle Downloads gleichzeitig: sie haengen nicht voneinander ab, und
  // sequenziell wartet ein Paket mit zehn Dateien zehn Storage-Roundtrips
  // hintereinander ab. Dasselbe Muster wie sonst im Mappen-Code, wo Aufrufe
  // unabhaengig sind. Das ZIP wird danach in der Reihenfolge des Verzeichnisses
  // gefuellt - die Nummerierung der Dateinamen darf nicht davon abhaengen,
  // welcher Download zuerst zurueckkommt.
  const geladen = await Promise.all(
    verzeichnis.map(async (eintrag) => {
      const dokument = dokumente.find((kandidat) => kandidat.docId === eintrag.docId);
      if (!dokument) return null;
      return { nameImZip: eintrag.nameImZip, bytes: await leseDatei(dokument.storagePath) };
    }),
  );
  for (const eintrag of geladen) {
    if (eintrag) zip.file(eintrag.nameImZip, eintrag.bytes);
  }
  zip.file(MERKZETTEL_NAME, merkzettel);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function legePaketAb(mappenId: string, bytes: Uint8Array): Promise<string> {
  const pfad = `${mappenPrefix(mappenId)}${PAKET_DATEINAME}`;
  await getStorage().bucket().file(pfad).save(Buffer.from(bytes), {
    contentType: "application/zip",
    resumable: false,
  });
  return pfad;
}

export async function leseAusStorage(storagePath: string): Promise<Uint8Array> {
  const [bytes] = await getStorage().bucket().file(storagePath).download();
  return new Uint8Array(bytes);
}
