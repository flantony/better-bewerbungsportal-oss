'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { FUNCTIONS_BASE_URL } from '@/config/functions';
import type { MappenDokumentAnsicht } from '../api/mappe-server';

/** Die Arten, die diese Seite als eigenes Feld anbietet. "formular" entsteht automatisch über die KI, nicht per Upload. */
export type HochladbareArt = 'anschreiben' | 'lebenslauf' | 'zeugnis' | 'sonstiges';

const ART_LABEL: Record<string, string> = {
  anschreiben: 'Anschreiben',
  lebenslauf: 'Lebenslauf',
  zeugnis: 'Zeugnis',
  formular: 'Bewerbungsbogen (von deiner KI ausgefüllt)',
  sonstiges: 'Sonstiges'
};

function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Antwortformen der drei Cloud Functions aus `functions/src/mappeHttp.ts`.
 * Kein Zod hier (v3/v4-Skew zwischen den Paketen web/ und functions/)
 * - nur die Feldnamen von Hand nachgezogen, damit `res.json()` nicht als `any`
 * durchsickert und ein Tippfehler wie `pflichtHeader` beim Bauen auffällt.
 */
interface MappeUploadUrlAntwort {
  docId: string;
  uploadUrl: string;
  storagePath: string;
  pflichtHeader: Record<string, string>;
  fehler?: string;
}

interface MappeFehlerAntwort {
  ok?: boolean;
  fehler?: string;
}

type Status = { status: 'idle' } | { status: 'laedt' } | { status: 'fehler'; meldung: string };

interface UploadFeldProps {
  mappenId: string;
  art: HochladbareArt;
  label: string;
  beschreibung?: string;
  onHochgeladen: () => void;
}

/**
 * Ein Datei-Upload in drei Schritten: signierte URL holen, direkt zu Storage
 * hochladen, dann registrieren. Keine Datei läuft durch eine Function.
 */
export function UploadFeld({
  mappenId,
  art,
  label,
  beschreibung,
  onHochgeladen
}: UploadFeldProps) {
  const [zustand, setZustand] = useState<Status>({ status: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  async function hochladen(datei: File) {
    setZustand({ status: 'laedt' });
    try {
      const antwortUrl: MappeUploadUrlAntwort = await fetch(
        `${FUNCTIONS_BASE_URL}/mappeUploadUrl`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mappenId,
            dateiname: datei.name,
            contentType: datei.type,
            sizeBytes: datei.size
          })
        }
      ).then((res) => res.json());

      if (antwortUrl.fehler) {
        setZustand({ status: 'fehler', meldung: antwortUrl.fehler });
        return;
      }

      // WICHTIG, nicht "aufräumen": mappeUploadUrl signiert die URL mit einer
      // Größenbeschränkung (x-goog-content-length-range). Der Header muss
      // GENAU so mitgehen, wie er hier zurückkam - fehlt er oder weicht er ab,
      // lehnt Google den Upload mit einem Signaturfehler ab. Jeder Upload.
      const putAntwort = await fetch(antwortUrl.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': datei.type,
          ...antwortUrl.pflichtHeader
        },
        body: datei
      });
      if (!putAntwort.ok) {
        setZustand({
          status: 'fehler',
          meldung: 'Die Datei kam nicht an. Bitte versuch es noch einmal.'
        });
        return;
      }

      // Größe wird bewusst nicht mitgeschickt: der Server liest sie selbst aus
      // dem Bucket nach, dem Client wird sie nicht geglaubt.
      const antwortRegister: MappeFehlerAntwort = await fetch(
        `${FUNCTIONS_BASE_URL}/mappeRegisterDocument`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mappenId,
            docId: antwortUrl.docId,
            art,
            dateiname: datei.name,
            contentType: datei.type
          })
        }
      ).then((res) => res.json());

      if (antwortRegister.fehler) {
        setZustand({ status: 'fehler', meldung: antwortRegister.fehler });
        return;
      }

      setZustand({ status: 'idle' });
      toast.success(`${datei.name} liegt in der Mappe.`);
      onHochgeladen();
    } catch {
      setZustand({
        status: 'fehler',
        meldung: 'Das hat nicht geklappt. Bitte versuch es noch einmal.'
      });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const laedt = zustand.status === 'laedt';

  return (
    <Field>
      <FieldContent>
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
        {beschreibung && <FieldDescription>{beschreibung}</FieldDescription>}
        <Input
          id={inputId}
          ref={inputRef}
          type='file'
          accept='application/pdf,image/jpeg,image/png'
          disabled={laedt}
          aria-describedby={zustand.status === 'fehler' ? `${inputId}-fehler` : undefined}
          onChange={(ereignis) => {
            const datei = ereignis.target.files?.[0];
            if (datei) void hochladen(datei);
          }}
        />
        <p aria-live='polite' className='sr-only'>
          {laedt ? 'Lädt hoch …' : ''}
        </p>
        {zustand.status === 'fehler' && (
          <p id={`${inputId}-fehler`} role='alert' className='text-destructive text-sm'>
            {zustand.meldung}
          </p>
        )}
      </FieldContent>
    </Field>
  );
}

