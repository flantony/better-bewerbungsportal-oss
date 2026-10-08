import type { Suchprofil } from '../api/types';

/**
 * Schraenkt das Suchprofil die Suche ueberhaupt ein? Neutral (keine Bedingung
 * in queryJobs) sind leere Listen und Texte, 'beide' bei taetigkeitsbereich
 * und beschaeftigungsumfang, `seiteneinstieg: false` und `besoldungstabelle`
 * ohne `mindestbesoldung`. Spiegel von `hatSuchprofil` in
 * functions/src/konto/benachrichtigung.ts - der Server entscheidet, das hier
 * ist nur fuer den Hinweis am Schalter.
 */
export function schraenktEin(profil: Suchprofil | null): boolean {
  if (!profil) return false;
  return Object.entries(profil).some(([feld, wert]) => {
    if (wert === undefined || wert === null) return false;
    if (Array.isArray(wert)) return wert.length > 0;
    if (typeof wert === 'string' && wert.trim() === '') return false;
    if ((feld === 'taetigkeitsbereich' || feld === 'beschaeftigungsumfang') && wert === 'beide') return false;
    if (feld === 'seiteneinstieg') return wert === true;
    if (feld === 'besoldungstabelle') return false;
    return true;
  });
}
