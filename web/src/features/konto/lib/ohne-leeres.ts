import type { Suchprofil } from '../api/types';

/**
 * Leere Arrays und leere Strings vor dem Speichern entfernen - sie wuerden beim
 * Abgleich mit den Stellen zu "passt auf nichts"-Filtern statt zu "egal,
 * welcher Wert".
 */
export function ohneLeeres(profil: Suchprofil): Suchprofil {
  return Object.fromEntries(
    Object.entries(profil).filter(([, wert]) =>
      Array.isArray(wert) ? wert.length > 0 : wert !== '' && wert !== undefined
    )
  ) as Suchprofil;
}
