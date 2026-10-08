/**
 * Ein Fehler, dessen Text fuer den Aufrufer BESTIMMT ist - eine Anleitung an die
 * fremde KI, kein technischer
 * Bericht.
 *
 * WOZU: Das MCP-SDK gibt bei einem geworfenen Fehler `error.message` unveraendert
 * als Werkzeugantwort heraus. Fuer unsere eigenen Saetze ist das gewollt; fuer
 * eine Firestore- oder Storage-Meldung nicht - die kann einen Objektpfad mit der
 * `mappenId` tragen, dem einzigen Zugriffsschutz einer Mappe. Deshalb geht nach
 * aussen nur der Text eines `HinweisFehler`s (und seiner Unterklassen); alles
 * andere ersetzt `fuerDenClient` in `mcp/lib/werkzeugFehler.ts` durch einen
 * festen Satz.
 *
 * Eigene Unterklassen setzen `name` selbst - das Fehlerprotokoll fuehrt sie
 * unter diesem Namen.
 */
export class HinweisFehler extends Error {
  constructor(meldung: string) {
    super(meldung);
    this.name = "HinweisFehler";
  }
}
