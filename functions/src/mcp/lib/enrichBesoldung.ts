import { deriveBesoldung, type BesoldungAbleitung } from "../../lib/besoldung";

/**
 * Reicht die abgeleitete Besoldungsspanne an MCP-Clients weiter.
 *
 * NUR AUS DEM TITEL: die Beschreibungstexte nennen regelmaessig den
 * Dienstgrad der ANSPRECHPARTNERIN ("Ihre Ansprechpartnerin, Hauptmann
 * Mueller, ...") - daraus eine Besoldungsgruppe fuer die Stelle abzuleiten
 * waere schlicht falsch. Der Titel nennt den Dienstgrad dagegen nur dann,
 * wenn er die Stelle selbst betrifft.
 *
 * Zur Laufzeit berechnet statt beim Sync gespeichert: es ist eine reine
 * Funktion des Titels, damit gibt es weder Migration noch veraltete Werte.
 */
export interface BesoldungHinweis {
  /** Anzeigeform, z.B. "A11-A12". */
  label: string;
  von: number;
  bis: number;
  /** Die im Titel erkannten Dienstgrade, damit die Herleitung nachvollziehbar ist. */
  erkannteDienstgrade: string[];
  /** Immer gesetzt - macht unmissverstaendlich, dass das keine Amtsangabe ist. */
  hinweis: string;
}

const HINWEIS =
  "Abgeleitet aus dem Dienstgrad im Titel über die Bundesbesoldungsordnung A (Anlage I BBesG), keine Angabe der Ausschreibung. Die konkrete Gruppe hängt am Dienstposten.";

export function besoldungFromTitle(title: string): BesoldungHinweis | null {
  const derived: BesoldungAbleitung | null = deriveBesoldung(title);
  if (!derived) return null;
  return {
    label: derived.label,
    von: derived.von,
    bis: derived.bis,
    erkannteDienstgrade: derived.dienstgrade,
    hinweis: HINWEIS,
  };
}
