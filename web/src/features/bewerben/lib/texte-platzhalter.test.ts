import { describe, expect, it } from 'vitest';
import {
  offenePlatzhalterSaetze,
  platzhalterAngabenAus,
  uebernimmMitPlatzhaltern
} from './texte-platzhalter';

/**
 * Der Rueckgabeblock von ChatGPT traegt "[Adresse]", "[PLZ Ort]", "[Telefon]",
 * "[E-Mail]" im Briefkopf - die Seite darf sie beim Uebernehmen nicht
 * unveraendert einsetzen, sonst stehen sie bis ins PDF.
 */
const SICHT = {
  angaben: { vorname: 'Max', nachname: 'Beispiel', strasse: 'Musterweg 1', plz: '50667', ort: 'Köln', telefon: '0221 1' },
  staatsangehoerigkeitEingewilligtAm: null
};

describe('platzhalterAngabenAus', () => {
  it('nimmt die gespeicherten Angaben', () => {
    expect(platzhalterAngabenAus(SICHT)).toMatchObject({ strasse: 'Musterweg 1', telefon: '0221 1' });
  });

  // Die Anmelde-Adresse (oft eine dienstliche) gehoert nicht ungefragt ins Anschreiben.
  it('nimmt nur eine gespeicherte E-Mail, nie die Anmelde-Adresse', () => {
    expect(platzhalterAngabenAus(SICHT).email).toBeUndefined();
    expect(platzhalterAngabenAus({ ...SICHT, angaben: { ...SICHT.angaben, email: 'eigene@example.com' } }).email).toBe(
      'eigene@example.com'
    );
  });

  it('liefert ohne geladene Angaben nichts', () => {
    expect(platzhalterAngabenAus(undefined)).toEqual({});
    expect(platzhalterAngabenAus('nicht-verfuegbar')).toEqual({});
  });
});

describe('uebernimmMitPlatzhaltern', () => {
  it('setzt in beiden Texten ein und meldet, was eingesetzt wurde', () => {
    const ergebnis = uebernimmMitPlatzhaltern(
      { anschreiben: 'Max Beispiel\n[Adresse]\n[PLZ Ort]\n[Telefon]\n[E-Mail]', lebenslauf: 'Wohnort: [Ort]' },
      platzhalterAngabenAus(SICHT)
    );
    // Ohne gespeicherte E-Mail bleibt [E-Mail] stehen.
    expect(ergebnis.anschreiben).toBe('Max Beispiel\nMusterweg 1\n50667 Köln\n0221 1\n[E-Mail]');
    expect(ergebnis.lebenslauf).toBe('Wohnort: Köln');
    expect(ergebnis.ersetzt).toEqual(['[Adresse]', '[PLZ Ort]', '[Telefon]', '[Ort]']);
  });

  it('laesst einen fehlenden Abschnitt fehlen', () => {
    const ergebnis = uebernimmMitPlatzhaltern({ lebenslauf: '[Telefon]' }, {});
    expect(ergebnis).toEqual({ lebenslauf: '[Telefon]', ersetzt: [] });
  });
});

describe('offenePlatzhalterSaetze', () => {
  it('nennt je Text die verbliebenen Platzhalter', () => {
    expect(offenePlatzhalterSaetze({ anschreiben: 'Köln, [Datum]', lebenslauf: '[Telefon] [Datum]' })).toEqual([
      'Im Anschreiben stehen noch Platzhalter in eckigen Klammern: [Datum]. Ersetze sie durch deinen eigenen Text, bevor du das Paket baust.',
      'Im Lebenslauf stehen noch Platzhalter in eckigen Klammern: [Telefon], [Datum]. Ersetze sie durch deinen eigenen Text, bevor du das Paket baust.'
    ]);
  });

  it('sagt nichts, wenn keine Platzhalter mehr drin sind', () => {
    expect(offenePlatzhalterSaetze({ anschreiben: 'Fertig [1]', lebenslauf: '' })).toEqual([]);
  });
});
