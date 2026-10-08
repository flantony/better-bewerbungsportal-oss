import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';

export function LandingHeader() {
  return (
    <header className='border-border/60 sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md'>
      {/* Bei 390px ragte "Stellen durchsuchen" sonst aus dem Bild. Unter `sm`
          nur noch ein Knopf - der KI-Weg steht dort im Hero
          und im Fuss; reicht auch der eine Knopf nicht (320px), bricht die
          Zeile um statt abzuschneiden. */}
      <div className='mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 md:px-6'>
        <Link href='/' className='flex items-center gap-2'>
          <Wordmark className='text-sm sm:text-base' />
        </Link>
        <nav aria-label='Hauptnavigation' className='flex items-center gap-2'>
          <Button
            variant='ghost'
            nativeButton={false}
            className='hidden sm:inline-flex'
            render={<Link href='/ki' aria-label='Mit deiner KI bewerben' />}
          >
            Mit deiner KI bewerben
          </Button>
          <Button
            nativeButton={false}
            className='h-8 px-3 sm:h-9 sm:px-4'
            render={<Link href='/dashboard/jobs' aria-label='Stellen durchsuchen' />}
          >
            Stellen durchsuchen
          </Button>
        </nav>
      </div>
    </header>
  );
}
