// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '../api/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function job(overrides: Partial<Job>): Job {
  return {
    pinstGuid: 'guid',
    title: 'Elektronikerin (m/w/d)',
    besOrt: 'Berlin',
    contractType: '',
    contractTypeLabel: 'unbefristet',
    applicationEnd: '01.12.2026',
    applicationEndSortKey: Date.now() + 60 * DAY_MS,
    hotJob: false,
    reqIndustry: 2,
    reqType: 'K29',
    arbeitszeit: '100.00',
    besoldung: null,
    latitude: '',
    longitude: '',
    ...overrides
  };
}

const JOBS: Job[] = [
  job({ pinstGuid: 'a', title: 'Elektronikerin (m/w/d)' }),
  job({ pinstGuid: 'b', title: 'Köchin (m/w/d)', contractTypeLabel: '' }),
  job({ pinstGuid: 'abgelaufen', title: 'Alte Stelle', applicationEndSortKey: Date.now() - 5 * DAY_MS })
];

vi.mock('../api/service', () => ({
  getAllActiveJobs: () => Promise.resolve(JOBS),
  getUpcomingDeadlineJobs: () => Promise.resolve([])
}));

const { JobsBrowser } = await import('./jobs-table');

afterEach(cleanup);

function renderBrowser(searchParams = '', onUrlUpdate?: OnUrlUpdateFunction) {
  return render(
    <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate}>
      <QueryClientProvider client={new QueryClient()}>
        <JobsBrowser />
      </QueryClientProvider>
    </NuqsTestingAdapter>
  );
}

describe('JobsBrowser', () => {
  it('zeigt die Suche außerhalb des Filter-Panels und blendet abgelaufene Fristen von Anfang an aus', async () => {
    renderBrowser();
    expect(await screen.findByRole('searchbox', { name: 'Stellen suchen (Titel oder Ort)' })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('2 Stellen');
    expect(screen.queryByText('Alte Stelle')).toBeNull();
  });

  it('übernimmt den Suchbegriff aus der URL und schreibt Änderungen zurück', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    renderBrowser('?suche=köchin', onUrlUpdate);
    const suche = (await screen.findByRole('searchbox')) as HTMLInputElement;
    expect(suche.value).toBe('köchin');
    expect(screen.getByRole('status').textContent).toBe('1 Stelle');

    await userEvent.clear(suche);
    await userEvent.type(suche, 'elek');
    await vi.waitFor(() => expect(onUrlUpdate.mock.lastCall?.[0].searchParams.get('suche')).toBe('elek'));
  });

  it('benennt die Sortierung und zeigt den Wert deutsch statt als Schlüssel', async () => {
    renderBrowser();
    const sortierung = await screen.findByRole('combobox', { name: /Sortieren nach/ });
    expect(sortierung.textContent).toContain('Zuletzt aktualisiert');
    expect(sortierung.textContent).not.toContain('relevanz');
  });

  it('listet die Treffer als Liste mit Überschriften', async () => {
    renderBrowser();
    const ergebnisse = await screen.findByRole('region', { name: 'Suchergebnisse' });
    expect(within(ergebnisse).getAllByRole('listitem')).toHaveLength(2);
  });

  it('beschriftet jede Filter-Checkbox, leere Vertragsart läuft unter "Ohne Angabe"', async () => {
    renderBrowser();
    const vertragsart = await screen.findByRole('group', { name: 'Vertragsart' });
    const namen = within(vertragsart)
      .getAllByRole('checkbox')
      .map((box) => box.getAttribute('aria-labelledby'))
      .map((id) => document.getElementById(id ?? '')?.textContent ?? '');
    expect(namen).toEqual(['Unbefristet1 Stelle', 'Ohne Angabe1 Stelle']);
  });

  it('erklärt die Besoldungskürzel in Klartext', async () => {
    renderBrowser();
    await screen.findByRole('status');
    expect(screen.getByText(/A = Besoldung für Beamtinnen, Beamte, Soldatinnen und Soldaten/)).not.toBeNull();
  });
});
