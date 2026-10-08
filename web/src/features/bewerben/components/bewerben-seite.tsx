'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { kontoQueryOptions } from '@/features/konto/api/queries';
import { EINREICHEN_ANKER } from '@/features/jobs/lib/einreichliste';
import { GefuehrteBewerbung } from './gefuehrte-bewerbung';

/**
 * `/dashboard/bewerben/[pinstGuid]`: die gefuehrte Bewerbung nur, wenn der
 * Server Bewerberdaten im Konto meldet (Funktionsschalter
 * BEWERBERDATEN_IM_KONTO). Sonst ein Satz und der Weg zur Stellenseite bzw.
 * zur KI - ein Link aus einer Mail oder einem Lesezeichen soll nicht auf einer
 * Fehlerseite enden.
 */
export function BewerbenSeite({ pinstGuid }: { pinstGuid: string }) {
  const user = useAuthUser();
  const konto = useQuery({ ...kontoQueryOptions(user?.uid ?? ''), enabled: Boolean(user) });

  if (user === undefined || konto.isPending) {
    return <p className='text-muted-foreground text-sm'>Lädt…</p>;
  }
  if (konto.isError) return <p className='text-destructive text-sm'>{konto.error.message}</p>;

  if (!konto.data.bewerberdatenAktiv) return <GefuehrteBewerbungAus pinstGuid={pinstGuid} />;

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>In fünf Schritten zu deiner Bewerbungsmappe.</p>
      <GefuehrteBewerbung pinstGuid={pinstGuid} />
    </div>
  );
}

function GefuehrteBewerbungAus({ pinstGuid }: { pinstGuid: string }) {
  return (
    <div className='max-w-3xl space-y-4 text-sm'>
      <p>
        Die geführte Bewerbung mit fertigem Paket aus deinem Konto bieten wir derzeit nicht an. Was du für diese
        Stelle einreichen musst, steht auf der Stellenseite: Unterlagen, Formulare und eine Checkliste zum
        Herunterladen. Oder du bereitest die Bewerbung mit deiner KI vor.
      </p>
      <div className='flex flex-wrap gap-2'>
        <Link
          href={`/dashboard/jobs/${encodeURIComponent(pinstGuid)}#${EINREICHEN_ANKER}`}
          className={buttonVariants({ variant: 'default' })}
        >
          <Icons.checks className='h-4 w-4' aria-hidden='true' />
          Zur Stelle und Checkliste
        </Link>
        <Link href='/ki' className={buttonVariants({ variant: 'outline' })}>
          <Icons.sparkles className='h-4 w-4' aria-hidden='true' />
          Mit deiner KI bewerben
        </Link>
      </div>
    </div>
  );
}
