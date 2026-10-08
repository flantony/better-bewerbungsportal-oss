import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EYEBROW_CLASSNAME } from '@/lib/eyebrow';
import { LastChance } from './last-chance';

/**
 * Startseite. Zeigt bewusst nichts Personalisiertes, nur die beiden Wege in
 * die oeffentlichen Daten.
 */
export function OverviewContent() {
  return (
    <div className='flex flex-1 flex-col space-y-6'>
      <h1 className='font-serif text-2xl font-bold tracking-tight'>Bundeswehr-Ausschreibungen</h1>

      <LastChance />

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardDescription className={EYEBROW_CLASSNAME}>Alle Ausschreibungen</CardDescription>
            <CardTitle className='text-xl font-semibold'>Durchsuchen</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant='outline'
              size='sm'
              nativeButton={false}
              render={<Link href='/dashboard/jobs' aria-label='Stellenangebote öffnen' />}
            >
              Stellenangebote öffnen
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className={EYEBROW_CLASSNAME}>Mit deiner KI</CardDescription>
            <CardTitle className='text-xl font-semibold'>Anbinden</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant='outline'
              size='sm'
              nativeButton={false}
              render={<Link href='/dashboard/ki' aria-label='KI-Anbindung einrichten' />}
            >
              Einrichten
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
