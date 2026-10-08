// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AngabenSicht } from '../api/types';
import { MeineAngaben } from './meine-angaben';

const dienst = vi.hoisted(() => ({
  sicht: { angaben: {}, staatsangehoerigkeitEingewilligtAm: null } as AngabenSicht
}));

vi.mock('@/features/auth/components/auth-provider', () => ({
  useAuthUser: () => ({ uid: 'u1', email: 'anmeldung@example.com' })
}));

vi.mock('../api/service', () => ({
  ladeAngaben: vi.fn(async () => dienst.sicht),
  ladeKonto: vi.fn(),
  ladeUnterlagen: vi.fn(),
  speichereAngaben: vi.fn(async () => {
    dienst.sicht = { ...dienst.sicht, angaben: { ...dienst.sicht.angaben, vorname: 'Max' } };
  }),
  widerrufeStaatsangehoerigkeit: vi.fn(),
  loescheAngaben: vi.fn()
}));

beforeEach(() => {
  dienst.sicht = { angaben: {}, staatsangehoerigkeitEingewilligtAm: null };
});
afterEach(cleanup);

function zeige() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MeineAngaben />
    </QueryClientProvider>
  );
  return screen.findByRole('button', { name: SPEICHERN });
}

// jsdom kennt kein CSS: der unsichtbare Lade-Spinner ("Lädt") zählt hier zum Namen.
const SPEICHERN = /^Speichern/;
const VORSCHLAG_HINWEIS = /Vorbelegt mit deiner Anmelde-Adresse/;

describe('MeineAngaben - Fokus nach dem Speichern', () => {
  it('lässt den Fokus nach „Speichern" auf dem Speichern-Knopf statt auf <body>', async () => {
    const user = userEvent.setup();
    await zeige();
    await user.type(screen.getByLabelText('Vorname'), 'Max');
    await user.click(screen.getByRole('button', { name: SPEICHERN }));

    // Nach dem Speichern montiert das Formular mit dem frischen Stand neu.
    await waitFor(() => expect(screen.getByLabelText('Vorname')).toHaveProperty('value', 'Max'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: SPEICHERN })));
  });
});

describe('MeineAngaben - Hinweis zur vorbelegten E-Mail', () => {
  it('zeigt den Hinweis, solange keine E-Mail gespeichert ist und der Vorschlag im Feld steht', async () => {
    await zeige();
    expect(screen.getByLabelText('E-Mail-Adresse')).toHaveProperty('value', 'anmeldung@example.com');
    expect(screen.queryByText(VORSCHLAG_HINWEIS)).not.toBeNull();
  });

  it('blendet den Hinweis aus, sobald eine andere Adresse im Feld steht', async () => {
    const user = userEvent.setup();
    await zeige();
    const feld = screen.getByLabelText('E-Mail-Adresse');
    await user.clear(feld);
    await user.type(feld, 'eigene@example.com');
    expect(screen.queryByText(VORSCHLAG_HINWEIS)).toBeNull();
  });

  it('zeigt den Hinweis nicht, wenn eine E-Mail gespeichert ist', async () => {
    dienst.sicht = { angaben: { email: 'anmeldung@example.com' }, staatsangehoerigkeitEingewilligtAm: null };
    await zeige();
    expect(screen.queryByText(VORSCHLAG_HINWEIS)).toBeNull();
  });
});

describe('MeineAngaben - Geburtsdatum', () => {
  it('benennt das Datumsfeld als Gruppe „Geburtsdatum" und nennt das Format', async () => {
    await zeige();
    expect(screen.getByRole('group', { name: 'Geburtsdatum' })).not.toBeNull();
    const feld = screen.getByLabelText('Geburtsdatum', { selector: 'input' });
    const beschreibung = (feld.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(beschreibung).toContain('TT.MM.JJJJ');
  });
});
