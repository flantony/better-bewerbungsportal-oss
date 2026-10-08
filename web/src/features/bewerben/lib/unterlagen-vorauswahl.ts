import type { AblageEintrag } from '../api/types';

/**
 * Reiner Vorschlag (Schritt 3): welche eigenen Ablage-
 * Unterlagen fuer diese Bewerbung schon vorausgewaehlt werden - NUR nach Art
 * (Lebenslauf/Zeugnis), nie nach Dateiname oder Inhalt. Eine Vermutung, keine
 * Zusage: der Bewerber sieht jede Auswahl als normale Checkbox und kann sie
 * jederzeit wieder abwaehlen.
 */
export function vorausgewaehlteUnterlagen(ablage: AblageEintrag[]): string[] {
  return ablage.filter((eintrag) => eintrag.art === 'lebenslauf' || eintrag.art === 'zeugnis').map((eintrag) => eintrag.docId);
}
