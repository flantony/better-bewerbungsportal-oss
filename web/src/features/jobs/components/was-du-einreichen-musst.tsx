import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import {
  AUSWEISKOPIE_HINWEIS,
  BEWERBUNGSPORTAL_URL,
  EINREICHEN_ANKER,
  type EinreichAnhang,
  type Einreichliste
} from '../lib/einreichliste';

/** Macht die Portaladresse in einem Einreich-Schritt klickbar. */
function mitPortalLink(satz: string): ReactNode {
  const [vorher, ...rest] = satz.split(BEWERBUNGSPORTAL_URL);
  if (rest.length === 0) return satz;
  return (
    <>
      {vorher}
      <a href={BEWERBUNGSPORTAL_URL} target='_blank' rel='noopener noreferrer' className='underline underline-offset-4'>
        {BEWERBUNGSPORTAL_URL}
      </a>
      {rest.join(BEWERBUNGSPORTAL_URL)}
    </>
  );
}

function FormularLink({ anhang }: { anhang: EinreichAnhang }) {
  return (
    <a
      href={anhang.downloadUrl}
      target='_blank'
      rel='noopener noreferrer'
      className='hover:bg-accent flex items-center gap-2 rounded-md border p-2 text-sm'
    >
      <Icons.fileTypePdf className='h-4 w-4 shrink-0' aria-hidden='true' />
      <span className='min-w-0 flex-1 break-words'>{anhang.attHeader}</span>
      <Icons.download className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden='true' />
    </a>
  );
}

/**
 * „Was du einreichen musst" - für alle, ohne KI und ohne Konto. Inhalt aus `einreichlisteFuer`, dem Spiegel der Logik von
 * `get_document_requirements`; die Checkliste ist derselbe Inhalt als
 * Textdatei. Die Datei entsteht hier auf dem Server und geht als data:-Link
 * hinaus - kein Abruf, nichts wird gespeichert.
 */
export function WasDuEinreichenMusst({
  liste,
  checkliste,
  dateiname
}: {
  liste: Einreichliste;
  checkliste: string;
  dateiname: string;
}) {
  const formulare = [...liste.bewerbungsboegen, ...liste.selbstAuszufuellen];
  return (
    <Card id={EINREICHEN_ANKER} className='min-w-0 scroll-mt-20'>
      <CardHeader>
        <CardTitle>
          <h2 className='text-base'>Was du einreichen musst</h2>
        </CardTitle>
        <CardDescription>
          Unterlagen, Formulare und der Weg zum Einreichen. Dafür brauchst du weder KI noch Konto.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-6 text-sm'>
        <div className='space-y-2'>
          <h3 className='font-medium'>Unterlagen</h3>
          {liste.unterlagen.length > 0 && (
            <ul className='list-disc space-y-1 pl-5'>
              {liste.unterlagen.map((unterlage) => (
                <li key={unterlage}>{unterlage}</li>
              ))}
            </ul>
          )}
          {liste.unterlagenHinweis && <p>{liste.unterlagenHinweis}</p>}
          {liste.ausweiskopieSelbstBeilegen && <p>{AUSWEISKOPIE_HINWEIS}</p>}
          {liste.formaleHinweise && <p className='text-muted-foreground'>Formale Hinweise: {liste.formaleHinweise}</p>}
        </div>

        <div className='space-y-2'>
          <h3 className='font-medium'>Formulare ausfüllen und unterschreiben</h3>
          {formulare.length > 0 && (
            <>
              <p>Lade sie herunter, fülle sie aus, unterschreibe sie und reiche sie mit der Bewerbung ein.</p>
              <div className='space-y-2'>
                {formulare.map((anhang) => (
                  <FormularLink key={`${anhang.attHeader}|${anhang.downloadUrl}`} anhang={anhang} />
                ))}
              </div>
            </>
          )}
          {liste.vordruckHinweis && <p>{liste.vordruckHinweis}</p>}
          {liste.bogenHinweis && <p>{liste.bogenHinweis}</p>}
          {liste.weitereDateien.length > 0 && (
            <p className='text-muted-foreground'>
              Weitere Dateien der Ausschreibung stehen unten unter „Dokumente“. Ob eine davon ausgefüllt
              mitgeschickt werden muss, können wir nicht sicher sagen. Prüf das bitte selbst.
            </p>
          )}
        </div>

        <div className='space-y-2'>
          <h3 className='font-medium'>Einreichen</h3>
          <p>Die Bewerbung reichst du selbst bei der Bundeswehr ein:</p>
          <ol className='list-decimal space-y-1 pl-5'>
            {liste.einreichen.map((schritt) => (
              <li key={schritt}>{mitPortalLink(schritt)}</li>
            ))}
          </ol>
          <p className='text-muted-foreground'>Bei Fragen: die in der Ausschreibung genannte Ansprechperson.</p>
        </div>

        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(checkliste)}`}
          download={dateiname}
          className={buttonVariants({ variant: 'outline' })}
        >
          <Icons.download className='h-4 w-4' aria-hidden='true' />
          Checkliste herunterladen
        </a>
      </CardContent>
    </Card>
  );
}
