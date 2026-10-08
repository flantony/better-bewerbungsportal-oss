'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { istAbmeldungAmLaufen } from '../lib/abmeldung-laeuft';
import { useAuthUser } from './auth-provider';

/**
 * Nur Kontoseiten sind geschuetzt; Stellensuche und Detailseiten bleiben ohne
 * Anmeldung. Das ist Bedienkomfort, keine Sicherheitsgrenze - die liegt in den
 * Konto-Functions (ID-Token) und den deny-all-Rules.
 */
export function KontoGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();
  const router = useRouter();
  const pfad = usePathname();

  useEffect(() => {
    // Waehrend einer gewollten Abmeldung (Sign-out, Konto-Loeschung) navigiert
    // die ausloesende Stelle selbst - dieser Guard soll dabei nicht mit einem
    // eigenen Redirect nach /anmelden dazwischenfunken.
    if (user === null && !istAbmeldungAmLaufen()) {
      router.replace(`/anmelden?weiter=${encodeURIComponent(pfad)}`);
    }
  }, [user, router, pfad]);

  if (!user) {
    return <div className='text-muted-foreground p-6 text-sm'>Lädt…</div>;
  }
  return <>{children}</>;
}
