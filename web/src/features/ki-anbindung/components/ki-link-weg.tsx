import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';

const SCHRITTE = [
  'Such dir eine Stelle aus und öffne ihre Seite.',
  'Klick dort bei „Mit deiner KI vorbereiten“ auf „Text kopieren“.',
  'Füg den Text in ChatGPT, Claude oder Gemini ein. Die KI führt dich dann durch die Bewerbung auf diese Stelle.'
];

/**
 * Der einfachste Weg zuerst: ein Link pro Stelle,
 * nichts zu installieren, auch mit kostenlosem ChatGPT. Die feste Verbindung
 * darunter ist nur noch der Weg fuer Leute, die oefter suchen wollen.
 */
export function KiLinkWeg() {
  return (
    <section aria-labelledby='ki-link-weg' className='bg-muted/30 space-y-4 rounded-xl border p-5'>
      <div className='space-y-1'>
        <p className='text-brand text-xs font-semibold tracking-wide uppercase'>Für den Einstieg</p>
        <h2 id='ki-link-weg' className='font-serif text-2xl font-bold tracking-tight'>
          Ohne Installation: Link zur Stelle in deinen Chat kopieren
        </h2>
        <p className='text-muted-foreground text-sm'>
          Das geht auch mit kostenlosem ChatGPT, weil es ein normaler Link ist. Ein Konto bei uns brauchst du
          dafür nicht.
        </p>
      </div>
      <ol className='space-y-3'>
        {SCHRITTE.map((schritt, index) => (
          <li key={schritt} className='flex gap-3 text-sm'>
            <span className='bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium'>
              {index + 1}
            </span>
            <span className='min-w-0 pt-0.5'>{schritt}</span>
          </li>
        ))}
      </ol>
      <Link href='/dashboard/jobs' className={buttonVariants()}>
        <Icons.search className='h-4 w-4' aria-hidden='true' />
        Stelle aussuchen
      </Link>
    </section>
  );
}
