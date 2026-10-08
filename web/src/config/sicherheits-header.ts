import type { NextConfig } from 'next';

// ─── Sicherheits-Kopfzeilen ─────
// Eigene Datei statt direkt in next.config.ts: App Hosting ersetzt next.config.ts
// beim Build durch eine eigene Fassung ohne Default-Export - ein Test, der
// next.config importiert, bricht dort die Typpruefung.
//
// CSP bewusst ohne `script-src`: das Theme-Skript in app/layout.tsx (und das von
// next-themes) steht inline im <head>. Ohne 'unsafe-inline' braeuchte es eine
// Nonce je Anfrage aus proxy.ts - dessen Matcher deckt aber nur /dashboard ab.
// Was hier steht, bricht nichts: Firebase Auth (signInWithPopup) bettet SEIN
// iframe von der authDomain in UNSERE Seite ein (frame-ancestors regelt nur,
// wer UNS einbettet) und schickt kein Formular von unserer Seite ab.
const CSP = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');

const SICHERHEITS_HEADER = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
];

export const sicherheitsKonfiguration = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SICHERHEITS_HEADER },
      // Die Mappen-URL IST der Zugangsschluessel (kein Login) - sie darf nicht
      // als Referrer an eine verlinkte Seite gehen. Steht NACH der allgemeinen
      // Regel: bei gleichem Schluessel gewinnt in Next der spaetere Eintrag.
      { source: '/mappe/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] }
    ];
  }
} satisfies Pick<NextConfig, 'poweredByHeader' | 'headers'>;
