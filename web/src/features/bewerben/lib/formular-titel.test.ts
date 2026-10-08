import { describe, expect, it } from 'vitest';
import { formularAnzeigeTitel } from './formular-titel';

describe('formularAnzeigeTitel', () => {
  it('zeigt Unterstriche aus dem Dateititel als Leerzeichen', () => {
    expect(formularAnzeigeTitel('Bewerbungsbogen_Militärisch')).toBe('Bewerbungsbogen Militärisch');
  });

  it('fasst mehrere Trenner zusammen und schneidet Ränder ab', () => {
    expect(formularAnzeigeTitel('_Erklärung__zur_ Person_')).toBe('Erklärung zur Person');
  });

  it('lässt einen normalen Titel unverändert', () => {
    expect(formularAnzeigeTitel('Personalbogen')).toBe('Personalbogen');
  });
});
