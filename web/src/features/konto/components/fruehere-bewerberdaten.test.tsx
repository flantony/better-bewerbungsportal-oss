// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ladeAngaben, ladeUnterlagen } from '../api/service';
import { FruehereBewerberdaten } from './fruehere-bewerberdaten';

const dienst = vi.hoisted(() => ({
  angaben: { angaben: {} as Record<string, string>, staatsangehoerigkeitEingewilligtAm: null as string | null },
  unterlagen: [] as unknown[]
}));

vi.mock('@/features/auth/components/auth-provider', () => ({ useAuthUser: () => ({ uid: 'u1' }) }));
vi.mock('../api/service', () => ({
  ladeAngaben: vi.fn(async () => dienst.angaben),
  ladeUnterlagen: vi.fn(async () => dienst.unterlagen),
  loescheAngaben: vi.fn(),
  widerrufeStaatsangehoerigkeit: vi.fn(),
  holeUnterlageDownloadUrl: vi.fn(),
  holeUnterlageUploadUrl: vi.fn(),
  loescheUnterlage: vi.fn(),
  registriereUnterlage: vi.fn()
}));

function zeige() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FruehereBewerberdaten />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  dienst.angaben = { angaben: {}, staatsangehoerigkeitEingewilligtAm: null };
  dienst.unterlagen = [];
});
afterEach(cleanup);

/**
 * Funktionsschalter BEWERBERDATEN_IM_KONTO aus: nichts Neues
 * speichern, aber Altbestand sehen, herunterladen, widerrufen und löschen.
 */
describe('FruehereBewerberdaten', () => {
  it('zeigt ohne Altbestand nichts - auch nachdem beide Abfragen geantwortet haben', async () => {
    const { container } = zeige();
    await waitFor(() => {
      expect(vi.mocked(ladeAngaben)).toHaveBeenCalled();
      expect(vi.mocked(ladeUnterlagen)).toHaveBeenCalled();
    });
    // Ein Takt mehr, damit React Query die Antworten auch übernommen hat.
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(container.textContent).toBe('');
  });

  it('zeigt Altbestand mit Widerruf, Löschen und Download - aber kein Eingabe- oder Upload-Feld', async () => {
    dienst.angaben = {
      angaben: { vorname: 'Max', staatsangehoerigkeit: 'deutsch' },
      staatsangehoerigkeitEingewilligtAm: '2026-09-30T00:00:00.000Z'
    };
    dienst.unterlagen = [
      {
        docId: 'd1',
        art: 'zeugnis',
        dateiname: 'zeugnis.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
        hochgeladenAm: '2026-09-30T00:00:00.000Z'
      }
    ];
    zeige();
    expect(await screen.findByText('Früher gespeicherte Angaben und Unterlagen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Einwilligung widerrufen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Angaben löschen/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'zeugnis.pdf herunterladen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'zeugnis.pdf löschen' })).toBeTruthy();
    // Nur die Anzahl - die Werte selbst zeigt der Bereich nicht.
    expect(screen.queryByText(/deutsch|Max/)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
