// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn()
}));
vi.mock('@/lib/firebase/client', () => ({ clientAuth: () => ({}) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { SignUpForm } = await import('./sign-up-form');

beforeAll(() => {
  // jsdom kennt kein Scrollen; scrollToFirstError ruft es vor dem Fokussieren auf.
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

describe('SignUpForm', () => {
  it('kennzeichnet Pflichtfelder und nennt die Passwortregel schon vor dem Absenden', () => {
    render(<SignUpForm />);
    const email = screen.getByLabelText(/E-Mail/);
    expect(email.getAttribute('aria-required')).toBe('true');
    expect(screen.getByLabelText(/E-Mail/).closest('div[data-slot="field"]')?.textContent).toContain('(Pflichtfeld)');

    const passwort = document.getElementById('password') as HTMLInputElement;
    const beschreibung = document.getElementById(passwort.getAttribute('aria-describedby') ?? '');
    expect(beschreibung?.textContent).toBe('Mindestens 8 Zeichen.');
  });

  it('setzt nach leerem Absenden den Fokus ins erste fehlerhafte Feld und sagt, was fehlt', async () => {
    render(<SignUpForm />);
    await userEvent.click(screen.getByRole('button', { name: /^Konto erstellen/ }));

    const email = screen.getByLabelText(/E-Mail/);
    await waitFor(() => expect(document.activeElement?.id).toBe(email.id));
    expect(screen.getByText('Bitte gib deine E-Mail-Adresse ein.')).not.toBeNull();
    expect(screen.queryByText(/Ungültige E-Mail-Adresse/)).toBeNull();
    expect(email.getAttribute('aria-describedby')).toMatch(/form-item-message/);
  });
});
