import { describe, expect, it } from 'vitest';
import { ausgeblendetText, ausMailText, teileMerkliste } from './merkliste-anzeige';

const JETZT = new Date('2026-10-12T10:00:00.000Z');

const job = (active: boolean, applicationEnd = '') => ({ active, applicationEnd });

// WOZU: die Merkliste zeigt nur Stellen, auf die
// man sich noch bewerben kann - geschlossene verschwinden sofort, nicht erst,
// wenn der Nachtlauf sie aus dem Konto nimmt.
describe('teileMerkliste', () => {
  it('zeigt offene Stellen in Listenreihenfolge und blendet geschlossene aus', () => {
    const merkliste = [
      { pinstGuid: 'OFFEN', gemerktAm: '2026-10-01T00:00:00.000Z', ausMail: '2026-10-01T02:00:00.000Z' },
      { pinstGuid: 'ARCHIV', gemerktAm: '2026-10-01T00:00:00.000Z' },
      { pinstGuid: 'FRIST_VORBEI', gemerktAm: '2026-10-01T00:00:00.000Z' },
      { pinstGuid: 'WEG', gemerktAm: '2026-10-01T00:00:00.000Z' },
      { pinstGuid: 'JEDERZEIT', gemerktAm: '2026-10-01T00:00:00.000Z' }
    ];
    const jobs = new Map([
      ['OFFEN', job(true, '30.10.2026')],
      ['ARCHIV', job(false, '30.10.2026')],
      ['FRIST_VORBEI', job(true, '11.10.2026')],
      ['JEDERZEIT', job(true, '')]
    ]);

    const { sichtbar, ausgeblendet, ausgeblendeteIds } = teileMerkliste(merkliste, jobs, JETZT);

    expect(sichtbar.map(({ eintrag }) => eintrag.pinstGuid)).toEqual(['OFFEN', 'JEDERZEIT']);
    expect(ausgeblendet).toBe(3);
    expect(ausgeblendeteIds).toEqual(['ARCHIV', 'FRIST_VORBEI', 'WEG']);
  });

  it('zaehlt den Stichtag selbst noch als offen', () => {
    const { sichtbar } = teileMerkliste(
      [{ pinstGuid: 'HEUTE', gemerktAm: '2026-10-01T00:00:00.000Z' }],
      new Map([['HEUTE', job(true, '12.10.2026')]]),
      JETZT
    );
    expect(sichtbar).toHaveLength(1);
  });
});

describe('ausMailText', () => {
  it('nennt den deutschen Kalendertag der Mail', () => {
    expect(ausMailText('2026-10-12T02:00:00.000Z')).toBe('Gemerkt aus der Mail vom 12.10.');
    // 23:30 UTC ist in Berlin schon der naechste Tag.
    expect(ausMailText('2026-10-11T23:30:00.000Z')).toBe('Gemerkt aus der Mail vom 12.10.');
  });

  it('sagt nichts bei selbst gemerkten oder alten Eintraegen und bei Unlesbarem', () => {
    expect(ausMailText(undefined)).toBeNull();
    expect(ausMailText('kaputt')).toBeNull();
  });
});

describe('ausgeblendetText', () => {
  it('erklaert ausgeblendete Stellen in Ein- und Mehrzahl, sonst nichts', () => {
    expect(ausgeblendetText(0)).toBeNull();
    expect(ausgeblendetText(1)).toMatch(/^Eine gemerkte Stelle ist nicht mehr ausgeschrieben.*zählt sie noch zu deiner Merkliste/);
    expect(ausgeblendetText(3)).toMatch(/^3 gemerkte Stellen sind nicht mehr ausgeschrieben/);
  });
});
