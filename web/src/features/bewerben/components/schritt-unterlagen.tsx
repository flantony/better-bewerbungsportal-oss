'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Icons } from '@/components/icons';
import { Label } from '@/components/ui/label';
import type { AblageEintrag } from '../api/types';

const ART_LABEL: Record<string, string> = {
  lebenslauf: 'Lebenslauf',
  zeugnis: 'Zeugnis',
  sonstiges: 'Sonstiges'
};

interface Props {
  geforderteUnterlagen: string[];
  /** Fertiger Satz vom Server, nur wenn die Ausschreibung eine Ausweiskopie verlangt - nie hier nachbauen. */
  ausweiskopieHinweis?: string;
  ablage: AblageEintrag[];
  ausgewaehlt: string[];
  onToggle: (docId: string) => void;
  gesperrt: boolean;
}

/** Schritt 3: geforderte Unterlagen aus der Ausschreibung + Auswahl aus der eigenen Ablage. */
export function SchrittUnterlagen({
  geforderteUnterlagen,
  ausweiskopieHinweis,
  ablage,
  ausgewaehlt,
  onToggle,
  gesperrt
}: Props) {
  return (
    <Card
      id='schritt-unterlagen'
      tabIndex={-1}
      className='scroll-mt-4 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none'
    >
      <CardHeader>
        <CardTitle>
          <h2>3. Unterlagen</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {gesperrt ? (
          <p className='text-muted-foreground text-sm'>Gesperrt, weil diese Ausschreibung nicht mehr aktuell ist.</p>
        ) : (
          <>
            <div className='space-y-1'>
              <h3 className='text-sm font-medium'>Geforderte Unterlagen</h3>
              {geforderteUnterlagen.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  Die Ausschreibung nennt keine eigene Unterlagenliste.
                </p>
              ) : (
                <ul className='list-disc space-y-1 pl-5 text-sm'>
                  {geforderteUnterlagen.map((eintrag, i) => (
                    <li key={i}>{eintrag}</li>
                  ))}
                </ul>
              )}
              {ausweiskopieHinweis && <p className='text-sm'>{ausweiskopieHinweis}</p>}
            </div>

            <div className='space-y-2'>
              <h3 className='text-sm font-medium'>Aus deiner Ablage beilegen</h3>
              {ablage.length === 0 ? (
                <p className='text-muted-foreground text-sm'>Du hast noch keine Unterlage in deinem Konto abgelegt.</p>
              ) : (
                <div className='space-y-2'>
                  {ablage.map((eintrag) => (
                    <UnterlageZeile
                      key={eintrag.docId}
                      eintrag={eintrag}
                      ausgewaehlt={ausgewaehlt.includes(eintrag.docId)}
                      onToggle={() => onToggle(eintrag.docId)}
                    />
                  ))}
                </div>
              )}
              <Link
                href='/dashboard/konto#meine-unterlagen'
                className='inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4'
              >
                <Icons.upload className='h-3.5 w-3.5' aria-hidden='true' />
                Weitere Unterlage hochladen
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UnterlageZeile({
  eintrag,
  ausgewaehlt,
  onToggle
}: {
  eintrag: AblageEintrag;
  ausgewaehlt: boolean;
  onToggle: () => void;
}) {
  const checkboxId = useId();
  return (
    <div className='flex items-center gap-3 rounded-md border p-2 text-sm'>
      <Checkbox id={checkboxId} checked={ausgewaehlt} onCheckedChange={onToggle} />
      <Label htmlFor={checkboxId} className='flex-1 font-normal'>
        {eintrag.dateiname} <span className='text-muted-foreground'>({ART_LABEL[eintrag.art] ?? eintrag.art})</span>
      </Label>
    </div>
  );
}
