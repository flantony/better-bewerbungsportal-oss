'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { KiChatLink } from '@/features/ki-anbindung/components/ki-chat-link';
import { kontoQueryOptions } from '@/features/konto/api/queries';
import { MerkenKnopf } from '@/features/konto/components/merken-knopf';
import { EINREICHEN_ANKER } from '@/features/jobs/lib/einreichliste';
import { BewerbenKnopf } from './bewerben-knopf';

/**
 * Die zwei gleichwertigen Wege zur Bewerbung auf der Stellenseite.
 * Startseite und /ki versprechen "kein Konto noetig" - Abgemeldete duerfen
 * hier also nicht nur "Anmelden, um dich zu bewerben" sehen. Der KI-Weg ohne
 * Konto steht deshalb zuerst.
 *
 * Der zweite Weg haengt am Funktionsschalter BEWERBERDATEN_IM_KONTO (Server,
 * gemeldet ueber `kontoLaden`): nur wenn er an
 * ist, fuehrt die Karte in die gefuehrte Bewerbung. Sonst - und fuer
 * Abgemeldete, deren Stand wir ohne Anmeldung nicht kennen - der Weg ohne KI
 * ueber die Liste und Checkliste auf derselben Seite.
 */
export function BewerbungsWege({ pinstGuid }: { pinstGuid: string }) {
  return (
    <section aria-labelledby='bewerbungs-wege' className='space-y-3'>
      <div className='space-y-1'>
        <h2 id='bewerbungs-wege' className='font-serif text-xl font-semibold tracking-tight'>
          So bereitest du deine Bewerbung vor
        </h2>
        <p className='text-muted-foreground text-sm'>
          Zwei Wege, beide kostenlos. Abschicken musst du die Bewerbung am Ende selbst über das offizielle
          Portal der Bundeswehr.
        </p>
      </div>
      <div className='grid gap-4 lg:grid-cols-2'>
        <Card className='min-w-0'>
          <CardHeader>
            <CardTitle>
              <h3 className='flex items-center gap-2 text-base'>
                <Icons.sparkles className='h-4 w-4 shrink-0' aria-hidden='true' />
                Mit deiner KI vorbereiten
              </h3>
            </CardTitle>
            <CardDescription>Ohne Konto und ohne Installation</CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <KiChatLink pinstGuid={pinstGuid} />
            <Link href='/ki' className='text-sm underline underline-offset-4'>
              Mehr zum Bewerben mit deiner KI
            </Link>
          </CardContent>
        </Card>
        <ZweiterWeg pinstGuid={pinstGuid} />
      </div>
    </section>
  );
}

function ZweiterWeg({ pinstGuid }: { pinstGuid: string }) {
  const user = useAuthUser();
  const konto = useQuery({ ...kontoQueryOptions(user?.uid ?? ''), enabled: Boolean(user) });
  if (user && konto.data?.bewerberdatenAktiv === true) return <MitKonto pinstGuid={pinstGuid} />;
  // `undefined` = Anmeldezustand noch unbekannt: weder Anmelde-Satz noch
  // Merken-Knopf, statt kurz den falschen Zustand aufblitzen zu lassen.
  return <SelbstVorbereiten pinstGuid={pinstGuid} angemeldet={user === undefined ? undefined : Boolean(user)} />;
}

function MitKonto({ pinstGuid }: { pinstGuid: string }) {
  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>
          <h3 className='flex items-center gap-2 text-base'>
            <Icons.user className='h-4 w-4 shrink-0' aria-hidden='true' />
            Mit Konto vorbereiten
          </h3>
        </CardTitle>
        <CardDescription>Schritt für Schritt hier auf der Seite</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <p>
          Wir führen dich durch Bewerbungsbogen, Anschreiben und Unterlagen und stellen dir am Ende alles
          als Paket zum Herunterladen zusammen. Was du unter „Meine Angaben“ hinterlegst, bleibt für die
          nächste Bewerbung in deinem Konto.
        </p>
        <div className='flex flex-wrap gap-2'>
          <BewerbenKnopf pinstGuid={pinstGuid} />
          <MerkenKnopf pinstGuid={pinstGuid} />
        </div>
      </CardContent>
    </Card>
  );
}

function SelbstVorbereiten({ pinstGuid, angemeldet }: { pinstGuid: string; angemeldet: boolean | undefined }) {
  const weiter = encodeURIComponent(`/dashboard/jobs/${pinstGuid}`);
  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>
          <h3 className='flex items-center gap-2 text-base'>
            <Icons.checks className='h-4 w-4 shrink-0' aria-hidden='true' />
            Selbst vorbereiten
          </h3>
        </CardTitle>
        <CardDescription>Ohne KI und ohne Konto</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <p>
          Unter „Was du einreichen musst“ steht, welche Unterlagen diese Stelle verlangt, welche Formulare du
          ausfüllen und unterschreiben musst und wie du einreichst. Das alles gibt es auch als Checkliste zum
          Herunterladen.
        </p>
        <div className='flex flex-wrap items-center gap-2'>
          <a href={`#${EINREICHEN_ANKER}`} className='underline underline-offset-4'>
            Zur Liste, was du einreichen musst
          </a>
          {angemeldet ? <MerkenKnopf pinstGuid={pinstGuid} /> : null}
        </div>
        {angemeldet !== false ? null : (
          <p className='text-muted-foreground'>
            Mit einem kostenlosen Konto merkst du dir Stellen und bekommst auf Wunsch eine Mail zu neuen
            passenden Stellen.{' '}
            <Link href={`/anmelden?weiter=${weiter}`} className='underline underline-offset-4'>
              Anmelden
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
