import { describe, expect, it } from 'vitest';
import type { Bewerbungsplan } from '../api/types';
import { baueZusammenfassung } from './zusammenfassung';

const PLAN: Bewerbungsplan = {
  stelle: { pinstGuid: 'p1', refCode: 'REF-1', titel: 'IT-Systemelektroniker', bewerbungsschluss: '2026-12-01', aktiv: true },
  formulare: [
    { docId: 'f1', titel: 'Bewerbungsbogen Mannschaften', ausfuellbar: true, fehlendeAngaben: [], optionaleAngaben: [] },
    { docId: 'f2', titel: 'Bewerbungsbogen Offiziere', ausfuellbar: true, fehlendeAngaben: [], optionaleAngaben: [] }
  ],
  geforderteUnterlagen: [],
  hinweise: [],
  ablage: [
    { docId: 'u1', art: 'lebenslauf', dateiname: 'lebenslauf.pdf' },
    { docId: 'u2', art: 'zeugnis', dateiname: 'zeugnis.pdf' }
  ],
  angabenVorhanden: true
};

describe('baueZusammenfassung', () => {
  it('nimmt nur die ausgewaehlten Formulare/Unterlagen mit ihren Anzeigenamen auf', () => {
    const ergebnis = baueZusammenfassung(PLAN, {
      formulare: ['f1'],
      unterlagen: ['u2'],
      anschreiben: '',
      lebenslauf: ''
    });
    expect(ergebnis.formulare).toEqual([{ docId: 'f1', name: 'Bewerbungsbogen Mannschaften' }]);
    expect(ergebnis.unterlagen).toEqual([{ docId: 'u2', name: 'zeugnis.pdf' }]);
  });

  it('traegt je Eintrag die docId - gleichnamige Unterlagen bleiben unterscheidbar', () => {
    const plan = {
      ...PLAN,
      ablage: [
        { docId: 'u1', art: 'zeugnis', dateiname: 'zeugnis.pdf' },
        { docId: 'u2', art: 'zeugnis', dateiname: 'zeugnis.pdf' }
      ]
    };
    const ergebnis = baueZusammenfassung(plan, { formulare: [], unterlagen: ['u1', 'u2'], anschreiben: '', lebenslauf: '' });
    expect(new Set(ergebnis.unterlagen.map((u) => u.docId)).size).toBe(2);
  });

  it('zaehlt einen reinen Leerzeichen-Text nicht als vorhandenen Text', () => {
    const ergebnis = baueZusammenfassung(PLAN, { formulare: [], unterlagen: [], anschreiben: '   ', lebenslauf: '\n' });
    expect(ergebnis.anschreiben).toBe(false);
    expect(ergebnis.lebenslauf).toBe(false);
    expect(ergebnis.dateianzahl).toBe(0);
  });

  it('zaehlt die Dateianzahl aus Formularen, Unterlagen und Texten zusammen', () => {
    const ergebnis = baueZusammenfassung(PLAN, {
      formulare: ['f1', 'f2'],
      unterlagen: ['u1'],
      anschreiben: 'Sehr geehrte Damen und Herren',
      lebenslauf: 'Lebenslauf-Text'
    });
    expect(ergebnis.dateianzahl).toBe(5);
    expect(ergebnis.anschreiben).toBe(true);
    expect(ergebnis.lebenslauf).toBe(true);
  });

  it('liefert leere Listen ohne jede Auswahl', () => {
    const ergebnis = baueZusammenfassung(PLAN, { formulare: [], unterlagen: [], anschreiben: '', lebenslauf: '' });
    expect(ergebnis).toEqual({
      stelleTitel: 'IT-Systemelektroniker',
      formulare: [],
      unterlagen: [],
      anschreiben: false,
      lebenslauf: false,
      dateianzahl: 0
    });
  });
});
