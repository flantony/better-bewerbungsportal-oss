import Link from 'next/link';
import { AuthSeite } from '@/features/auth/components/auth-seite';
import { SignInForm } from '@/features/auth/components/sign-in-form';

export const metadata = {
  title: 'Anmelden',
  robots: { index: false }
};

type PageProps = { searchParams: Promise<{ weiter?: string }> };

export default async function AnmeldenPage({ searchParams }: PageProps) {
  const { weiter } = await searchParams;
  const registrierenHref = weiter ? `/registrieren?weiter=${encodeURIComponent(weiter)}` : '/registrieren';

  return (
    <AuthSeite titel='Anmelden' beschreibung='Melde dich mit deiner E-Mail-Adresse an.'>
      <SignInForm />
      <p className='text-muted-foreground text-center text-sm'>
        Noch kein Konto?{' '}
        <Link href={registrierenHref} className='text-primary underline-offset-4 hover:underline'>
          Registrieren
        </Link>
      </p>
    </AuthSeite>
  );
}
