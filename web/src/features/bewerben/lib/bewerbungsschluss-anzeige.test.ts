import { describe, expect, it } from 'vitest';
import { bewerbungsschlussAnzeige } from './bewerbungsschluss-anzeige';

/**
 * Paketseite und Merkzettel sollen denselben Wortlaut zeigen (nicht einmal
 * "in der Ausschreibung nicht angegeben", einmal "keiner"). Er kommt deshalb
 * vom Server (functions/src/lib/bewerbungsschluss.ts) - hier wird nur angezeigt.
 */
describe('bewerbungsschlussAnzeige', () => {
  it('zeigt den Wortlaut des Servers', () => {
    expect(
      bewerbungsschlussAnzeige({ bewerbungsschluss: '', bewerbungsschlussText: 'keiner, Bewerbung jederzeit möglich' })
    ).toBe('keiner, Bewerbung jederzeit möglich');
  });

  // Web und Functions werden getrennt ausgerollt - die Serverantwort kann ohne Wortlaut kommen.
  // Neutral: ohne Volltext laesst sich "jederzeit" nicht ausschliessen.
  it('faellt ohne Wortlaut vom Server auf das Datum oder eine neutrale Angabe zurueck', () => {
    expect(bewerbungsschlussAnzeige({ bewerbungsschluss: '31.12.2026' })).toBe('31.12.2026');
    expect(bewerbungsschlussAnzeige({ bewerbungsschluss: '' })).toBe('in der Ausschreibung nicht angegeben');
  });
});
