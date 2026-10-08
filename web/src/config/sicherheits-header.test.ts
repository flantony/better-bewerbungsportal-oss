import { describe, expect, it } from 'vitest';
import { sicherheitsKonfiguration } from './sicherheits-header';

// WOZU: ohne Sicherheits-Kopfzeilen ist die Seite ungeschuetzt, und
// `x-powered-by` verriete ihr Framework. Die Kopfzeilen stehen in sicherheits-header.ts
// (von next.config.ts eingebunden) und
// gelten fuer jede Antwort - auch fuer /k/{id}, dessen eigene Kopfzeilen
// (text/plain, noindex, Cache) sie nicht ueberschneiden.
async function kopfzeilenFuer(pfadMuster: string): Promise<Record<string, string>> {
  const regeln = (await sicherheitsKonfiguration.headers()) ?? [];
  const regel = regeln.find((r) => r.source === pfadMuster);
  return Object.fromEntries((regel?.headers ?? []).map((h) => [h.key, h.value]));
}

describe('Sicherheits-Kopfzeilen', () => {
  it('setzt fuer jede Seite CSP, HSTS, nosniff, Referrer- und Permissions-Policy', async () => {
    const kopf = await kopfzeilenFuer('/:path*');

    expect(kopf['Content-Security-Policy']).toBe(
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
    );
    expect(kopf['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
    expect(kopf['X-Content-Type-Options']).toBe('nosniff');
    expect(kopf['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(kopf['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('gibt die Mappen-URL nie als Referrer weiter und steht dafuer nach der allgemeinen Regel', async () => {
    const regeln = (await sicherheitsKonfiguration.headers()) ?? [];
    const allgemein = regeln.findIndex((r) => r.source === '/:path*');
    const mappe = regeln.findIndex((r) => r.source === '/mappe/:path*');

    expect((await kopfzeilenFuer('/mappe/:path*'))['Referrer-Policy']).toBe('no-referrer');
    expect(mappe).toBeGreaterThan(allgemein);
  });

  it('ueberschneidet die eigenen Kopfzeilen von /k/{id} nicht', async () => {
    const regeln = (await sicherheitsKonfiguration.headers()) ?? [];
    const schluessel = regeln.flatMap((r) => r.headers.map((h) => h.key.toLowerCase()));

    for (const eigen of ['content-type', 'cache-control', 'x-robots-tag']) {
      expect(schluessel).not.toContain(eigen);
    }
  });

  it('verraet das Framework nicht per x-powered-by', () => {
    expect(sicherheitsKonfiguration.poweredByHeader).toBe(false);
  });
});
