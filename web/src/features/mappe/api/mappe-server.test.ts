import { beforeEach, describe, expect, it, vi } from 'vitest';

// 'server-only' wirft absichtlich, sobald es außerhalb der RSC-Bundling-Bedingung
// von Next importiert wird (genau das soll es tun) - unter vitest/Node träfe das
// auch diesen Test, deshalb hier auf ein No-op gemockt, wie es die Next-eigene
// react-server-Bedingung beim echten Build tut.
vi.mock('server-only', () => ({}));

const getMock = vi.fn();

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ get: getMock })
    })
  }
}));

const { ladeMappeFuerSeite } = await import('./mappe-server');

/** Format von `neueMappenId` (functions/src/mappe/mappeId.ts). */
const ID = 'm0123456789abcdefghijklmno';

describe('ladeMappeFuerSeite', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('liefert null, wenn die Kennung unbekannt ist', async () => {
    getMock.mockResolvedValue({ exists: false });

    const mappe = await ladeMappeFuerSeite(ID);

    expect(mappe).toBeNull();
  });

  // WOZU: die Kennung kommt aus der URL. Was `neueMappenId` nie erzeugt haben
  // kann, ist keine Mappe - und soll auch keinen Firestore-Lesevorgang kosten.
  it.each(['m1', 'unbekannt', 'M0123456789ABCDEFGHIJKLMNO', 'm0123456789abcdefghijklmn/x', ''])(
    'liefert null ohne Firestore-Zugriff fuer die fremde Kennung %j',
    async (kennung) => {
      expect(await ladeMappeFuerSeite(kennung)).toBeNull();
      expect(getMock).not.toHaveBeenCalled();
    }
  );

  it('liefert Titel, refCode und Dokumente einer bestehenden Mappe', async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({
        titel: 'IT-Fachkraft (m/w/d)',
        refCode: 'ABC-123',
        dokumente: [{ docId: 'd1', art: 'zeugnis', dateiname: 'zeugnis.pdf', sizeBytes: 1234 }],
        zipGebautAm: null,
        letzteAktivitaetAm: Date.now()
      })
    });

    const mappe = await ladeMappeFuerSeite(ID);

    expect(mappe).toEqual({
      titel: 'IT-Fachkraft (m/w/d)',
      refCode: 'ABC-123',
      dokumente: [{ docId: 'd1', art: 'zeugnis', dateiname: 'zeugnis.pdf', sizeBytes: 1234 }],
      abgelaufen: false
    });
  });

  it('setzt dokumente auf ein leeres Array, wenn keins gespeichert ist', async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ titel: 't', refCode: 'r', zipGebautAm: null, letzteAktivitaetAm: Date.now() })
    });

    const mappe = await ladeMappeFuerSeite(ID);

    expect(mappe?.dokumente).toEqual([]);
  });

  it('gilt als abgelaufen, mehr als eine Stunde nach dem Paketbau', async () => {
    const jetzt = Date.now();
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({
        titel: 't',
        refCode: 'r',
        zipGebautAm: jetzt - 61 * 60 * 1000,
        letzteAktivitaetAm: jetzt - 61 * 60 * 1000
      })
    });

    const mappe = await ladeMappeFuerSeite(ID);

    expect(mappe?.abgelaufen).toBe(true);
  });

  it('gilt nicht als abgelaufen ohne Paketbau, solange die letzte Aktivität unter einer Stunde zurückliegt', async () => {
    const jetzt = Date.now();
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({
        titel: 't',
        refCode: 'r',
        zipGebautAm: null,
        letzteAktivitaetAm: jetzt - 30 * 60 * 1000
      })
    });

    const mappe = await ladeMappeFuerSeite(ID);

    expect(mappe?.abgelaufen).toBe(false);
  });

  it('greift auf letzteAktivitaetAm zurück, wenn noch kein Paket gebaut wurde, auch wenn diese lange zurückliegt', async () => {
    const jetzt = Date.now();
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({
        titel: 't',
        refCode: 'r',
        zipGebautAm: null,
        letzteAktivitaetAm: jetzt - 90 * 60 * 1000
      })
    });

    const mappe = await ladeMappeFuerSeite(ID);

    expect(mappe?.abgelaufen).toBe(true);
  });
});
