import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { kontoKeys } from '../api/queries';
import { angabenFormularWerte, nachAngabenLoeschen } from './angaben-geloescht';

/**
 * Nach „Endgültig löschen" sind die Angaben auf dem Server weg - das Formular
 * darf dann nicht weiter alle alten Werte und keine Bestaetigung zeigen.
 * Falle: `form.reset(leer)` setzt TanStack Form beim naechsten Rendern wieder
 * auf die (alten) `defaultValues` zurueck - `FormApi.update` uebernimmt neue
 * Vorgaben, solange das Formular unberuehrt ist, und nach `reset` ist es
 * unberuehrt. Leer waere es erst, wenn der Refetch durch ist und das Formular
 * neu montiert; bis dahin stuende der alte Stand da.
 */
describe('nachAngabenLoeschen', () => {
  const VOLL = { angaben: { vorname: 'Erika', ort: 'Köln' }, staatsangehoerigkeitEingewilligtAm: '2026-01-01T00:00:00Z' };

  it('setzt die Angaben im Cache sofort auf leer - ohne auf einen Refetch zu warten', async () => {
    const client = new QueryClient();
    client.setQueryData(kontoKeys.angaben('u1'), VOLL, { updatedAt: 1 });

    await nachAngabenLoeschen(client, 'u1');

    expect(client.getQueryData(kontoKeys.angaben('u1'))).toEqual({
      angaben: {},
      staatsangehoerigkeitEingewilligtAm: null
    });
    // dataUpdatedAt steckt im Key des Formulars - er muss sich aendern, damit es neu montiert.
    expect(client.getQueryState(kontoKeys.angaben('u1'))?.dataUpdatedAt).toBeGreaterThan(1);
    expect(client.getQueryState(kontoKeys.angaben('u1'))?.isInvalidated).toBe(false);
  });

  it('markiert den Rest des Kontos (z.B. den Bewerbungsplan) als veraltet', async () => {
    const client = new QueryClient();
    client.setQueryData(kontoKeys.angaben('u1'), VOLL);
    client.setQueryData(kontoKeys.bewerbungsplan('u1', 'job1'), { angabenVorhanden: true });

    await nachAngabenLoeschen(client, 'u1');

    expect(client.getQueryState(kontoKeys.bewerbungsplan('u1', 'job1'))?.isInvalidated).toBe(true);
  });
});

describe('angabenFormularWerte', () => {
  it('ist nach dem Loeschen leer, die E-Mail wieder mit der Anmelde-Adresse vorgeschlagen', () => {
    const werte = angabenFormularWerte({ angaben: {}, staatsangehoerigkeitEingewilligtAm: null }, 'max@example.com');
    expect(werte.email).toBe('max@example.com');
    expect(Object.entries(werte).filter(([feld, wert]) => feld !== 'email' && wert !== '')).toEqual([]);
  });

  it('nimmt gespeicherte Werte vor dem Vorschlag', () => {
    const werte = angabenFormularWerte(
      { angaben: { vorname: 'Erika', email: 'eigene@example.com' }, staatsangehoerigkeitEingewilligtAm: null },
      'max@example.com'
    );
    expect(werte).toMatchObject({ vorname: 'Erika', email: 'eigene@example.com', ort: '' });
  });
});
