import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

function FlowSummaryPreview() {
  return (
    <div className='bg-card w-full max-w-sm rounded-xl border p-4 shadow-lg'>
      <p className='mb-3 text-sm font-medium'>So läuft deine Bewerbung</p>
      <div className='space-y-2'>
        <div className='flex items-center gap-3 rounded-md border px-3 py-2 text-sm'>
          <Icons.search className='text-muted-foreground h-4 w-4 shrink-0' />
          <p>Ausschreibung gefunden</p>
          <Badge variant='outline' className='ml-auto gap-1 text-green-700 dark:text-green-500'>
            <Icons.circleCheck className='h-3 w-3' /> Erledigt
          </Badge>
        </div>
        <div className='flex items-center gap-3 rounded-md border px-3 py-2 text-sm'>
          <Icons.sparkles className='text-muted-foreground h-4 w-4 shrink-0' />
          <p>Mit deiner eigenen KI vorbereiten</p>
          <Badge variant='outline' className='text-muted-foreground ml-auto gap-1'>
            <Icons.circle className='h-3 w-3' /> Offen
          </Badge>
        </div>
      </div>
    </div>
  );
}

export function LandingHero() {
  return (
    <section className='relative isolate overflow-hidden'>
      {/* Herz-Flecktarn nur als Dekor: der Text liegt auf einer fast deckenden
          Flaeche, sonst reicht der Kontrast auf dem unruhigen Muster nicht. */}
      <div
        aria-hidden='true'
        className="absolute inset-0 -z-10 bg-[url('/herz-flecktarn.svg')] bg-size-[360px_360px] bg-repeat"
      />
      <div className='mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 md:grid-cols-2 md:px-6 md:pt-24'>
        <div className='bg-background/95 min-w-0 rounded-2xl p-6 shadow-lg md:p-8'>
          <Badge variant='outline' className='text-brand mb-4 h-auto max-w-full whitespace-normal'>
            Unabhängiges Projekt, keine offizielle Bundeswehr-Website
          </Badge>
          <h1 className='font-serif text-3xl leading-tight font-extrabold tracking-tight break-words hyphens-auto sm:text-4xl md:text-5xl'>
            Bundeswehr-Jobs finden. Den Bewerbungsbogen füllt deine KI aus.
          </h1>
          <p className='text-muted-foreground mt-6 max-w-lg text-lg'>
            Wir holen jede Nacht alle offenen Ausschreibungen der Bundeswehr. Mit einem Konto
            bekommst du auf Wunsch eine Mail, sobald neue zu deinem Suchfilter passen. Für die Bewerbung
            verbindest du dein eigenes KI-Tool (z.&nbsp;B. Claude oder ChatGPT) mit uns. Es liest
            die Ausschreibung, füllt deinen Bewerbungsbogen aus und hilft dir beim Anschreiben.
            Deine Angaben speichern wir dabei nicht, die Bewerbungsmappe löschen wir nach einer
            Stunde.
          </p>
          <div className='mt-8 flex flex-wrap gap-3'>
            <Button
              size='lg'
              nativeButton={false}
              render={<Link href='/dashboard/jobs' aria-label='Stellen durchsuchen' />}
            >
              Stellen durchsuchen
              <Icons.arrowRight className='ml-2 h-4 w-4' />
            </Button>
            <Button
              size='lg'
              variant='outline'
              nativeButton={false}
              render={<Link href='/ki' aria-label='Mit deiner KI bewerben' />}
            >
              Mit deiner KI bewerben
            </Button>
          </div>
        </div>
        <div className='flex min-w-0 justify-center md:justify-end'>
          <FlowSummaryPreview />
        </div>
      </div>
    </section>
  );
}
