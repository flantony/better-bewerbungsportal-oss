import { describe, expect, it } from 'vitest';
import { kompiliereSuche } from './titel-suche';

function passt(titel: string, ort: string | undefined, suche: string): boolean {
  return kompiliereSuche(suche)(titel, ort);
}

/**
 * Spiegel der Testfaelle aus functions/src/lib/suchTokens.test.ts. Die
 * Stellenliste und list_jobs muessen auf dieselbe Eingabe dieselben Stellen
 * liefern - sonst findet ein Bewerber im Browser etwas anderes als seine KI.
 */
describe('kompiliereSuche', () => {
  /**
   * Per Teilstring lieferte "Sport" acht Treffer, alle "Transport".
   */
  it.each([
    'Helferin / Helfer Lagerwirtschaft / Transport (m/w/d)',
    'Transportsoldat (m/w/d)',
    'Transportunteroffizier (m/w/d)'
  ])('trifft "Sport" nicht in: %s', (titel) => {
    expect(passt(titel, 'Berlin', 'Sport')).toBe(false);
  });

  it('trifft "Sport" am Wortanfang', () => {
    expect(passt('Sportsoldatin / Sportsoldat (m/w/d)', 'Warendorf', 'Sport')).toBe(true);
  });

  it('trifft "IT" nie mitten im Wort', () => {
    expect(passt('IT-System-Elektronikerin (m/w/d)', 'Köln', 'IT')).toBe(true);
    expect(passt('Bürokraft Teilzeit (m/w/d)', 'Köln', 'IT')).toBe(false);
    expect(passt('Truppenversorgungsbearbeiter/-in SK (m/w/d)', 'Köln', 'IT')).toBe(false);
    expect(passt('Militärisches Nachrichtenwesen Feldwebel', 'Köln', 'IT')).toBe(false);
  });

  it('findet Komposita am Wortanfang und am bekannten Grundwort', () => {
    expect(passt('Softwareentwicklerin / Softwareentwickler', '', 'Software')).toBe(true);
    expect(passt('Kraftfahrerin / Kraftfahrer (m/w/d)', '', 'Fahrer')).toBe(true);
    expect(passt('Kraftfahrerin (m/w/d)', '', 'Fahrerin')).toBe(true);
    expect(passt('Notfallsanitäterin / Notfallsanitäter (m/w/d)', '', 'Sanitäter')).toBe(true);
    expect(passt('Sanitätsoffizierin / Sanitätsoffizier (m/w/d)', '', 'Sanität')).toBe(true);
    expect(passt('Spezialpioniere (m/w/d)', '', 'Pionier')).toBe(true);
  });

  it('trifft "Sanität" nicht mitten im Wort', () => {
    expect(passt('Sachbearbeiter Zentralsanitätsdienst (m/w/d)', '', 'Sanität')).toBe(false);
  });

  it('verlangt vor dem Grundwort ein Bestimmungswort von mindestens drei Buchstaben', () => {
    expect(passt('Kofahrer (m/w/d)', '', 'Fahrer')).toBe(false);
  });

  it('macht aus "Unteroffizier" keinen "Offizier" und aus "Sachbearbeiter" keinen "Arbeiter"', () => {
    expect(passt('Stabsoffizierin / Stabsoffizier (m/w/d)', '', 'Offizier')).toBe(true);
    expect(passt('Fachunteroffizierin / Fachunteroffizier (m/w/d)', '', 'Offizier')).toBe(false);
    expect(passt('Sachbearbeiterin / Sachbearbeiter (m/w/d)', '', 'Arbeiter')).toBe(false);
    expect(passt('Lagerarbeiterin / Lagerarbeiter (m/w/d)', '', 'Arbeiter')).toBe(true);
  });

  // Die eine gewollte Abweichung von list_jobs: die Liste filtert beim Tippen.
  it('trifft beim Tippen schon kurze Wortanfaenge, aber nie mitten im Wort', () => {
    expect(passt('Bürokraft (m/w/d)', 'Köln', 'Kö')).toBe(true);
    expect(passt('Kraftfahrer (m/w/d)', '', 'Fahr')).toBe(true);
    expect(passt('Pilotin / Pilot (m/w/d)', '', 'Pil')).toBe(true);
    expect(passt('Transport (m/w/d)', '', 'spo')).toBe(false);
  });

  it('sucht auch im Ort, ohne ihn an Grundwoertern zu zerlegen', () => {
    expect(passt('Bürokraft (m/w/d)', 'Köln-Wahn', 'köln')).toBe(true);
    expect(passt('Bürokraft (m/w/d)', 'Köln-Wahn', 'Wahn')).toBe(true);
    expect(passt('Bürokraft (m/w/d)', 'Wilhelmshaven', 'haven')).toBe(false);
    expect(passt('Bürokraft (m/w/d)', 'Bergmeister', 'Meister')).toBe(false);
  });

  it('verknuepft mehrere Woerter mit UND, egal ob Titel oder Ort', () => {
    expect(passt('Koch (m/w/d)', 'Köln', 'Koch Köln')).toBe(true);
    expect(passt('Koch (m/w/d)', 'Bonn', 'Koch Köln')).toBe(false);
  });

  it('ignoriert leere Eingaben und Fuellwoerter', () => {
    expect(passt('Koch (m/w/d)', 'Bonn', '')).toBe(true);
    expect(passt('Koch (m/w/d)', 'Bonn', '  (m/w/d) ')).toBe(true);
    expect(passt('Koch (m/w/d)', undefined, 'Koch')).toBe(true);
  });
});
