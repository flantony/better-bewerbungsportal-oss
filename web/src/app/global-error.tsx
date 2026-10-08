'use client';

import { useEffect } from 'react';

/**
 * Letzte Instanz, falls das Root-Layout selbst crasht - bewusst mit reinem
 * Inline-CSS statt Tailwind/Theme-Variablen, da nicht garantiert ist, dass
 * globals.css zu diesem Zeitpunkt zuverlässig geladen ist.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang='de'>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#09090b',
          backgroundColor: '#ffffff',
          textAlign: 'center',
          padding: '1rem'
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Etwas ist schiefgelaufen
          </h1>
          <p style={{ color: '#71717a', marginBottom: '1.5rem' }}>
            Lade die Seite neu. Klappt es dann immer noch nicht, versuch es später noch einmal.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: '#09090b',
              color: '#ffffff',
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            Seite neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
