// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KontoSicht, SuchprofilEintrag } from '../api/types';
import { SuchprofileBereich } from './suchprofile-bereich';

vi.mock('@/features/auth/components/auth-provider', () => ({
  useAuthUser: () => ({ uid: 'u1', email: 'anmeldung@example.com' })
}));

const service = vi.hoisted(() => ({
  ladeSuchfilterTreffer: vi.fn(),
  aendereSuchfilter: vi.fn(),
  fuegeSuchfilterHinzu: vi.fn(),
  loescheSuchfilter: vi.fn()
}));
vi.mock('../api/service', () => service);

afterEach(cleanup);
beforeEach(() => {
  for (const fn of Object.values(service)) fn.mockReset();
  service.ladeSuchfilterTreffer.mockResolvedValue({ anzahl: 42, mindestens: false });
});

const OPTIONEN = {
  organisationsbereich: ['Heer'],
  laufbahngruppe: ['Mannschaften'],
  bundesland: ['Bayern'],
  vertragsarten: ['Reservedienst'],
  einstiegswege: ['seiteneinstieg'],
  laufbahngruppeBedeutung: { Mannschaften: 'Bedeutungstext vom Server' },
  einstiegswegBedeutung: {}
};

function eintrag(id: string, teile: Partial<SuchprofilEintrag> = {}): SuchprofilEintrag {
  return { id, filter: { suchbegriff: id }, aktiv: true, quelle: 'hand', erstelltAm: '2026-10-08T00:00:00.000Z', ...teile };
}

function zeige(suchprofile: SuchprofilEintrag[]) {
  const sicht: KontoSicht = { suchprofile, merkliste: [], optionen: OPTIONEN, benachrichtigung: null, bewerberdatenAktiv: false };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['konto', 'u1'], sicht);
  render(
    <QueryClientProvider client={client}>
      <SuchprofileBereich sicht={sicht} />
    </QueryClientProvider>
  );
  return client;
}

// WOZU: ein Konto haelt mehrere Filter - jede
// Karte muss ohne Bundeswehr-Vorwissen sagen, wonach sie sucht, woher sie
// kommt und ob sie gerade zaehlt.
describe('SuchprofileBereich', () => {
  it('zeigt je Filter eine Karte mit Ueberschrift, Herkunft, Pausenstatus und Trefferzahl', async () => {
    zeige([
      eintrag('a', { name: 'IT im Westen', filter: { suchbegriff: 'IT', wunschort: 'Köln' }, quelle: 'ki' }),
      eintrag('b', { filter: { laufbahngruppe: ['Mannschaften'] }, aktiv: false })
    ]);

    expect(screen.getByRole('heading', { level: 2, name: 'Suchprofil' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /IT im Westen/ })).toBeTruthy();
    expect(screen.getByText('„IT“ · in Köln')).toBeTruthy();
    expect(screen.getByText('von deiner KI')).toBeTruthy();
    expect(screen.getByText('pausiert')).toBeTruthy();
    // Die Bedeutung der Laufbahngruppe kommt vom Server, nicht aus dem Web.
    expect(screen.getByText('Bedeutungstext vom Server')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('42 passende Stellen sind gerade offen.')).toHaveLength(2));
    // Regex: jsdom kennt kein Tailwind-'invisible' und liest den Lade-Spinner mit.
    expect(screen.getByRole('button', { name: /Fortsetzen/ })).toBeTruthy();
  });

  it('nennt die Obergrenze erst, wenn jemand einen elften Filter anlegen will', async () => {
    const zehn = Array.from({ length: 10 }, (_, i) => eintrag(`e${i}`));
    zeige(zehn);
    expect(screen.queryByText(/höchstens 10 Filter/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Filter hinzufügen' }));

    expect(screen.getByText(/Du kannst höchstens 10 Filter speichern/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Neuer Filter' })).toBeNull();
  });

  it('oeffnet das leere Formular ueber „Filter hinzufügen“ und setzt den Fokus hinein', async () => {
    zeige([]);
    expect(screen.getByText('Du hast noch keinen Filter gespeichert.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Filter hinzufügen' }));

    expect(screen.getByRole('heading', { level: 3, name: 'Neuer Filter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Filter hinzufügen' }).getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText(/Name des Filters/));
  });

  it('pausiert einen Filter und meldet das in der Statuszeile', async () => {
    const client = zeige([eintrag('a')]);
    service.aendereSuchfilter.mockResolvedValue({
      ergebnis: 'geaendert',
      suchprofile: [eintrag('a', { aktiv: false })]
    });

    await userEvent.click(screen.getByRole('button', { name: /Pausieren/ }));

    expect(service.aendereSuchfilter).toHaveBeenCalledWith('a', { aktiv: false });
    expect(await screen.findByText('Filter pausiert.')).toBeTruthy();
    expect(client.getQueryData<KontoSicht>(['konto', 'u1'])?.suchprofile[0].aktiv).toBe(false);
  });

  it('loescht nach Rueckfrage und setzt den Fokus auf die Statuszeile', async () => {
    zeige([eintrag('a'), eintrag('b')]);
    service.loescheSuchfilter.mockResolvedValue({ ergebnis: 'geloescht', suchprofile: [eintrag('b')] });

    await userEvent.click(screen.getAllByRole('button', { name: 'Löschen' })[0]);
    await userEvent.click(await screen.findByRole('button', { name: 'Endgültig löschen' }));

    expect(service.loescheSuchfilter).toHaveBeenCalledWith('a');
    const status = await screen.findByText('Filter gelöscht.');
    await waitFor(() => expect(document.activeElement).toBe(status.closest('p')));
  });
});
