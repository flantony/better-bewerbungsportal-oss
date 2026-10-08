/**
 * 404 heisst hier: dieser Endpunkt fehlt auf dem Server - Web und Functions
 * werden getrennt ausgerollt, das Web kann vor den Functions live sein. Der
 * betroffene Bereich zeigt dann nichts, statt die ganze Seite abzubrechen
 * (s. benachrichtigungs-zustand.ts fuer denselben Gedanken bei den
 * Benachrichtigungen). Reine Statuspruefung, damit ladeAngaben/ladeUnterlagen sie ohne
 * Netzwerk testbar aufrufen koennen.
 */
export function istNichtVerfuegbar(status: number): boolean {
  return status === 404;
}

/**
 * Ueber Origins hinweg kommt eine fehlende Function gar nicht
 * als lesbare 404 an - schon der CORS-Preflight wird mit 404 ohne CORS-Header
 * beantwortet, und der Browser laesst `fetch` mit einem TypeError scheitern.
 * Ein TypeError zaehlt deshalb wie 404 als "nicht verfuegbar" (ein echter
 * Netzausfall landet damit ebenfalls hier - der Bereich bleibt dann verborgen
 * statt eine Fehlermeldung zu zeigen, die sichere Richtung).
 */
export function istNichtVerfuegbarFehler(fehler: unknown): boolean {
  if (fehler instanceof TypeError) return true;
  const status = (fehler as { status?: unknown } | null)?.status;
  return typeof status === 'number' && istNichtVerfuegbar(status);
}
