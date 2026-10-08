import Link from 'next/link';
import { QUELLCODE_URL } from '@/config/quellcode';

export function LandingFooter() {
  return (
    <footer className='mx-auto max-w-6xl px-4 py-10 md:px-6'>
      <div className='flex flex-col items-center justify-between gap-4 sm:flex-row'>
        <p className='text-muted-foreground text-sm'>© Better Bewerbungsportal</p>
        <nav aria-label='Weitere Seiten' className='text-muted-foreground flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm'>
          <Link href='/ki' className='underline-offset-4 hover:underline'>
            Mit deiner KI bewerben
          </Link>
          <Link href='/impressum' className='underline-offset-4 hover:underline'>
            Impressum
          </Link>
          <Link href='/datenschutz' className='underline-offset-4 hover:underline'>
            Datenschutz
          </Link>
          <Link href='/barrierefreiheit' className='underline-offset-4 hover:underline'>
            Barrierefreiheit
          </Link>
          {QUELLCODE_URL && (
            <a href={QUELLCODE_URL} className='underline-offset-4 hover:underline'>
              Quellcode
            </a>
          )}
        </nav>
      </div>
      <p className='text-muted-foreground mt-6 text-center text-xs'>
        Better Bewerbungsportal ist ein unabhängiges, privates Projekt und keine offizielle Website
        der Bundeswehr oder des Bundesministeriums der Verteidigung.
      </p>
    </footer>
  );
}
