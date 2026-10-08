import { describe, expect, it } from 'vitest';
import { bewerbungJederzeitLautText, bewerbungsschlussFuerStelle } from './bewerbungsschluss';

/**
 * Spiegel der Testfaelle aus functions/src/lib/bewerbungsschluss.test.ts - der
 * Kern muss hier genauso eng bleiben: ein falscher Treffer behauptet "kein
 * Bewerbungsschluss", und der Bewerber verpasst eine echte Frist.
 */
describe('bewerbungJederzeitLautText', () => {
  it.each([
    ['Standardsatz', '<p>Bewerbung und Einstellung jederzeit möglich</p>'],
    ['jederzeit bewerben', 'Sie können sich jederzeit bewerben.'],
    ['Frist laufend', 'Bewerbungsfrist: laufend'],
    ['Bewerbungen laufend', 'Bewerbungen werden laufend entgegengenommen.']
  ])('erkennt: %s', (_fall, satz) => {
    expect(bewerbungJederzeitLautText([satz])).toBe(true);
  });

  it.each([
    ['Kontaktsatz', 'Für Fragen zu Ihrer Bewerbung steht Ihnen Frau Müller jederzeit gern zur Verfügung.'],
    ['Zurueckziehen', 'Sie können Ihre Bewerbung jederzeit zurückziehen.'],
    ['Verneinung', 'Eine Bewerbung ist nicht jederzeit möglich.'],
    ['Listenpunkte', '<ul><li>Bewerbung per Post</li><li>Rückfragen jederzeit</li></ul>'],
    ['Einstellung ganzjaehrig', 'Hinweis: Die Einstellung erfolgt ganzjährig und bedarfsorientiert'],
    ['laufende', 'Ihre Bewerbung für das laufende Verfahren']
  ])('erkennt nicht: %s', (_fall, satz) => {
    expect(bewerbungJederzeitLautText([satz])).toBe(false);
  });
});

/**
 * Bei leerem Datum muessen Stellenseite, Paket und Paketseite dasselbe zeigen
 * (Beispiel: Ausschreibung 2026-1-CIR-Fw-IT-E) - nicht gar nichts oder je etwas anderes.
 */
describe('bewerbungsschlussFuerStelle', () => {
  const leer = { applicationEnd: '', companyDesc: '', jobDesc: '', requireDesc: '', remarcDesc: '', contactDesc: '' };

  it('nennt ein vorhandenes Datum', () => {
    expect(bewerbungsschlussFuerStelle({ ...leer, applicationEnd: '31.12.2026' })).toBe('31.12.2026');
  });

  it('sagt "keiner", wenn der Text die Bewerbung jederzeit zulaesst', () => {
    expect(bewerbungsschlussFuerStelle({ ...leer, companyDesc: 'Bewerbung und Einstellung jederzeit möglich' })).toBe(
      'keiner, Bewerbung jederzeit möglich'
    );
  });

  it('liest contactDesc nicht', () => {
    const mitKontaktsatz = { ...leer, contactDesc: 'Bewerbung und Einstellung jederzeit möglich' };
    expect(bewerbungsschlussFuerStelle(mitKontaktsatz)).toBe(
      'nicht genannt, im Zweifel bei der Karriereberatung nachfragen'
    );
  });
});
