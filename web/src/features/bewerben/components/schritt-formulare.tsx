'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Icons } from '@/components/icons';
import { Label } from '@/components/ui/label';
import type { FormularPlan, VordruckZumSelbstAusfuellen } from '../api/types';
import { formularLueckenStand, KERN_LUECKEN_SATZ } from '../lib/formular-luecken';
import { formularAnzeigeTitel } from '../lib/formular-titel';

interface Props {
  pinstGuid: string;
  formulare: FormularPlan[];
  hinweise: string[];
  /** Vordrucke, die der Bewerber selbst ausfuellt (optional in der Serverantwort). */
  selbstAuszufuellen?: VordruckZumSelbstAusfuellen[];
  ausgewaehlt: string[];
  onToggle: (docId: string) => void;
  luekenAkzeptiert: boolean;
  onLuekenAkzeptiertChange: (wert: boolean) => void;
  gesperrt: boolean;
}

/**
 * Schritt 2: je Bogen einer von drei Texten - "wir füllen das
 * für dich aus" (ausfuellbar, alle Angaben da), "es fehlen noch: …" mit Link
 * zu "Meine Angaben", oder "diesen Vordruck füllst du selbst aus" (nicht
 * ausfuellbar). Der Plan traegt keine Download-URL fuer den Blanko-Vordruck
 * (nur `docId`/`titel`) - der Link zeigt deshalb auf den Dokumente-Bereich
 * der Detailseite statt eine eigene URL zu erfinden.
 */
export function SchrittFormulare({
  pinstGuid,
  formulare,
  hinweise,
  selbstAuszufuellen = [],
  ausgewaehlt,
  onToggle,
  luekenAkzeptiert,
  onLuekenAkzeptiertChange,
  gesperrt
}: Props) {
  const luekenId = useId();
  const { mitLuecken, kernLuecken } = formularLueckenStand(formulare, ausgewaehlt, luekenAkzeptiert);

  return (
    <Card
      id='schritt-formulare'
      tabIndex={-1}
      className='scroll-mt-4 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none'
    >
      <CardHeader>
        <CardTitle>
          <h2>2. Formulare</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {gesperrt ? (
          <GesperrtHinweis />
        ) : (
          <>
            {hinweise.map((hinweis, i) => (
              <p key={i} className='text-muted-foreground text-sm'>
                {hinweis}
              </p>
            ))}

            {formulare.length === 0 && (
              <p className='text-muted-foreground text-sm'>Für diese Ausschreibung liegt kein Bewerbungsbogen vor.</p>
            )}

            <div className='space-y-3'>
              {formulare.map((formular) => (
                <FormularZeile key={formular.docId} formular={formular} pinstGuid={pinstGuid} ausgewaehlt={ausgewaehlt.includes(formular.docId)} onToggle={() => onToggle(formular.docId)} />
              ))}
            </div>

            {kernLuecken && (
              <div className='space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3'>
                <p className='text-sm'>{KERN_LUECKEN_SATZ}</p>
                <Link href='/dashboard/konto#meine-angaben' className='text-sm text-primary underline underline-offset-4'>
                  Zu Meine Angaben
                </Link>
              </div>
            )}

            {mitLuecken && !kernLuecken && (
              <div className='flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3'>
                <Checkbox
                  id={luekenId}
                  className='mt-0.5'
                  checked={luekenAkzeptiert}
                  onCheckedChange={(gehakt) => onLuekenAkzeptiertChange(gehakt === true)}
                />
                <Label htmlFor={luekenId} className='items-start text-sm leading-snug font-normal'>
                  Ich trage die fehlenden Angaben selbst von Hand ein.
                </Label>
              </div>
            )}

            {selbstAuszufuellen.length > 0 && <SelbstAuszufuellen vordrucke={selbstAuszufuellen} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * "Anlage 1 zum Bewerbungsbogen" gehört zur Bewerbung, liegt aber nie ausgefüllt im Paket (sie fragt nach Mitgliedschaften
 * in Parteien und Vereinigungen - das füllen wir nicht aus).
 */
function SelbstAuszufuellen({ vordrucke }: { vordrucke: VordruckZumSelbstAusfuellen[] }) {
  return (
    <div className='space-y-2'>
      <h4 className='text-sm font-medium'>Selbst ausfüllen und unterschreiben</h4>
      <p className='text-muted-foreground text-sm'>
        Diese Vordrucke gehören zur Bewerbung, aber wir füllen sie nicht aus und sie liegen nicht im Paket. Lade sie
        herunter, fülle sie von Hand aus, unterschreibe sie und reiche sie mit der Bewerbung ein.
      </p>
      <ul className='list-disc space-y-1 pl-5 text-sm'>
        {vordrucke.map((vordruck) => (
          <li key={vordruck.downloadUrl}>
            <a
              href={vordruck.downloadUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary underline underline-offset-4'
            >
              {formularAnzeigeTitel(vordruck.titel)}
              <span className='sr-only'> (PDF, öffnet in neuem Tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormularZeile({
  formular,
  pinstGuid,
  ausgewaehlt,
  onToggle
}: {
  formular: FormularPlan;
  pinstGuid: string;
  ausgewaehlt: boolean;
  onToggle: () => void;
}) {
  const checkboxId = useId();

  return (
    <div className='rounded-md border p-3'>
      <div className='flex items-start gap-3'>
        {formular.ausfuellbar && (
          <Checkbox id={checkboxId} className='mt-0.5' checked={ausgewaehlt} onCheckedChange={onToggle} />
        )}
        <div className='min-w-0 flex-1 space-y-1'>
          {formular.ausfuellbar ? (
            <Label htmlFor={checkboxId} className='block text-sm font-medium'>
              {formularAnzeigeTitel(formular.titel)}
            </Label>
          ) : (
            <p className='text-sm font-medium'>{formularAnzeigeTitel(formular.titel)}</p>
          )}

          {formular.ausfuellbar ? (
            formular.fehlendeAngaben.length === 0 ? (
              <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
                <Icons.circleCheck className='h-4 w-4 text-primary' aria-hidden='true' />
                Wir füllen das für dich aus.
              </p>
            ) : (
              <div className='space-y-1'>
                <p className='text-sm text-muted-foreground'>Es fehlen noch: {formular.fehlendeAngaben.join(', ')}.</p>
                <Link href='/dashboard/konto#meine-angaben' className='text-sm text-primary underline underline-offset-4'>
                  Zu Meine Angaben
                </Link>
              </div>
            )
          ) : (
            <div className='space-y-1'>
              <p className='text-sm text-muted-foreground'>Diesen Vordruck füllst du selbst aus.</p>
              <Link
                href={`/dashboard/jobs/${pinstGuid}#dokumente`}
                className='inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4'
              >
                <Icons.download className='h-3.5 w-3.5' aria-hidden='true' />
                Blanko-Vordruck in den Dokumenten der Ausschreibung
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GesperrtHinweis() {
  return (
    <p className='text-muted-foreground text-sm'>
      Gesperrt, weil diese Ausschreibung nicht mehr aktuell ist.
    </p>
  );
}
