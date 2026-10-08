'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { bewerbungsplanQueryOptions } from '../api/queries';

/**
 * Der Konto-Weg auf der Job-Detailseite (Karte "Mit Konto vorbereiten" in
 * `BewerbungsWege`). Abgemeldet -> Anmeldung mit `weiter` direkt auf die
 * gefuehrte Bewerbung dieser Stelle, nicht zurueck auf die Stellenseite.
 * Angemeldet, aber `kontoBewerbungsplan` nicht erreichbar (404/
 * TypeError, s. konto/lib/nicht-verfuegbar.ts) -> gar kein Knopf, keine
 * Platzhalter-Meldung. Echte Links statt `Button render={<Link>}`: Letzteres
 * setzt `role="button"`, und Screenreader kuendigen eine Navigation dann als
 * Knopf an.
 */
export function BewerbenKnopf({ pinstGuid }: { pinstGuid: string }) {
  const user = useAuthUser();
  const planQuery = useQuery({
    ...bewerbungsplanQueryOptions(user?.uid ?? '', pinstGuid),
    enabled: Boolean(user)
  });

  // Anmeldezustand noch unbekannt (erster Render) - noch nichts anzeigen,
  // statt kurz einen falschen Zustand aufblitzen zu lassen.
  if (user === undefined) return null;

  if (user === null) {
    const weiter = encodeURIComponent(`/dashboard/bewerben/${pinstGuid}`);
    return (
      <Link href={`/anmelden?weiter=${weiter}`} className={buttonVariants({ variant: 'outline' })}>
        <Icons.login className='h-4 w-4' aria-hidden='true' />
        Anmelden und loslegen
      </Link>
    );
  }

  // Noch nicht geladen, Fehler oder Endpunkt nicht ausgerollt - in
  // allen drei Faellen zeigt sich der Knopf schlicht nicht (kein Aufblitzen
  // eines Fehlertexts neben "Merken").
  if (planQuery.data === undefined || planQuery.data === 'nicht-verfuegbar' || planQuery.isError) return null;

  return (
    <Link href={`/dashboard/bewerben/${pinstGuid}`} className={buttonVariants({ variant: 'outline' })}>
      <Icons.send className='h-4 w-4' aria-hidden='true' />
      Bewerbung vorbereiten
    </Link>
  );
}
