import type { Suchprofil } from '../api/types';
import { ohneLeeres } from './ohne-leeres';

/**
 * Fuehrt das gespeicherte Suchprofil mit den Werten aus dem Formular zusammen,
 * statt es beim Speichern zu ersetzen: das Formular zeigt nicht alle Felder
 * (seiteneinstieg, mindestbesoldung, besoldungstabelle) - ein Speichern darf
 * sie trotzdem nicht loeschen.
 */
export function zusammenfuehren(alt: Suchprofil | null, formular: Suchprofil): Suchprofil {
  return ohneLeeres({ ...alt, ...formular });
}
