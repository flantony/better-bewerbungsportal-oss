// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kiChatText } from '@/features/ki-anbindung/lib/connection';
import { BewerbungsWege } from './bewerbungs-wege';

const auth = vi.hoisted(() => ({ user: null as null | undefined | { uid: string } }));
const konto = vi.hoisted(() => ({ bewerberdatenAktiv: false }));

vi.mock('@/features/auth/components/auth-provider', () => ({ useAuthUser: () => auth.user }));
vi.mock('../api/service', () => ({ ladeBewerbungsplan: vi.fn(async () => ({ stelle: {} })) }));
vi.mock('@/features/konto/api/service', () => ({
  ladeKonto: vi.fn(async () => ({ merkliste: [], bewerberdatenAktiv: konto.bewerberdatenAktiv })),
  aendereMerkliste: vi.fn()
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));

const GUID = '0123456789ABCDEF0123456789ABCDEF';

function zeige() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BewerbungsWege pinstGuid={GUID} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  auth.user = null;
  konto.bewerberdatenAktiv = false;
});
afterEach(cleanup);

describe('BewerbungsWege', () => {
  it('bietet abgemeldet zuerst den KI-Weg ohne Konto an, dann den Weg ohne KI', () => {
    zeige();
    const ueberschriften = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(ueberschriften).toEqual(['Mit deiner KI vorbereiten', 'Selbst vorbereiten']);
    expect(screen.getByRole('button', { name: 'Text kopieren' })).toBeTruthy();
    expect(screen.getByText(kiChatText(GUID))).toBeTruthy();
  });

  it('kopiert den fertigen Chat-Text und sagt es an', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    zeige();
    await user.click(screen.getByRole('button', { name: 'Text kopieren' }));
    expect(writeText).toHaveBeenCalledWith(kiChatText(GUID));
    expect(screen.getByRole('status').textContent).toBe('Text kopiert. Füge ihn jetzt in deinen Chat ein.');
  });

  it('meldet, wenn das Kopieren scheitert', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('verboten'));
    zeige();
    await user.click(screen.getByRole('button', { name: 'Text kopieren' }));
    expect(screen.getByRole('status').textContent).toContain('von Hand');
  });

  // Funktionsschalter BEWERBERDATEN_IM_KONTO: ohne Anmeldung kennen
  // wir den Stand nicht - also nie ein Weg in die gefuehrte Bewerbung, sondern
  // die Liste auf derselben Seite. Die Anmeldung fuehrt zur Stelle zurueck.
  it('fuehrt Abgemeldete zur Liste auf der Seite, nie in die gefuehrte Bewerbung', () => {
    zeige();
    expect(screen.getByRole('link', { name: 'Zur Liste, was du einreichen musst' }).getAttribute('href')).toBe(
      '#einreichen'
    );
    expect(screen.getByRole('link', { name: 'Anmelden' }).getAttribute('href')).toBe(
      `/anmelden?weiter=${encodeURIComponent(`/dashboard/jobs/${GUID}`)}`
    );
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toContain('/dashboard/bewerben/');
    }
    expect(screen.queryByRole('button', { name: /merken/i })).toBeNull();
  });

  it('zeigt weder Anmelde-Satz noch Merken-Knopf, solange der Anmeldezustand unbekannt ist', () => {
    auth.user = undefined;
    zeige();
    expect(screen.queryByRole('link', { name: 'Anmelden' })).toBeNull();
    expect(screen.queryByRole('button', { name: /merken/i })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Selbst vorbereiten' })).toBeTruthy();
  });

  it('zeigt Angemeldeten bei abgeschalteten Bewerberdaten den Weg ohne KI und den Merken-Knopf', async () => {
    auth.user = { uid: 'u1' };
    zeige();
    expect(await screen.findByRole('button', { name: /merken/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Selbst vorbereiten' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Bewerbung vorbereiten' })).toBeNull();
    expect(screen.queryByText(/Meine Angaben/)).toBeNull();
  });

  it('fuehrt Angemeldete direkt zur Bewerbung, wenn der Server Bewerberdaten im Konto meldet', async () => {
    auth.user = { uid: 'u1' };
    konto.bewerberdatenAktiv = true;
    zeige();
    const link = await screen.findByRole('link', { name: 'Bewerbung vorbereiten' });
    expect(link.getAttribute('href')).toBe(`/dashboard/bewerben/${GUID}`);
    expect(screen.getByRole('heading', { level: 3, name: 'Mit Konto vorbereiten' })).toBeTruthy();
  });
});
