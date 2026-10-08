/**
 * Titel eines Formulars, wie er auf der Seite steht. Die Bundeswehr-Daten
 * liefern Dateititel ("Bewerbungsbogen_Militärisch"); fuer die Anzeige werden
 * Unterstriche zu Leerzeichen. Nur Anzeige - Daten, docId und Dateinamen im
 * Paket bleiben unveraendert.
 */
export function formularAnzeigeTitel(titel: string): string {
  return titel.replace(/[_\s]+/g, ' ').trim();
}
