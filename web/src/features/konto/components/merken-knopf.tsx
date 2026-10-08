'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { kontoKeys, kontoQueryOptions } from '../api/queries';
import { aendereMerkliste } from '../api/service';
import { MERKLISTE_MAX } from '../api/types';

/**
 * Umschaltknopf "Merken"/"Gemerkt" auf der Job-Detailseite. Nicht angemeldet
 * -> Link zur Anmeldung mit `weiter` zurueck auf diese Stelle, statt den
 * Klick stillschweigend ins Leere laufen zu lassen.
 */
export function MerkenKnopf({ pinstGuid }: { pinstGuid: string }) {
  const user = useAuthUser();
  const queryClient = useQueryClient();
  const konto = useQuery({ ...kontoQueryOptions(user?.uid ?? ''), enabled: Boolean(user) });

  const gemerkt = konto.data?.merkliste.some((eintrag) => eintrag.pinstGuid === pinstGuid) ?? false;

  const mutation = useMutation({
    mutationFn: () => aendereMerkliste(pinstGuid, gemerkt ? 'vergessen' : 'merken'),
    onSuccess: async (ergebnis) => {
      if (ergebnis === 'liste-voll') {
        toast.error(`Deine Merkliste ist voll (${MERKLISTE_MAX} Stellen). Entferne zuerst eine.`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: kontoKeys.all });
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  // Anmeldezustand noch unbekannt (erster Render) - noch nichts anzeigen,
  // statt kurz "Anmelden" aufblitzen zu lassen.
  if (user === undefined) return null;

  if (user === null) {
    const weiter = encodeURIComponent(`/dashboard/jobs/${pinstGuid}`);
    return (
      <Button
        variant='outline'
        render={<Link href={`/anmelden?weiter=${weiter}`} aria-label='Anmelden, um diese Stelle zu merken' />}
      >
        <Icons.bookmark className='mr-2 h-4 w-4' />
        Anmelden, um diese Stelle zu merken
      </Button>
    );
  }

  return (
    <Button
      type='button'
      variant={gemerkt ? 'default' : 'outline'}
      aria-pressed={gemerkt}
      disabled={mutation.isPending || konto.isPending}
      onClick={() => mutation.mutate()}
    >
      <Icons.bookmark className='mr-2 h-4 w-4' />
      {gemerkt ? 'Gemerkt' : 'Merken'}
    </Button>
  );
}
