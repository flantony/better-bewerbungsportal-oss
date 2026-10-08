// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Job } from '../api/types';
import { JobsResultRow } from './jobs-result-row';

const DAY_MS = 24 * 60 * 60 * 1000;

function job(overrides: Partial<Job> = {}): Job {
  return {
    pinstGuid: 'guid-1',
    title: 'Ausbildung zur Fachinformatikerin / zum Fachinformatiker für Systemintegration (m/w/d)',
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

afterEach(cleanup);

// Nicht jede Frist rot, Titel nicht abgeschnitten, keine unverstaendlichen Etiketten wie "Hot".
describe('JobsResultRow', () => {
  it('zeigt den vollen Titel als Überschrift, ohne ihn abzuschneiden', () => {
    render(<JobsResultRow job={job()} />);
    const titel = screen.getByRole('heading', { level: 3 });
    expect(titel.textContent).toBe(job().title);
    expect(titel.className).not.toContain('truncate');
  });

  it('färbt eine ferne Frist neutral und eine nahe rot, mit der Dringlichkeit im Text', () => {
    const { unmount } = render(<JobsResultRow job={job()} />);
    expect(screen.getByText('bis 01.12.2026').className).not.toContain('bg-destructive');
    unmount();

    render(<JobsResultRow job={job({ applicationEnd: '10.10.2026', applicationEndSortKey: Date.now() + 3 * DAY_MS })} />);
    const nah = screen.getByText(/^bis 10\.10\.2026 · noch \d Tage$/);
    expect(nah.className).toContain('bg-destructive');
  });

  it('beschriftet hervorgehobene Stellen in Klartext statt "Hot"', () => {
    render(<JobsResultRow job={job({ hotJob: true })} />);
    expect(screen.queryByText('Hot')).toBeNull();
    expect(screen.getByText('Besonders gesucht')).not.toBeNull();
  });

  it('zeigt keinen leeren Vertragsart-Chip', () => {
    const { container } = render(<JobsResultRow job={job({ contractTypeLabel: '' })} />);
    const leer = [...container.querySelectorAll('[data-slot="badge"]')].filter((b) => !b.textContent?.trim());
    expect(leer).toHaveLength(0);
  });
});
