import type { Bewerbungsplan } from '../api/types';

/**
 * Der Bewerbungsschluss auf der Paketseite. Der Wortlaut kommt vom Server
 * (`bewerbungsschlussText`, functions/src/lib/bewerbungsschluss.ts) - derselbe
 * wie im Merkzettel des Pakets und auf der KI-Seite. Der Rueckfall gilt nur
 * fuer eine Serverantwort ohne das Feld (Web und Functions werden getrennt
 * ausgerollt).
 */
export function bewerbungsschlussAnzeige(
  stelle: Pick<Bewerbungsplan['stelle'], 'bewerbungsschluss' | 'bewerbungsschlussText'>
): string {
  if (stelle.bewerbungsschlussText) return stelle.bewerbungsschlussText;
  // Neutral, nicht "nicht genannt": ohne den Volltext laesst sich ein
  // "jederzeit" hier nicht ausschliessen.
  return stelle.bewerbungsschluss || 'in der Ausschreibung nicht angegeben';
}
