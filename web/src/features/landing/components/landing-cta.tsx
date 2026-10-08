import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

export function LandingCta() {
  return (
    <section className='border-y bg-muted/30'>
      <div className='mx-auto max-w-6xl px-4 py-20 text-center md:px-6'>
        <h2 className='font-serif text-3xl font-bold tracking-tight'>Fang mit der Suche an</h2>
        <p className='text-muted-foreground mx-auto mt-4 max-w-md'>
          Mit einem Konto schicken wir dir auf Wunsch neue passende Ausschreibungen per Mail,
          höchstens eine Mail pro Nacht.
        </p>
        <div className='mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row'>
          <Button
            size='lg'
            nativeButton={false}
            render={<Link href='/dashboard/jobs' aria-label='Stellenangebote durchsuchen' />}
          >
            Stellen durchsuchen
            <Icons.arrowRight className='ml-2 h-4 w-4' />
          </Button>
          <Button
            size='lg'
            variant='outline'
            nativeButton={false}
            render={<Link href='/ki' aria-label='Ohne Konto mit deiner KI bewerben' />}
          >
            Ohne Konto mit deiner KI bewerben
          </Button>
        </div>
      </div>
    </section>
  );
}
