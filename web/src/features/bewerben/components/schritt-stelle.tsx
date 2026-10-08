import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import type { Bewerbungsplan } from '../api/types';
import { bewerbungsschlussAnzeige } from '../lib/bewerbungsschluss-anzeige';

/** Schritt 1: die Stelle, ihre Kennung und der Bewerbungsschluss. */
export function SchrittStelle({ stelle }: { stelle: Bewerbungsplan['stelle'] }) {
  return (
    <Card id='schritt-stelle' tabIndex={-1} className='scroll-mt-4 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none'>
      <CardHeader>
        <CardTitle>
          <h2>1. Die Stelle</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div>
          <p className='font-medium'>{stelle.titel}</p>
          <p className='text-muted-foreground text-sm'>
            Kennung der Ausschreibung (zum Suchen im Bewerbungsportal der Bundeswehr): {stelle.refCode}
          </p>
          <p className='text-muted-foreground text-sm'>
            Bewerbungsschluss: {bewerbungsschlussAnzeige(stelle)}
          </p>
        </div>
        {!stelle.aktiv && (
          <Alert variant='destructive'>
            <Icons.warning aria-hidden='true' />
            <AlertTitle>Diese Ausschreibung ist nicht mehr aktuell.</AlertTitle>
            <AlertDescription>
              Der Bewerbungsschluss ist vorbei oder die Stelle wurde zurückgezogen. Eine Bewerbung ist nicht mehr
              möglich, deshalb sind die restlichen Schritte gesperrt.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
