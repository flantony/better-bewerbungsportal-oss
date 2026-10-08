import { describe, expect, it } from 'vitest';
import { belegteAngaben, hatGespeicherteAngaben } from './gespeicherte-angaben';

describe('hatGespeicherteAngaben', () => {
  it('ist leer ohne Sicht oder nur mit leeren Feldern', () => {
    expect(hatGespeicherteAngaben(null)).toBe(false);
    expect(hatGespeicherteAngaben({ angaben: { vorname: '  ' }, staatsangehoerigkeitEingewilligtAm: null })).toBe(false);
  });

  it('zaehlt belegte Felder', () => {
    const sicht = { angaben: { vorname: 'Max', nachname: 'Muster', ort: '' }, staatsangehoerigkeitEingewilligtAm: null };
    expect(belegteAngaben(sicht)).toBe(2);
    expect(hatGespeicherteAngaben(sicht)).toBe(true);
  });

  it('zaehlt einen Einwilligungsvermerk ohne Wert als gespeichert', () => {
    expect(hatGespeicherteAngaben({ angaben: {}, staatsangehoerigkeitEingewilligtAm: '2026-09-30T00:00:00.000Z' })).toBe(
      true
    );
  });
});
