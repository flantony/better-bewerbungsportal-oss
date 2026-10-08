import { describe, expect, it } from 'vitest';
import type { Suchprofil } from '../api/types';
import { zusammenfuehren } from './zusammenfuehren';

// WOZU: Das Formular zeigt seiteneinstieg/mindestbesoldung/besoldungstabelle
// nicht an - ein Speichern ueber das Formular darf diese Felder trotzdem
// nicht loeschen.
describe('zusammenfuehren', () => {
  it('behaelt ein Feld, das das Formular nicht zeigt, bei geaendertem Formularfeld', () => {
    const alt: Suchprofil = { mindestbesoldung: 9, wunschort: 'Berlin' };
    const formular = { wunschort: 'München' } as Suchprofil;
    expect(zusammenfuehren(alt, formular)).toEqual({ mindestbesoldung: 9, wunschort: 'München' });
  });

  it('behandelt ein noch nicht vorhandenes Suchprofil wie ein leeres', () => {
    expect(zusammenfuehren(null, { wunschort: 'Köln' } as Suchprofil)).toEqual({ wunschort: 'Köln' });
  });

  it('entfernt ein Feld, das das Formular explizit auf leer setzt', () => {
    const alt: Suchprofil = { bundesland: ['Bayern'] };
    expect(zusammenfuehren(alt, { bundesland: [] } as Suchprofil)).toEqual({});
  });
});