const CHECKLISTE: { art: HochladbareArt; label: string; beschreibung: string }[] = [
  { art: 'anschreiben', label: 'Anschreiben', beschreibung: 'Dein Motivationsschreiben.' },
  { art: 'lebenslauf', label: 'Lebenslauf', beschreibung: 'Tabellarischer Lebenslauf.' },
  {
    art: 'zeugnis',
    label: 'Zeugnis',
    beschreibung: 'Schul-, Ausbildungs- oder Arbeitszeugnis, bei Bedarf mehrere Dateien.'
  },
  {
    art: 'sonstiges',
    label: 'Sonstiges',
    beschreibung: 'Alles andere, was zu dieser Bewerbung gehört.'
  }
];

/**
 * Der interaktive Teil der Seite: was schon abgelegt ist (mit Löschen-Knopf),
 * die Upload-Felder für Anschreiben/Lebenslauf/Zeugnis/Sonstiges. Ein Feld für
 * eine Ausweiskopie gibt es nicht - stattdessen der Hinweis, sie selbst
 * beizulegen.
 */
export function MappeDokumente({
  mappenId,
  dokumente
}: {
  mappenId: string;
  dokumente: MappenDokumentAnsicht[];
}) {
  const router = useRouter();
  const [wirdGeloescht, setWirdGeloescht] = useState<string | null>(null);
  // Fehlschlag steht zusätzlich zum Toast dauerhaft an der Dateizeile, nicht
  // nur im automatisch verschwindenden Toast - wer den verpasst, soll nicht
  // glauben, das Löschen sei geglückt, obwohl die Datei noch da ist.
  const [loeschFehler, setLoeschFehler] = useState<{ docId: string; meldung: string } | null>(null);

  async function loeschen(docId: string, dateiname: string) {
    setWirdGeloescht(docId);
    setLoeschFehler(null);
    try {
      const antwort: MappeFehlerAntwort = await fetch(`${FUNCTIONS_BASE_URL}/mappeDeleteDocument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappenId, docId })
      }).then((res) => res.json());

      if (antwort.fehler) {
        setLoeschFehler({ docId, meldung: antwort.fehler });
        toast.error(antwort.fehler);
        return;
      }
      toast.success(`${dateiname} entfernt.`);
      router.refresh();
    } catch {
      const meldung = 'Löschen hat nicht geklappt. Bitte versuch es noch einmal.';
      setLoeschFehler({ docId, meldung });
      toast.error(meldung);
    } finally {
      setWirdGeloescht(null);
    }
  }

  const vorhandeneArten = new Set(dokumente.map((dokument) => dokument.art));
  const aktualisieren = () => router.refresh();

  return (
    <div className='space-y-10'>
      {dokumente.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Schon in der Mappe</CardTitle>
            <CardDescription>
              {dokumente.length} {dokumente.length === 1 ? 'Datei' : 'Dateien'}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            {dokumente.map((dokument) => (
              <div key={dokument.docId} className='rounded-md border p-2 text-sm'>
                <div className='flex items-center gap-3'>
                  <Icons.page
                    className='text-muted-foreground h-4 w-4 shrink-0'
                    aria-hidden='true'
                  />
                  <div className='min-w-0 flex-1'>
                    <p className='truncate' title={dokument.dateiname}>
                      {dokument.dateiname}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {ART_LABEL[dokument.art] ?? dokument.art} · {formatBytes(dokument.sizeBytes)}
                    </p>
                  </div>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    // size='icon' ist 36px (size-9) - für einen zuverlässig
                    // triffbaren Lösch-Button auf einem Touchscreen auf 44px
                    // angehoben (WCAG 2.5.5).
                    className='size-11'
                    aria-label={`${dokument.dateiname} löschen`}
                    disabled={wirdGeloescht === dokument.docId}
                    isLoading={wirdGeloescht === dokument.docId}
                    onClick={() => void loeschen(dokument.docId, dokument.dateiname)}
                  >
                    <Icons.trash className='h-4 w-4' />
                  </Button>
                </div>
                {loeschFehler?.docId === dokument.docId && (
                  <p role='alert' className='text-destructive mt-2 text-xs'>
                    {loeschFehler.meldung}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className='space-y-6'>
        <h2 className='font-semibold'>Datei hinzufügen</h2>
        {CHECKLISTE.map(({ art, label, beschreibung }) => (
          <div key={art} className='flex items-start justify-between gap-3'>
            <UploadFeld
              mappenId={mappenId}
              art={art}
              label={label}
              beschreibung={beschreibung}
              onHochgeladen={aktualisieren}
            />
            {vorhandeneArten.has(art) ? (
              <Badge variant='outline' className='mt-6 shrink-0 gap-1'>
                <Icons.check className='h-3 w-3' />
                dabei
              </Badge>
            ) : (
              <Badge variant='secondary' className='text-muted-foreground mt-6 shrink-0'>
                fehlt noch
              </Badge>
            )}
          </div>
        ))}
      </div>

      <p className='text-muted-foreground text-sm'>
        Ausweiskopien nehmen wir nicht entgegen. Lade bitte auch unter „Sonstiges" keine hoch.
        Verlangt die Ausschreibung eine Kopie deines Personalausweises, lege sie deiner Bewerbung
        selbst bei.
      </p>
    </div>
  );
}
