/**
 * Grenzen des Uploads.
 *
 * Der gemeldete Content-Type ist fälschbar. Das ist hinnehmbar: nichts wird
 * ausgeführt, die Dateien werden gezippt und derselben Person zurückgegeben.
 */
import { HinweisFehler } from "../lib/hinweisFehler";

export const ERLAUBTE_TYPEN = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_DATEI_BYTES = 10 * 1024 * 1024;
export const MAX_DATEIEN = 10;
export const MAX_MAPPE_BYTES = 30 * 1024 * 1024;

/**
 * Erkennt den Inhaltstyp an den ersten Bytes, statt dem Aufrufer zu glauben.
 *
 * WOZU: `Buffer.from(..., "base64")` verwirft ungueltige Zeichen still. Ohne
 * diese Pruefung laege eine kaputte Datei als angebliches PDF in der Mappe,
 * wanderte ins ZIP und wuerde eingereicht. Beim Upload ueber die Browser-Seite
 * melden wir den Typ des Browsers - faelschbar, aber dort hinnehmbar (nichts
 * wird ausgefuehrt); hier haben wir die Bytes und koennen nachsehen.
 */
export function erkenneTyp(bytes: Uint8Array): string | null {
  const beginnt = (...muster: number[]) => muster.every((byte, i) => bytes[i] === byte);
  if (beginnt(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (beginnt(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (beginnt(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  return null;
}

/**
 * Die Mengengrenze der Mappe ist erreicht - fuer die MCP-Werkzeuge, die ueber
 * `fuegeDokumentEin` ablegen. Der Grund kommt aus `pruefeUpload` bzw.
 * `pruefeFreienPlatz`; dahinter steht der Weg heraus, weil die KI sonst nur eine
 * Sackgasse sieht. Die
 * Upload-Seite bekommt den Grund allein, s. mappeHttp.ts.
 */
export class MappeVollError extends HinweisFehler {
  constructor(grund: string) {
    super(
      `${grund} Mit mappe_status siehst du, was schon in der Mappe liegt. Doppelte oder überzählige Dateien ` +
        "nimmt der Bewerber auf der Upload-Seite aus eroeffne_bewerbungsmappe heraus; danach kannst du es erneut versuchen.",
    );
    this.name = "MappeVollError";
  }
}

/**
 * Vorab-Pruefung VOR teurer Arbeit (PDF rendern oder ausfuellen): ist ueberhaupt
 * noch ein Platz frei? Die Groesse steht da noch nicht fest; verbindlich prueft
 * `pruefeUpload` in der Transaktion von `fuegeDokumentEin`.
 */
export function pruefeFreienPlatz(bestand: { anzahl: number }): { ok: true } | { ok: false; grund: string } {
  if (bestand.anzahl >= MAX_DATEIEN) {
    return { ok: false, grund: `Eine Mappe nimmt höchstens ${MAX_DATEIEN} Dateien.` };
  }
  return { ok: true };
}

export function pruefeUpload(
  anfrage: { contentType: string; sizeBytes: number },
  bestand: { anzahl: number; summeBytes: number },
): { ok: true } | { ok: false; grund: string } {
  if (!ERLAUBTE_TYPEN.includes(anfrage.contentType as (typeof ERLAUBTE_TYPEN)[number])) {
    return { ok: false, grund: "Erlaubt sind PDF, JPEG und PNG." };
  }
  if (anfrage.sizeBytes <= 0 || anfrage.sizeBytes > MAX_DATEI_BYTES) {
    return { ok: false, grund: `Eine Datei darf höchstens ${MAX_DATEI_BYTES / 1024 / 1024} MB haben.` };
  }
  if (bestand.anzahl >= MAX_DATEIEN) {
    return { ok: false, grund: `Eine Mappe nimmt höchstens ${MAX_DATEIEN} Dateien.` };
  }
  if (bestand.summeBytes + anfrage.sizeBytes > MAX_MAPPE_BYTES) {
    return { ok: false, grund: `Eine Mappe darf insgesamt höchstens ${MAX_MAPPE_BYTES / 1024 / 1024} MB haben.` };
  }
  return { ok: true };
}
