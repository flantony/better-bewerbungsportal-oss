// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BewerbenSeite } from './bewerben-seite';

const konto = vi.hoisted(() => ({ bewerberdatenAktiv: false }));
const ladeBewerbungsplan = vi.hoisted(() => vi.fn(async () => 'nicht-verfuegbar' as const));

vi.mock('@/features/auth/components/auth-provider', () => ({ useAuthUser: () => ({ uid: 'u1' }) }));
vi.mock('@/features/konto/api/service', () => ({
  ladeKonto: vi.fn(async () => ({ merkliste: [], bewerberdatenAktiv: konto.bewerberdatenAktiv })),
  ladeAngaben: vi.fn(),
  ladeUnterlagen: vi.fn()
}));
vi.mock('../api/service', () => ({ ladeBewerbungsplan }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));

const GUID = '0123456789ABCDEF0123456789ABCDEF';

function zeige() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BewerbenSeite pinstGuid={GUID} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  konto.bewerberdatenAktiv = false;
  ladeBewerbungsplan.mockClear();
});
afterEach(cleanup);

/**
 * Funktionsschalter BEWERBERDATEN_IM_KONTO aus: ein Link aus
 * Mail oder Lesezeichen landet auf einem Satz mit Weg weiter - nicht im
 * Assistenten, und ohne den (abgelehnten) Plan ueberhaupt anzufragen.
 */
describe('BewerbenSeite', () => {
  it('zeigt bei abgeschalteten Bewerberdaten einen Satz und die Wege zur Stelle und zur KI', async () => {
    zeige();
    expect(await screen.findByText(/bieten wir derzeit nicht an/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Zur Stelle und Checkliste/ }).getAttribute('href')).toBe(
      `/dashboard/jobs/${GUID}#einreichen`
    );
    expect(screen.getByRole('link', { name: /Mit deiner KI bewerben/ }).getAttribute('href')).toBe('/ki');
    expect(ladeBewerbungsplan).not.toHaveBeenCalled();
  });

  it('startet die geführte Bewerbung, wenn der Server Bewerberdaten im Konto meldet', async () => {
    konto.bewerberdatenAktiv = true;
    zeige();
    expect(await screen.findByText(/In fünf Schritten/)).toBeTruthy();
    expect(ladeBewerbungsplan).toHaveBeenCalled();
  });
});
