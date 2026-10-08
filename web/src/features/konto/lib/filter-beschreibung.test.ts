import { describe, expect, it } from 'vitest';
import type { Suchoptionen } from '../api/types';
import { beschreibeFilter, filterErklaerungen, filterKennung, trefferText } from './filter-beschreibung';

const OPTIONEN: Suchoptionen = {
  organisationsbereich: [],
  laufbahngruppe: ['Mannschaften', 'Andere'],
  bundesland: [],
  vertragsarten: [],
  einstiegswege: ['seiteneinstieg'],
  laufbahngruppeBedeutung: { Mannschaften: 'Text vom Server', Andere: '' },
  einstiegswegBedeutung: { seiteneinstieg: 'Weg-Text vom Server' }
};

// WOZU: jede Filterkarte braucht eine Zeile, die ohne Bundeswehr-Vorwissen
// sagt, wonach der Filter sucht - nur aus den gewaehlten Werten, nie mit
// selbst formulierten Erklaerungen.
describe('beschreibeFilter', () => {
  it('reiht die gewaehlten Werte in fester Reihenfolge aneinander', () => {
    expect(
      beschreibeFilter({
        suchbegriff: ' IT ',
        wunschort: 'Köln',
        vertragsarten: ['Reservedienst'],
        taetigkeitsbereich: 'zivil',
        beschaeftigungsumfang: 'teilzeit'
      })
    ).toBe('„IT“ · in Köln · zivil · Reservedienst · Teilzeit');
  });

  it('laesst neutrale Werte weg und kuerzt lange Listen', () => {
    expect(
      beschreibeFilter({
        taetigkeitsbereich: 'beide',
        beschaeftigungsumfang: 'beide',
        seiteneinstieg: false,
        bundesland: ['Bayern', 'Berlin', 'Hessen', 'Saarland', 'Sachsen']
      })
    ).toBe('Bayern, Berlin, Hessen und 2 weitere');
  });

  it('zeigt Einstiegswege mit Anzeigenamen und die Mindestbesoldung', () => {
    expect(beschreibeFilter({ einstiegswege: ['seiteneinstieg'], mindestbesoldung: 9, besoldungstabelle: 'A' })).toBe(
      'Seiteneinstieg · ab A 9'
    );
    expect(beschreibeFilter({ mindestbesoldung: 11 })).toBe('ab Besoldungsstufe 11');
  });

  it('sagt ausdruecklich, wenn ein Filter nichts einschraenkt', () => {
    expect(beschreibeFilter({})).toBe('Alle Stellen, ohne Einschränkung');
  });
});

describe('filterErklaerungen', () => {
  it('nimmt nur Bedeutungstexte vom Server und laesst leere weg', () => {
    expect(
      filterErklaerungen({ laufbahngruppe: ['Mannschaften', 'Andere', 'Unbekannt'], einstiegswege: ['seiteneinstieg'] }, OPTIONEN)
    ).toEqual([
      { begriff: 'Mannschaften', bedeutung: 'Text vom Server' },
      { begriff: 'Seiteneinstieg', bedeutung: 'Weg-Text vom Server' }
    ]);
  });
});

describe('filterKennung', () => {
  it('ist unabhaengig von Reihenfolge und leeren Werten', () => {
    expect(filterKennung({ bundesland: ['Berlin', 'Bayern'], wunschort: '', suchbegriff: 'IT' })).toBe(
      filterKennung({ suchbegriff: 'IT', bundesland: ['Bayern', 'Berlin'], vertragsarten: [] })
    );
    expect(filterKennung({ suchbegriff: 'IT' })).not.toBe(filterKennung({ suchbegriff: 'Sanitäter' }));
  });
});

describe('trefferText', () => {
  it('formuliert null, eins, viele und eine Untergrenze', () => {
    expect(trefferText({ anzahl: 0, mindestens: false })).toBe('Gerade ist keine passende Stelle offen.');
    expect(trefferText({ anzahl: 1, mindestens: false })).toBe('Eine passende Stelle ist gerade offen.');
    expect(trefferText({ anzahl: 1234, mindestens: false })).toBe('1.234 passende Stellen sind gerade offen.');
    expect(trefferText({ anzahl: 3000, mindestens: true })).toBe('Mindestens 3.000 passende Stellen sind gerade offen.');
  });
});
