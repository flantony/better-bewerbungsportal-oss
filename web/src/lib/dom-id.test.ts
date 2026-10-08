import { describe, expect, it } from 'vitest';
import { slugifyId } from './dom-id';

describe('slugifyId', () => {
  it('ersetzt Leerzeichen', () => {
    expect(slugifyId('Heer Marine', 0)).toBe('heer-marine-0');
  });

  it('ersetzt Schraegstriche', () => {
    expect(slugifyId('Sold./Zivil', 0)).toBe('sold-zivil-0');
  });

  it('ersetzt Kommas', () => {
    expect(slugifyId('Heer, Marine, Luftwaffe', 0)).toBe('heer-marine-luftwaffe-0');
  });

  it('transliteriert Umlaute und scharfes S', () => {
    expect(slugifyId('Größe', 0)).toBe('groesse-0');
    expect(slugifyId('Straße', 1)).toBe('strasse-1');
  });

  it('haelt zwei Werte, die auf denselben Slug abbilden, per Index auseinander', () => {
    const erster = slugifyId('A/B', 0);
    const zweiter = slugifyId('A B', 1);
    expect(erster).not.toBe(zweiter);
  });

  it('faellt bei einem rein aus Sonderzeichen bestehenden Wert nicht auf eine leere id zurueck', () => {
    expect(slugifyId('---', 3)).toBe('wert-3');
  });
});
