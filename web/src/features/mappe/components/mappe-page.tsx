import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { LandingFooter } from '@/features/landing/components/landing-footer';
import { LandingHeader } from '@/features/landing/components/landing-header';
import type { MappenAnsicht } from '../api/mappe-server';
import { MappeDokumente } from './upload-feld';

/**
 * Ein Satz für "abgelaufen" ODER "unbekannt" - beides sieht ein Bewerber als
 * "der Link geht nicht mehr". Bewusst OHNE die Kennung: die steht schon in der
 * URL, sie hier zu wiederholen hilft niemandem und sieht nach Fehlermeldung
 * für Entwickler aus, nicht für Bewerber.
 */
function NichtVerfuegbar({ grund }: { grund: 'abgelaufen' | 'unbekannt' }) {
  return (
    <div className='min-h-screen'>
      <LandingHeader />
      <main className='mx-auto max-w-xl px-4 py-20 text-center'>
        <h1 className='font-serif text-2xl font-bold tracking-tight'>
          Dieser Link geht nicht mehr
        </h1>
        <p className='text-muted-foreground mt-4'>
          {grund === 'abgelaufen'
            ? 'Die hier abgelegten Dateien sind schon gelöscht. Das passiert automatisch eine Stunde nach der letzten Änderung. Lass dir über deine KI eine neue Mappe anlegen, wenn du weiter an dieser Bewerbung arbeiten willst.'
            : 'Unter dieser Adresse liegt keine Bewerbungsmappe. Vielleicht ist beim Kopieren etwas verloren gegangen. Lass dir den Link am besten noch einmal von deiner KI geben.'}
        </p>
      </main>
      <LandingFooter />
    </div>
  );
}

export function MappePage({ mappenId, mappe }: { mappenId: string; mappe: MappenAnsicht | null }) {
  if (!mappe) return <NichtVerfuegbar grund='unbekannt' />;
  if (mappe.abgelaufen) return <NichtVerfuegbar grund='abgelaufen' />;

  return (
    <div className='min-h-screen'>
      <LandingHeader />
      <main className='mx-auto max-w-2xl space-y-10 px-4 py-12 md:px-6'>
        <div>
          <p className='text-muted-foreground text-sm'>Unterlagen für deine Bewerbung</p>
          <h1 className='font-serif text-2xl font-bold tracking-tight'>{mappe.titel}</h1>
          <p className='text-muted-foreground text-sm'>Ausschreibung {mappe.refCode}</p>
        </div>

        {/*
          Die Einwilligung steht sichtbar über den Feldern, nicht in einer
          Fußnote und nicht in einem Aufklapper - bevor die erste Datei fliegt.
          Ausweiskopien nehmen wir gar nicht an - der Absatz sagt das, statt
          um eine Einwilligung zu bitten.

          role wird auf 'region' überschrieben (Alert setzt sonst role='alert',
          was implizit aria-live="assertive" bedeutet - ein mehrere Absätze
          langer Einwilligungstext würde Screenreadern beim Laden ungefragt
          und unterbrechend vorgelesen. 'region' + aria-label macht daraus nur
          einen navigierbaren Bereich, ohne alert.tsx selbst anzufassen - das
          ist eine geteilte Komponente für die ganze App).
        */}
        <Alert role='region' aria-label='Wichtiger Hinweis zur Datenverarbeitung'>
          <Icons.lock aria-hidden='true' />
          <AlertDescription className='text-foreground gap-3 text-sm'>
            <p>
              <strong>Was hier passiert.</strong> Die Dateien, die du hier ablegst, liegen bei uns,
              bis dein Paket gebaut ist, und werden{' '}
              <strong>eine Stunde danach automatisch gelöscht</strong>, spätestens eine Stunde nach
              der letzten Änderung. Es gibt kein Konto und keine dauerhafte Speicherung. Wir geben
              die Dateien an niemanden weiter, insbesondere an keine KI. Wer diesen Link hat, kann
              die Dateien sehen. Teile ihn also nicht.
            </p>
            <p>
              <strong>Bitte keine Ausweiskopie.</strong> Die nehmen wir nicht entgegen. Verlangt
              die Ausschreibung eine Kopie deines Personalausweises, lege sie deiner Bewerbung
              selbst bei.
            </p>
            <p>
              Mit dem Ablegen einer Datei stimmst du dieser Verarbeitung zu (Art. 6 Abs. 1 lit. a
              DSGVO). Details:{' '}
              <Link href='/datenschutz' className='underline underline-offset-4'>
                Datenschutz
              </Link>
              .
            </p>
          </AlertDescription>
        </Alert>

        <MappeDokumente mappenId={mappenId} dokumente={mappe.dokumente} />
      </main>
      <LandingFooter />
    </div>
  );
}
