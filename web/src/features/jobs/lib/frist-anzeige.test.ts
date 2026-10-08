import { describe, expect, it } from 'vitest';
import { FRIST_BALD_TAGE, fristAnzeige } from './frist-anzeige';

const DAY_MS = 24 * 60 * 60 * 1000;
// Mitternacht zu Beginn des Stichtags, wie applicationEndSortKey (s. job-filters.ts isExpired).
const STICHTAG = new Date(2026, 9, 20).getTime();

function stelle(applicationEnd: string, applicationEndSortKey: number) {
  return { applicationEnd, applicationEndSortKey };
}

// Waere jede Frist ein roter Chip, verloere Rot seine Bedeutung.
describe('fristAnzeige', () => {
  it('markiert nur Fristen in den naechsten zwei Wochen als bald', () => {
    const bald = fristAnzeige(stelle('20.10.2026', STICHTAG), STICHTAG - 3 * DAY_MS - DAY_MS / 2);
    expect(bald).toEqual({ art: 'bald', datum: '20.10.2026', text: 'bis 20.10.2026 · noch 4 Tage' });

    const grenze = fristAnzeige(stelle('20.10.2026', STICHTAG), STICHTAG - FRIST_BALD_TAGE * DAY_MS);
    expect(grenze.art).toBe('bald');

    const spaeter = fristAnzeige(stelle('20.10.2026', STICHTAG), STICHTAG - 30 * DAY_MS);
    expect(spaeter).toEqual({ art: 'offen', datum: '20.10.2026', text: 'bis 20.10.2026' });
  });

  it('sagt am Stichtag "endet heute" und am Vortag "endet morgen"', () => {
    expect(fristAnzeige(stelle('20.10.2026', STICHTAG), STICHTAG + 10 * 60 * 60 * 1000)).toMatchObject({
      text: 'bis 20.10.2026 · endet heute'
    });
    expect(fristAnzeige(stelle('20.10.2026', STICHTAG), STICHTAG - 2 * 60 * 60 * 1000)).toMatchObject({
      text: 'bis 20.10.2026 · endet morgen'
    });
  });

  it('erkennt abgelaufene Fristen erst nach dem Stichtag', () => {
    expect(fristAnzeige(stelle('20.10.2026', STICHTAG), STICHTAG + DAY_MS).art).toBe('abgelaufen');
    expect(fristAnzeige(stelle('20.10.2026', STICHTAG), STICHTAG + DAY_MS - 1).art).toBe('bald');
  });

  it('ohne Datum gibt es keine Frist zum Einfaerben', () => {
    expect(fristAnzeige(stelle('', Number.MAX_SAFE_INTEGER), STICHTAG).art).toBe('ohne');
  });
});
