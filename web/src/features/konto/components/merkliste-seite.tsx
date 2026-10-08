'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { getJobsByIds } from '@/features/jobs/api/service';
import { kontoKeys, kontoQueryOptions } from '../api/queries';
import { aendereMerkliste } from '../api/service';
import { ausgeblendetText, ausMailText, teileMerkliste } from '../lib/merkliste-anzeige';

export function MerklisteSeite() {
  const user = useAuthUser();
  const queryClient = useQueryClient();
  const konto = useQuery({ ...kontoQueryOptions(user?.uid ?? ''), enabled: Boolean(user) });
  const ids = konto.data?.merkliste.map((eintrag) => eintrag.pinstGuid) ?? [];

  const stellen = useQuery({
    queryKey: kontoKeys.merklisteStellen(user?.uid ?? '', ids),
    queryFn: () => getJobsByIds(ids),
    enabled: konto.isSuccess && ids.length > 0
  });

  const entfernenMutation = useMutation({
    mutationFn: (pinstGuid: string) => aendereMerkliste(pinstGuid, 'vergessen'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kontoKeys.all }),
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  // Ausgeblendete (nicht mehr ausgeschriebene) Stellen belegen bis zum
  // naechtlichen Aufraeumen noch Plaetze der Liste - wer sie sofort los sein
  // will, entfernt sie hier alle auf einmal.
  const ausgeblendeteMutation = useMutation({
    mutationFn: async (pinstGuids: string[]) => {
      for (const pinstGuid of pinstGuids) await aendereMerkliste(pinstGuid, 'vergessen');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: kontoKeys.all }),
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  if (konto.isPending) return <p className='text-muted-foreground text-sm'>Lädt deine Merkliste…</p>;
  if (konto.isError) return <p className='text-destructive text-sm'>{konto.error.message}</p>;

  if (ids.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        Du hast noch keine Stelle gemerkt.{' '}
        <Link href='/dashboard/jobs' className='text-primary underline underline-offset-4'>
          Jetzt Stellen durchsuchen
        </Link>
        .
      </p>
    );
  }

  if (stellen.isPending) {
    return <p className='text-muted-foreground text-sm'>Lädt deine gemerkten Stellen…</p>;
  }
  if (stellen.isError) return <p className='text-destructive text-sm'>{stellen.error.message}</p>;

  const { sichtbar, ausgeblendet, ausgeblendeteIds } = teileMerkliste(
    konto.data.merkliste,
    new Map(stellen.data.map((job) => [job.pinstGuid, job]))
  );
  const hinweisText = ausgeblendetText(ausgeblendet);
  const hinweisAusgeblendet = hinweisText && (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
      <p className='text-muted-foreground text-sm'>{hinweisText}</p>
      <Button
        type='button'
        variant='link'
        size='sm'
        className='h-auto px-0'
        disabled={ausgeblendeteMutation.isPending}
        onClick={() => ausgeblendeteMutation.mutate(ausgeblendeteIds)}
      >
        {ausgeblendet === 1 ? 'Jetzt entfernen' : 'Alle jetzt entfernen'}
      </Button>
    </div>
  );

  if (sichtbar.length === 0) {
    return (
      <div className='max-w-3xl space-y-2'>
        {hinweisAusgeblendet}
        <p className='text-muted-foreground text-sm'>
          Auf deiner Merkliste steht gerade keine offene Stelle.{' '}
          <Link href='/dashboard/jobs' className='text-primary underline underline-offset-4'>
            Jetzt Stellen durchsuchen
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className='max-w-3xl space-y-3'>
      {hinweisAusgeblendet}
      {sichtbar.map(({ eintrag, job }) => {
        const { pinstGuid } = eintrag;
        const herkunft = ausMailText(eintrag.ausMail);
        return (
          <Card key={pinstGuid}>
            <CardContent className='flex flex-wrap items-center justify-between gap-3'>
              <div className='space-y-1'>
                <Link
                  href={`/dashboard/jobs/${pinstGuid}`}
                  className='font-medium hover:underline underline-offset-4'
                >
                  {job.title}
                </Link>
                <div className='text-muted-foreground flex flex-wrap gap-x-3 text-sm'>
                  <span>{job.besOrt}</span>
                  {job.applicationEnd && <span>Bewerbungsschluss: {job.applicationEnd}</span>}
                </div>
                {herkunft && <p className='text-muted-foreground text-sm'>{herkunft}</p>}
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                aria-label={`${job.title} von der Merkliste entfernen`}
                disabled={entfernenMutation.isPending && entfernenMutation.variables === pinstGuid}
                onClick={() => entfernenMutation.mutate(pinstGuid)}
              >
                <Icons.close className='mr-2 h-4 w-4' />
                Entfernen
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
