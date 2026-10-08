import { describe, expect, it } from 'vitest';
import { vorausgewaehlteUnterlagen } from './unterlagen-vorauswahl';

describe('vorausgewaehlteUnterlagen', () => {
  it('waehlt Lebenslauf und Zeugnis vor', () => {
    const ablage = [
      { docId: 'a', art: 'lebenslauf', dateiname: 'lebenslauf.pdf' },
      { docId: 'b', art: 'zeugnis', dateiname: 'zeugnis.pdf' }
    ];
    expect(vorausgewaehlteUnterlagen(ablage)).toEqual(['a', 'b']);
  });

  it('laesst Sonstiges und Ausweiskopie aussen vor', () => {
    const ablage = [
      { docId: 'a', art: 'sonstiges', dateiname: 'sonstiges.pdf' },
      { docId: 'b', art: 'ausweiskopie', dateiname: 'ausweis.pdf' }
    ];
    expect(vorausgewaehlteUnterlagen(ablage)).toEqual([]);
  });

  it('liefert eine leere Liste ohne eigene Ablage', () => {
    expect(vorausgewaehlteUnterlagen([])).toEqual([]);
  });

  it('waehlt mehrere Zeugnisse gleichzeitig vor', () => {
    const ablage = [
      { docId: 'a', art: 'zeugnis', dateiname: 'schulzeugnis.pdf' },
      { docId: 'b', art: 'zeugnis', dateiname: 'arbeitszeugnis.pdf' },
      { docId: 'c', art: 'sonstiges', dateiname: 'anderes.pdf' }
    ];
    expect(vorausgewaehlteUnterlagen(ablage)).toEqual(['a', 'b']);
  });
});
