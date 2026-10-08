import { describe, expect, it } from 'vitest';
import { fehlerAusAntwort } from './fehler';

// WOZU: Der Server liefert Fehler als { fehler } - die Seite soll genau diesen
// Satz zeigen, und bei kaputtem Body trotzdem einen verstaendlichen.
describe('fehlerAusAntwort', () => {
  it('uebernimmt den Satz des Servers', () => {
    const f = fehlerAusAntwort(400, { fehler: 'Diese Stelle können wir nicht zuordnen.' });
    expect(f.message).toBe('Diese Stelle können wir nicht zuordnen.');
    expect(f.status).toBe(400);
  });
  it('faellt ohne Body auf eine eigene Meldung zurueck', () => {
    expect(fehlerAusAntwort(502, null).message).toMatch(/später/);
  });
});
