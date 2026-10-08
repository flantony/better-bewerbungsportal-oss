import {
  ERLAUBTE_UNTERLAGEN_TYPEN,
  MAX_DATEI_BYTES,
  MAX_UNTERLAGEN,
  MAX_UNTERLAGEN_BYTES,
  type UnterlageArt
} from '../api/types';

export type UnterlagePruefung = { ok: true } | { ok: false; fehler: string };

/**
 * Client-seitige Vorab-Pruefung, BEVOR eine Upload-URL angefragt wird -
 * spiegelt `pruefeNeueUnterlage` in functions/src/konto/unterlagen.ts (dort
 * massgeblich; hier nur schnelleres Feedback, ohne Netzwerk-Rundgang, fuer
 * eine offensichtliche Verletzung). Der Server prueft dieselben Grenzen mit
 * den echten Storage-Metadaten trotzdem noch einmal nach.
 */
export function pruefeUnterlageVorAuswahl(
  neu: { art: UnterlageArt; contentType: string; sizeBytes: number },
  bestand: { anzahl: number; bytes: number }
): UnterlagePruefung {
  if (!ERLAUBTE_UNTERLAGEN_TYPEN.includes(neu.contentType as (typeof ERLAUBTE_UNTERLAGEN_TYPEN)[number])) {
    return { ok: false, fehler: 'Erlaubt sind PDF, JPEG und PNG.' };
  }
  if (neu.sizeBytes <= 0 || neu.sizeBytes > MAX_DATEI_BYTES) {
    return { ok: false, fehler: `Eine Datei darf höchstens ${MAX_DATEI_BYTES / 1024 / 1024} MB haben.` };
  }
  if (bestand.anzahl >= MAX_UNTERLAGEN) {
    return { ok: false, fehler: `Ein Konto nimmt höchstens ${MAX_UNTERLAGEN} Dateien.` };
  }
  if (bestand.bytes + neu.sizeBytes > MAX_UNTERLAGEN_BYTES) {
    return { ok: false, fehler: `Ein Konto darf insgesamt höchstens ${MAX_UNTERLAGEN_BYTES / 1024 / 1024} MB haben.` };
  }
  return { ok: true };
}
