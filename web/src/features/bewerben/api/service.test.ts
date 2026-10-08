import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/client', () => ({
  clientAuth: () => ({ currentUser: { getIdToken: async () => 'token' } })
}));

const { baueBewerbungspaket, PAKET_NICHT_ERSTELLT } = await import('./service');

const ANFRAGE = { pinstGuid: 'job1', formulare: [], unterlagen: [], anschreiben: 'Text' };

describe('baueBewerbungspaket', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uebersetzt einen TypeError aus fetch in einen deutschen Satz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(baueBewerbungspaket(ANFRAGE)).rejects.toThrow(PAKET_NICHT_ERSTELLT);
  });

  it('reicht den Satz des Servers bei einem 400 unveraendert durch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ fehler: 'Diese Stelle ist nicht mehr ausgeschrieben.' }), { status: 400 })
      )
    );
    await expect(baueBewerbungspaket(ANFRAGE)).rejects.toMatchObject({
      message: 'Diese Stelle ist nicht mehr ausgeschrieben.',
      status: 400
    });
  });
});
