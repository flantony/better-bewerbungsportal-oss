// Kurzlink fuer die KI-Seite einer Stelle: /k/{pinstGuid}. Steht in der
// Treffer-Mail - der Bewerber kopiert ihn in seine eigene KI. Wir rufen hier keine KI auf, sondern reichen
// nur die Klartextseite der Function `kiSeite` (functions/src/kiSeite.ts)
// unter unserer eigenen Domain weiter.
//
// Schlicht: keine Cookies, keine Anmeldung, kein eigenes Logging
// (nur das Request-Log der Plattform). Die Kennung ist ausschliesslich die
// oeffentliche `pinstGuid` (Designgrenze 4 in kiSeite.ts).
//
// DROSSELUNG: `kiSeite` drosselt je Client-IP - und Client ist hier immer
// unser eigener Server. Alle /k-Abrufe teilen sich also EIN Kontingent je
// Function-Instanz. Damit erfundene Kennungen es nicht leeren koennen, fragt
// die Route vorher in `jobsV2` nach (ein Lesevorgang, nur das Feld `active`)
// und antwortet fuer Unbekanntes selbst; echte Stellen cacht Next je Kennung.

import { adminDb } from '@/lib/firebase/admin';
import { kiSeitenUrl } from '@/features/ki-anbindung/lib/connection';
import { istPinstGuid } from '@/lib/pinst-guid';

const UNBEKANNT =
  'Diese Stelle gibt es nicht mehr, oder der Link ist unvollständig. Aktuelle Stellen findest du auf ' +
  'https://better-bewerbungsportal.de/dashboard/jobs';
const NICHT_ERREICHBAR = 'Die Seite ist gerade nicht erreichbar. Bitte versuch es später erneut.';

/** Kurz: die KI-Seite cacht selbst eine Stunde, hier reichen Minuten. */
const CACHE_OK = 'public, max-age=300';
const CACHE_UNBEKANNT = 'public, max-age=60';

/** So lange darf die Function brauchen, bevor wir aufgeben. */
const ZEITLIMIT_MS = 15_000;

function textAntwort(
  body: string | null,
  status: number,
  cacheControl: string,
  extra: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Robots-Tag': 'noindex',
      ...extra
    }
  });
}

async function stelleBekannt(id: string): Promise<boolean> {
  const [snap] = await adminDb.getAll(adminDb.collection('jobsV2').doc(id), { fieldMask: ['active'] });
  return snap.exists;
}

async function holeKiSeite(id: string): Promise<Response> {
  if (!istPinstGuid(id)) return textAntwort(UNBEKANNT, 404, CACHE_UNBEKANNT);

  try {
    if (!(await stelleBekannt(id))) return textAntwort(UNBEKANNT, 404, CACHE_UNBEKANNT);

    const upstream = await fetch(kiSeitenUrl(id), {
      // text/plain, nicht text/markdown: der Webzugriff von ChatGPT lehnt
      // Markdown ab (s. kiSeite.ts).
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
      // Nur 200 landet im Datencache (Next cacht keine anderen Status).
      next: { revalidate: 300 }
    });
    const body = await upstream.text();

    if (upstream.status === 200) return textAntwort(body, 200, CACHE_OK);
    if (upstream.status === 404) return textAntwort(UNBEKANNT, 404, CACHE_UNBEKANNT);
    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get('Retry-After');
      return textAntwort(body, 429, 'no-store', retryAfter ? { 'Retry-After': retryAfter } : {});
    }
    return textAntwort(NICHT_ERREICHBAR, 502, 'no-store');
  } catch {
    return textAntwort(NICHT_ERREICHBAR, 502, 'no-store');
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return holeKiSeite(id);
}

// Link-Vorschauen und manche Abrufwerkzeuge der Chats fragen erst per HEAD an
// und geben bei 405 auf (s. kiSeite.ts) - gleiche Kopfzeilen, kein Inhalt.
export async function HEAD(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const antwort = await holeKiSeite(id);
  return new Response(null, { status: antwort.status, headers: antwort.headers });
}
