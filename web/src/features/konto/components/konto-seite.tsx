'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { kontoQueryOptions } from '../api/queries';
import { Benachrichtigungen } from './benachrichtigungen';
import { DatenExport } from './daten-export';
import { FruehereBewerberdaten } from './fruehere-bewerberdaten';
import { KontoLoeschen } from './konto-loeschen';
import { MeineAngaben } from './meine-angaben';
import { MeineUnterlagen } from './meine-unterlagen';
import { SuchprofileBereich } from './suchprofile-bereich';

export function KontoSeite() {
  const user = useAuthUser();
  const konto = useQuery({ ...kontoQueryOptions(user?.uid ?? ''), enabled: Boolean(user) });

  if (konto.isPending) return <p className='text-muted-foreground text-sm'>Lädt dein Konto…</p>;
  if (konto.isError) return <p className='text-destructive text-sm'>{konto.error.message}</p>;

  return (
    <div className='space-y-10'>
      <SuchprofileBereich key={user?.uid} sicht={konto.data} />
      <Benachrichtigungen sicht={konto.data} />
      {/* Funktionsschalter BEWERBERDATEN_IM_KONTO: aus heisst kein Speichern
          und kein Hochladen - schon gespeicherte Daten bleiben sicht- und
          loeschbar. */}
      {konto.data.bewerberdatenAktiv ? (
        <>
          <MeineAngaben />
          <MeineUnterlagen />
        </>
      ) : (
        <FruehereBewerberdaten />
      )}
      <DatenExport />
      <KontoLoeschen />
    </div>
  );
}
