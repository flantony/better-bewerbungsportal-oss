// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeineUnterlagen } from './meine-unterlagen';

vi.mock('@/features/auth/components/auth-provider', () => ({
  useAuthUser: () => ({ uid: 'u1', email: 'anmeldung@example.com' })
}));

vi.mock('../api/service', () => ({
  ladeUnterlagen: vi.fn(async () => []),
  holeUnterlageDownloadUrl: vi.fn(),
  holeUnterlageUploadUrl: vi.fn(),
  loescheUnterlage: vi.fn(),
  registriereUnterlage: vi.fn()
}));

afterEach(cleanup);

function zeige() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MeineUnterlagen />
    </QueryClientProvider>
  );
  return screen.findByText('Datei hinzufügen');
}

/**
 * Wir nehmen keine Ausweiskopien entgegen. Es gibt kein Upload-Feld und keine
 * Einwilligung dafür - stattdessen den Hinweis, sie selbst beizulegen.
 */
describe('MeineUnterlagen - keine Ausweiskopie', () => {
  it('bietet kein Upload-Feld und keine Einwilligung für eine Ausweiskopie an', async () => {
    await zeige();
    expect(screen.queryByLabelText(/Ausweiskopie hochladen/)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getAllByLabelText(/Lebenslauf|Zeugnis|Sonstiges/)).toHaveLength(3);
  });

  it('sagt, dass wir keine Ausweiskopien entgegennehmen und der Bewerber sie selbst beilegt', async () => {
    await zeige();
    expect(screen.getByText(/Ausweiskopien nehmen wir nicht entgegen/).textContent).toMatch(/selbst bei/);
  });
});
