import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bekannt = vi.hoisted(() => ({ ids: new Set<string>(), fehler: null as Error | null }));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    getAll: async (ref: { id: string }) => {
      if (bekannt.fehler) throw bekannt.fehler;
      return [{ exists: bekannt.ids.has(ref.id) }];
    }
  }
}));

const { GET, HEAD } = await import('./route');

const GUID = '0123456789abcdef0123456789ABCDEF';
const KI_SEITE = `https://europe-west3-better-bewerbungsportal.cloudfunctions.net/kiSeite?id=${GUID}`;

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  bekannt.ids = new Set([GUID]);
  bekannt.fehler = null;
});
afterEach(() => vi.unstubAllGlobals());

const kontext = (id: string) => ({ params: Promise.resolve({ id }) });
const anfrage = (methode = 'GET') => new Request(`https://better-bewerbungsportal.de/k/${GUID}`, { method: methode });

// WOZU: die Treffer-Mail verlinkt je Stelle
// /k/{id}. Der Bewerber kopiert den Link in seine KI - die braucht Klartext
// (ChatGPT lehnt text/markdown ab), darf die Seite nicht indizieren, und
// bekommt weder Cookies noch eine Anmeldeseite.
describe('/k/[id]', () => {
  it('GET reicht die KI-Seite der Stelle als text/plain weiter, mit kurzem Cache und noindex', async () => {
    fetchMock.mockResolvedValue(new Response('# KI-Hilfe für eine Bewerbung', { status: 200 }));

    const antwort = await GET(anfrage(), kontext(GUID));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(KI_SEITE);
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(antwort.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(antwort.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(antwort.headers.get('Set-Cookie')).toBeNull();
    expect(await antwort.text()).toBe('# KI-Hilfe für eine Bewerbung');
  });

  it('HEAD liefert dieselben Kopfzeilen ohne Inhalt', async () => {
    fetchMock.mockResolvedValue(new Response('# KI-Hilfe', { status: 200 }));

    const antwort = await HEAD(anfrage('HEAD'), kontext(GUID));

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(antwort.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(await antwort.text()).toBe('');
  });

  it('lehnt eine Kennung im falschen Format mit 404 ab, ohne die Function zu fragen', async () => {
    for (const id of ['abc', `${GUID}0`, '../geheim', `${GUID.slice(0, 31)}g`]) {
      const antwort = await GET(anfrage(), kontext(id));
      expect(antwort.status).toBe(404);
      expect(antwort.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      expect(await antwort.text()).toMatch(/Diese Stelle gibt es nicht mehr/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Alle /k-Abrufe teilen sich die Drosselung der KI-Seite - erfundene
  // Kennungen duerfen sie nicht leeren.
  it('beantwortet eine unbekannte Kennung selbst mit 404, ohne die Function zu fragen', async () => {
    bekannt.ids = new Set();

    const antwort = await GET(anfrage(), kontext(GUID));

    expect(antwort.status).toBe(404);
    expect(await antwort.text()).toMatch(/Aktuelle Stellen findest du/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('macht aus einem 404 der KI-Seite denselben Satz', async () => {
    fetchMock.mockResolvedValue(new Response('Zu dieser Kennung gibt es keine Ausschreibung.', { status: 404 }));

    const antwort = await GET(anfrage(), kontext(GUID));

    expect(antwort.status).toBe(404);
    expect(antwort.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await antwort.text()).toMatch(/Diese Stelle gibt es nicht mehr/);
  });

  it('reicht eine Drosselung mit Retry-After durch und cacht sie nicht', async () => {
    fetchMock.mockResolvedValue(
      new Response('Zu viele Anfragen.', { status: 429, headers: { 'Retry-After': '12' } })
    );

    const antwort = await GET(anfrage(), kontext(GUID));

    expect(antwort.status).toBe(429);
    expect(antwort.headers.get('Retry-After')).toBe('12');
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
  });

  it('macht aus Server-, Netz- und Firestore-Fehlern ein 502 mit verstaendlichem Satz', async () => {
    fetchMock.mockResolvedValueOnce(new Response('intern', { status: 500 }));
    const nachFehler = await GET(anfrage(), kontext(GUID));
    expect(nachFehler.status).toBe(502);
    expect(await nachFehler.text()).toMatch(/gerade nicht erreichbar/);

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const nachNetzfehler = await GET(anfrage(), kontext(GUID));
    expect(nachNetzfehler.status).toBe(502);
    expect(nachNetzfehler.headers.get('Cache-Control')).toBe('no-store');

    bekannt.fehler = new Error('unavailable');
    const nachFirestoreFehler = await GET(anfrage(), kontext(GUID));
    expect(nachFirestoreFehler.status).toBe(502);
    expect(nachFirestoreFehler.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });
});
