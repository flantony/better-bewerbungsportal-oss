import { describe, expect, it } from 'vitest';
import { dublettenKennung, ergebnisText, planeImport } from './suchprofil-import';

// WOZU: die Seite sagt VOR dem Speichern, ob die Auswahl ins Konto passt. Schon
// gespeicherte Filter ueberspringt der Server - zaehlte die Seite sie mit,
// sperrte sie das Speichern, obwohl es geklappt haette.
describe('dublettenKennung', () => {
  it('behandelt Reihenfolge, Leerzeichen und wirkungslose Werte wie der Server', () => {
    expect(dublettenKennung({ bundesland: ['Berlin', 'Bayern'], taetigkeitsbereich: 'beide', suchbegriff: ' IT ' })).toBe(
      dublettenKennung({ suchbegriff: 'IT', bundesland: ['Bayern', 'Berlin'] })
    );
    expect(dublettenKennung({ suchbegriff: 'IT' })).not.toBe(dublettenKennung({ suchbegriff: 'Pflege' }));
  });
});

describe('planeImport', () => {
  const a = { suchbegriff: 'a' };
  const b = { suchbegriff: 'b' };
  const c = { suchbegriff: 'c' };

  it('zaehlt nur neue, ausgewaehlte Filter gegen die freien Plaetze', () => {
    const gespeichert = Array.from({ length: 8 }, (_, i) => ({ suchbegriff: `alt${i}` }));
    const plan = planeImport([a, b, c], [true, true, true], gespeichert);
    expect(plan).toMatchObject({ neu: 3, frei: 2, belegt: 8, passt: false, ausgewaehlt: 3 });
    expect(planeImport([a, b, c], [true, false, true], gespeichert).passt).toBe(true);
  });

  it('braucht fuer einen schon gespeicherten oder doppelten Filter keinen Platz', () => {
    const gespeichert = [...Array.from({ length: 9 }, (_, i) => ({ suchbegriff: `alt${i}` })), a];
    const plan = planeImport([a, b, b], [true, true, true], gespeichert);
    expect(plan.schonGespeichert).toEqual([true, false, false]);
    expect(plan).toMatchObject({ neu: 1, frei: 0, passt: false });
    expect(planeImport([a], [true], gespeichert)).toMatchObject({ neu: 0, frei: 0, passt: true });
  });
});

describe('ergebnisText', () => {
  it('sagt, wie viele gespeichert wurden und wie viele es schon gab', () => {
    expect(ergebnisText(2, 1)).toBe('2 Filter gespeichert, 1 hattest du schon.');
    expect(ergebnisText(1, 0)).toBe('1 Filter gespeichert.');
    expect(ergebnisText(0, 2)).toMatch(/schon alle gespeichert/);
  });
});
