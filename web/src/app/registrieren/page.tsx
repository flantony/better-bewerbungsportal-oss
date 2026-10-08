import Link from 'next/link';
import { Icons } from '@/components/icons';
import { AuthSeite } from '@/features/auth/components/auth-seite';
import { SignUpForm } from '@/features/auth/components/sign-up-form';
import { SUCHPROFILE_MAX } from '@/features/konto/api/types';

export const metadata = {
  title: 'Registrieren',
  robots: { index: false }
};

// Was ein Konto bringt - die Stellensuche selbst geht auch ohne. Kein
// Bewerbungspaket: Bewerberdaten im Konto sind ausgeschaltet
// (functions/src/lib/funktionsschalter.ts). Diese Seite ist ohne Anmeldung
// und kennt den Schalter nicht - wird er eingeschaltet, hier anpassen.
const VORTEILE = [
  `Bis zu ${SUCHPROFILE_MAX} Suchfilter speichern`,
  'Stellen auf einer Merkliste sammeln',
  'Eine Mail bei neuen passenden Stellen, höchstens einmal am Tag'
];

type PageProps = { searchParams: Promise<{ weiter?: string }> };

export default async function RegistrierenPage({ searchParams }: PageProps) {
  const { weiter } = await searchParams;
  const anmeldenHref = weiter ? `/anmelden?weiter=${encodeURIComponent(weiter)}` : '/anmelden';

  return (
    <AuthSeite
      titel='Konto erstellen'
      beschreibung='Stellen suchen geht auch ohne Konto. Mit Konto bekommst du:'
      vorteile={
        <ul className='space-y-1.5 text-sm'>
          {VORTEILE.map((vorteil) => (
            <li key={vorteil} className='flex items-start gap-2'>
              <Icons.check className='text-brand mt-0.5 size-4 shrink-0' aria-hidden='true' />
              {vorteil}
            </li>
          ))}
        </ul>
      }
    >
      <SignUpForm />
      <p className='text-muted-foreground text-center text-sm'>
        Bereits ein Konto?{' '}
        <Link href={anmeldenHref} className='text-primary underline-offset-4 hover:underline'>
          Anmelden
        </Link>
      </p>
    </AuthSeite>
  );
}
