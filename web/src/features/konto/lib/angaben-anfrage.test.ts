import { describe, expect, it } from 'vitest';
import { baueAngabenAnfrage, leereAngaben } from './angaben-anfrage';

const TEXT_VERSION = 'staatsangehoerigkeit-v1';

const BASIS = {
  staatsangehoerigkeitEingewilligtAm: null as string | null,
  neueEinwilligung: false,
  textVersion: TEXT_VERSION
};

describe('baueAngabenAnfrage', () => {
  it('laesst unveraenderte Felder ganz weg', () => {
    const anfrage = baueAngabenAnfrage({
      ...BASIS,
      alt: { nachname: 'Muster', ort: 'Berlin' },
      formular: { nachname: 'Muster', ort: 'Berlin' }
    });
    expect(anfrage).toEqual({});
  });

  it('behandelt fehlendes altes Feld wie ein leeres', () => {
    const anfrage = baueAngabenAnfrage({
      ...BASIS,
      alt: {},
      formular: { nachname: '' }
    });
    expect(anfrage).toEqual({});
  });

  it('sendet ein geaendertes Feld mit dem neuen Wert', () => {
    const anfrage = baueAngabenAnfrage({
      ...BASIS,
      alt: { nachname: 'Muster' },
      formular: { nachname: 'Musterfrau' }
    });
    expect(anfrage).toEqual({ nachname: 'Musterfrau' });
  });

  it('sendet ein auf leer geaendertes Feld als "" (Entfernen-Signal)', () => {
    const anfrage = baueAngabenAnfrage({
      ...BASIS,
      alt: { nachname: 'Muster' },
      formular: { nachname: '' }
    });
    expect(anfrage).toEqual({ nachname: '' });
  });

  it('haengt bei neuer Einwilligung und neuem Wert die Einwilligung an', () => {
    const anfrage = baueAngabenAnfrage({
      alt: {},
      formular: { staatsangehoerigkeit: 'deutsch' },
      staatsangehoerigkeitEingewilligtAm: null,
      neueEinwilligung: true,
      textVersion: TEXT_VERSION
    });
    expect(anfrage).toEqual({
      staatsangehoerigkeit: 'deutsch',
      einwilligung: { textVersion: TEXT_VERSION }
    });
  });

  it('haengt keine Einwilligung an, wenn schon eine besteht', () => {
    const anfrage = baueAngabenAnfrage({
      alt: { staatsangehoerigkeit: 'deutsch' },
      formular: { staatsangehoerigkeit: 'deutsch, franzoesisch' },
      staatsangehoerigkeitEingewilligtAm: '2026-01-01T00:00:00.000Z',
      neueEinwilligung: false,
      textVersion: TEXT_VERSION
    });
    expect(anfrage).toEqual({ staatsangehoerigkeit: 'deutsch, franzoesisch' });
  });

  it('haengt keine Einwilligung an, wenn der Haken gesetzt ist, aber sich das Feld nicht aendert', () => {
    const anfrage = baueAngabenAnfrage({
      alt: {},
      formular: {},
      staatsangehoerigkeitEingewilligtAm: null,
      neueEinwilligung: true,
      textVersion: TEXT_VERSION
    });
    expect(anfrage).toEqual({});
  });

  it('haengt keine Einwilligung an, wenn das Feld nur geloescht wird', () => {
    const anfrage = baueAngabenAnfrage({
      alt: { staatsangehoerigkeit: 'deutsch' },
      formular: { staatsangehoerigkeit: '' },
      staatsangehoerigkeitEingewilligtAm: '2026-01-01T00:00:00.000Z',
      neueEinwilligung: false,
      textVersion: TEXT_VERSION
    });
    expect(anfrage).toEqual({ staatsangehoerigkeit: '' });
  });

  // Kritisch: ein VERALTETER Formularwert - z.B. ein
  // Widerruf hat die Angabe UND die Einwilligung laengst geloescht, aber das
  // Formularfeld selbst zieht nicht automatisch nach - darf niemals als neue
  // Staatsangehoerigkeit ohne Einwilligung hinausgehen, auch wenn der Haken
  // in dieser Sitzung nie gesetzt wurde.
  it('sendet staatsangehoerigkeit NIE ohne gueltige Einwilligung - weder bestehend noch neu', () => {
    const anfrage = baueAngabenAnfrage({
      alt: {},
      formular: { staatsangehoerigkeit: 'deutsch' },
      staatsangehoerigkeitEingewilligtAm: null,
      neueEinwilligung: false,
      textVersion: TEXT_VERSION
    });
    expect(anfrage).toEqual({});
  });
});

describe('leereAngaben', () => {
  it('liefert alle zwoelf Felder als leeren String', () => {
    const angaben = leereAngaben();
    expect(Object.keys(angaben)).toHaveLength(12);
    expect(Object.values(angaben).every((wert) => wert === '')).toBe(true);
  });
});
