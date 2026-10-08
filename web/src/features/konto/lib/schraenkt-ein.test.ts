import { describe, expect, it } from 'vitest';
import { schraenktEin } from './schraenkt-ein';

// WOZU: das Formular setzt taetigkeitsbereich/beschaeftigungsumfang
// standardmaessig auf 'beide' - ein so gespeichertes Profil erzeugt in
// queryJobs keine Bedingung und hiesse "alle Stellen". Dieselbe Regel wie
// hatSuchprofil in functions/src/konto/benachrichtigung.ts.
describe('schraenktEin', () => {
  it('ist false fuer null und ein leeres Profil', () => {
    expect(schraenktEin(null)).toBe(false);
    expect(schraenktEin({})).toBe(false);
  });

  it('ist false, wenn nur neutrale Werte gesetzt sind', () => {
    expect(schraenktEin({ taetigkeitsbereich: 'beide', beschaeftigungsumfang: 'beide', seiteneinstieg: false })).toBe(
      false
    );
    expect(schraenktEin({ bundesland: [], wunschort: '  ', besoldungstabelle: 'E' })).toBe(false);
  });

  it('ist true, sobald ein Wert die Suche einschraenkt', () => {
    expect(schraenktEin({ bundesland: ['Bayern'] })).toBe(true);
    expect(schraenktEin({ taetigkeitsbereich: 'zivil' })).toBe(true);
    expect(schraenktEin({ seiteneinstieg: true })).toBe(true);
    expect(schraenktEin({ mindestbesoldung: 9, besoldungstabelle: 'A' })).toBe(true);
  });
});
