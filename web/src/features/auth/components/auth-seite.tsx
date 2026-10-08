import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GoogleSignInButton } from './google-sign-in-button';

/**
 * Gemeinsamer Rahmen für /anmelden und /registrieren: eigenes <main> und h1,
 * ein Weg zurück zur Startseite und die Pflichtlinks.
 */
export function AuthSeite({
  titel,
  beschreibung,
  vorteile,
  children
}: {
  titel: string;
  beschreibung: string;
  vorteile?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-6 p-4'>
      <div className='w-full max-w-sm space-y-4'>
        <Link href='/' className='text-muted-foreground text-sm underline-offset-4 hover:underline'>
          ← Zur Startseite
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className='text-xl font-semibold'>{titel}</h1>
            </CardTitle>
            <CardDescription>{beschreibung}</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {vorteile}
            <GoogleSignInButton />
            <div className='flex items-center gap-3'>
              <div className='bg-border h-px flex-1' />
              <span className='text-muted-foreground text-xs'>oder</span>
              <div className='bg-border h-px flex-1' />
            </div>
            {children}
          </CardContent>
        </Card>
      </div>
      <nav aria-label='Rechtliches' className='text-muted-foreground flex flex-wrap justify-center gap-4 text-xs'>
        <Link href='/impressum' className='underline-offset-4 hover:underline'>
          Impressum
        </Link>
        <Link href='/datenschutz' className='underline-offset-4 hover:underline'>
          Datenschutz
        </Link>
        <Link href='/barrierefreiheit' className='underline-offset-4 hover:underline'>
          Barrierefreiheit
        </Link>
      </nav>
    </main>
  );
}
