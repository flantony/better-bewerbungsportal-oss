import { afterEach, describe, expect, it, vi } from 'vitest';

const getIdToken = vi.fn(async (erzwingen?: boolean) => (erzwingen ? 'frisch' : 'alt'));

vi.mock('@/lib/firebase/client', () => ({
  clientAuth: () => ({ currentUser: { getIdToken } })
}));

const { ladeAngaben, ladeExport, ladeKonto, ladeUnterlagen, holeUnterlageDownloadUrl, registriereUnterlage } =
  await import('./service');

function antwort(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Minimale, gegen `kontoSichtSchema` gueltige Antwort - dieser Test prueft die
// Wiederholungslogik in `kontoAufruf`, nicht die Schema-Pruefung (s. schema.test.ts).
const GUELTIGE_SICHT = {
  suchprofile: [],
  merkliste: [],
  optionen: {
    organisationsbereich: [],
    laufbahngruppe: [],
    bundesland: [],
    vertragsarten: [],
    einstiegswege: [],
    laufbahngruppeBedeutung: {},
    einstiegswegBedeutung: {}
  },
  benachrichtigung: { aktiv: false, emailBestaetigt: false },
  bewerberdatenAktiv: false
};

// WOZU: ein ID-Token laeuft nach einer Stunde ab; ist die Seite so lange offen,
// kommt der erste Aufruf mit 401 zurueck, obwohl der Nutzer angemeldet ist.
// Einmal mit frischem Token wiederholen - nicht oefter, sonst haengt eine
// wirklich abgelaufene Sitzung in einer Schleife.
describe('kontoAufruf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getIdToken.mockClear();
  });

  it('wiederholt nach 401 genau einmal mit frischem Token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(antwort(401))
      .mockResolvedValueOnce(antwort(200, GUELTIGE_SICHT));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ladeKonto()).resolves.toEqual(GUELTIGE_SICHT);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer frisch');
    expect(getIdToken).toHaveBeenLastCalledWith(true);
  });

  it('wirft, wenn auch der zweite Versuch 401 liefert', async () => {
    const fetchMock = vi.fn().mockResolvedValue(antwort(401, { fehler: 'Bitte melde dich an.' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ladeKonto()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('wiederholt andere Fehler nicht', async () => {
    const fetchMock = vi.fn().mockResolvedValue(antwort(500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ladeKonto()).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// WOZU: eine fehlende Function laesst den Browser
// schon am CORS-Preflight scheitern - `fetch` wirft einen TypeError statt eine
// 404 zu liefern. Beides muss den Bereich verbergen, nicht die Seite brechen.
describe('fehlende Endpunkte ueber Origins hinweg', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ladeAngaben/ladeUnterlagen/ladeExport liefern bei einem TypeError aus fetch nicht-verfuegbar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(ladeAngaben()).resolves.toBe('nicht-verfuegbar');
    await expect(ladeUnterlagen()).resolves.toBe('nicht-verfuegbar');
    await expect(ladeExport()).resolves.toBe('nicht-verfuegbar');
  });

  it('ladeAngaben/ladeUnterlagen/ladeExport liefern bei 404 nicht-verfuegbar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => antwort(404)));
    await expect(ladeAngaben()).resolves.toBe('nicht-verfuegbar');
    await expect(ladeUnterlagen()).resolves.toBe('nicht-verfuegbar');
    await expect(ladeExport()).resolves.toBe('nicht-verfuegbar');
  });

  it('reicht andere Fehler weiter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => antwort(500)));
    await expect(ladeAngaben()).rejects.toMatchObject({ status: 500 });
  });
});

// WOZU: eine unerwartete Antwort wird zum selben 502-Fehler wie
// bei den Ladefunktionen, statt ungeprueft weiterverwendet zu werden.
describe('gepruefte Unterlagen-Antworten', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('holeUnterlageDownloadUrl wirft 502 bei einer Antwort ohne https-URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(antwort(200, { url: 'javascript:alert(1)' })));
    await expect(holeUnterlageDownloadUrl('abc')).rejects.toMatchObject({ status: 502 });
  });

  it('registriereUnterlage wirft 502 bei einer unvollstaendigen Antwort', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(antwort(200, { docId: 'abc' })));
    await expect(registriereUnterlage('abc')).rejects.toMatchObject({ status: 502 });
  });
});
