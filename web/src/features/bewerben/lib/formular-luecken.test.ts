import { describe, expect, it } from 'vitest';
import type { FormularPlan } from '../api/types';
import { formularLueckenStand } from './formular-luecken';

function formular(docId: string, fehlendeAngaben: string[]): FormularPlan {
  return { docId, titel: docId, ausfuellbar: true, fehlendeAngaben, optionaleAngaben: [] };
}

describe('formularLueckenStand', () => {
  it('ist ohne Luecken bau-bereit, auch ohne Haken', () => {
    expect(formularLueckenStand([formular('a', [])], ['a'], false)).toEqual({
      mitLuecken: false,
      kernLuecken: false,
      bauBereit: true
    });
  });

  it('verlangt bei Nicht-Kernluecken den Haken', () => {
    const formulare = [formular('a', ['Postleitzahl', 'Telefon'])];
    expect(formularLueckenStand(formulare, ['a'], false)).toMatchObject({ mitLuecken: true, kernLuecken: false, bauBereit: false });
    expect(formularLueckenStand(formulare, ['a'], true)).toMatchObject({ bauBereit: true });
  });

  it.each(['Nachname', 'Vorname', 'Geburtsdatum'])('sperrt bei fehlendem %s trotz Haken', (kern) => {
    const stand = formularLueckenStand([formular('a', ['Postleitzahl', kern])], ['a'], true);
    expect(stand).toEqual({ mitLuecken: true, kernLuecken: true, bauBereit: false });
  });

  it('beachtet nur gewaehlte Formulare', () => {
    const formulare = [formular('a', []), formular('b', ['Geburtsdatum'])];
    expect(formularLueckenStand(formulare, ['a'], false)).toEqual({ mitLuecken: false, kernLuecken: false, bauBereit: true });
  });
});
