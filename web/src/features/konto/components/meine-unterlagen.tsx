'use client';

import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { kontoKeys, kontoUnterlagenQueryOptions } from '../api/queries';
import {
  holeUnterlageDownloadUrl,
  holeUnterlageUploadUrl,
  loescheUnterlage,
  registriereUnterlage
} from '../api/service';
import {
  MAX_DATEI_BYTES,
  MAX_UNTERLAGEN,
  MAX_UNTERLAGEN_BYTES,
  type UnterlageArt,
  type UnterlageSicht
} from '../api/types';
import { formatBytes } from '../lib/format-bytes';
import { pruefeUnterlageVorAuswahl } from '../lib/unterlage-pruefung';

const ART_LABEL: Record<UnterlageArt, string> = {
  lebenslauf: 'Lebenslauf',
  zeugnis: 'Zeugnis',
  sonstiges: 'Sonstiges'
};

function formatiereDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE');
}

/**
 * Bereich „Meine Unterlagen" auf „Mein Konto". Eigene Query (eigener
 * Endpunkt) - ohne `kontoUnterlagen` vom Server (404, s. lib/nicht-verfuegbar.ts)
 * zeigt der Bereich nichts, statt die Seite abzubrechen.
 */
export function MeineUnterlagen() {
  const user = useAuthUser();
  const unterlagenQuery = useQuery({ ...kontoUnterlagenQueryOptions(user?.uid ?? ''), enabled: Boolean(user) });

  if (unterlagenQuery.isPending) return <p className='text-muted-foreground text-sm'>Lädt deine Unterlagen…</p>;
  if (unterlagenQuery.isError) return <p className='text-destructive text-sm'>{unterlagenQuery.error.message}</p>;
  if (unterlagenQuery.data === 'nicht-verfuegbar') return null;

  return <UnterlagenSektion unterlagen={unterlagenQuery.data} />;
}

function UnterlagenSektion({ unterlagen }: { unterlagen: UnterlageSicht[] }) {
  const user = useAuthUser();
  const queryClient = useQueryClient();
  // Ganzer Konto-Ast statt nur des eigenen Schluessels: der Bewerbungsplan
  // (kontoKeys.bewerbungsplan) haengt an Angaben UND Unterlagen und waere sonst veraltet.
  const invalidieren = () => queryClient.invalidateQueries({ queryKey: kontoKeys.detail(user?.uid ?? '') });

  const bestand = {
    anzahl: unterlagen.length,
    bytes: unterlagen.reduce((summe, u) => summe + u.sizeBytes, 0)
  };

  return (
    <Card id='meine-unterlagen'>
      <CardHeader>
        <CardTitle>
          <h2>Meine Unterlagen</h2>
        </CardTitle>
        <CardDescription>
          Bis zu {MAX_UNTERLAGEN} Dateien, insgesamt höchstens {MAX_UNTERLAGEN_BYTES / 1024 / 1024} MB, jede
          Datei höchstens {MAX_DATEI_BYTES / 1024 / 1024} MB. Erlaubt sind PDF, JPEG und PNG.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-8'>
        {unterlagen.length > 0 && (
          <div className='space-y-2'>
            <h3 className='text-sm font-medium'>
              Schon abgelegt - {unterlagen.length} {unterlagen.length === 1 ? 'Datei' : 'Dateien'}
            </h3>
            <div className='space-y-2'>
              {unterlagen.map((u) => (
                <UnterlageZeile key={u.docId} unterlage={u} onGeaendert={invalidieren} />
              ))}
            </div>
          </div>
        )}

        <div className='space-y-6'>
          <h3 className='text-sm font-medium'>Datei hinzufügen</h3>
          <UnterlagenUploadFeld art='lebenslauf' label='Lebenslauf' bestand={bestand} onHochgeladen={invalidieren} />
          <UnterlagenUploadFeld
            art='zeugnis'
            label='Zeugnis'
            beschreibung='Schul-, Ausbildungs- oder Arbeitszeugnis, bei Bedarf mehrere Dateien.'
            bestand={bestand}
            onHochgeladen={invalidieren}
          />
          <UnterlagenUploadFeld art='sonstiges' label='Sonstiges' bestand={bestand} onHochgeladen={invalidieren} />
          <p className='text-muted-foreground text-sm'>
            Ausweiskopien nehmen wir nicht entgegen. Lade bitte auch unter „Sonstiges" keine hoch.
            Verlangt eine Ausschreibung eine Kopie deines Personalausweises, lege sie deiner
            Bewerbung selbst bei.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Exportiert: „Früher gespeicherte Angaben und Unterlagen" zeigt dieselbe Zeile (Herunterladen, Löschen). */
export function UnterlageZeile({
  unterlage,
  onGeaendert
}: {
  unterlage: UnterlageSicht;
  onGeaendert: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);

  const herunterladenMutation = useMutation({
    mutationFn: () => holeUnterlageDownloadUrl(unterlage.docId),
    onSuccess: (url) => {
      // Nur lokal fuer diese eine Navigation genutzt, nicht gespeichert - der
      // Server setzt Content-Disposition: attachment, der Browser laedt die
      // Datei herunter statt die Seite zu verlassen.
      window.location.href = url;
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  const loeschenMutation = useMutation({
    mutationFn: () => loescheUnterlage(unterlage.docId),
    onSuccess: async () => {
      setOpen(false);
      await onGeaendert();
      toast.success('Gelöscht.');
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  return (
    <div className='rounded-md border p-2 text-sm'>
      <div className='flex items-center gap-3'>
        <Icons.page className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden='true' />
        <div className='min-w-0 flex-1'>
          <p className='truncate' title={unterlage.dateiname}>
            {unterlage.dateiname}
          </p>
          <p className='text-muted-foreground text-xs'>
            {ART_LABEL[unterlage.art]} · {formatBytes(unterlage.sizeBytes)} · {formatiereDatum(unterlage.hochgeladenAm)}
          </p>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-11'
          aria-label={`${unterlage.dateiname} herunterladen`}
          disabled={herunterladenMutation.isPending}
          isLoading={herunterladenMutation.isPending}
          onClick={() => herunterladenMutation.mutate()}
        >
          <Icons.download className='h-4 w-4' />
        </Button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            render={
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-11'
                aria-label={`${unterlage.dateiname} löschen`}
              >
                <Icons.trash className='h-4 w-4' />
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Diese Datei wirklich löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                „{unterlage.dateiname}" wird sofort gelöscht. Das lässt sich nicht rückgängig machen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => loeschenMutation.mutate()}
                disabled={loeschenMutation.isPending}
                className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              >
                {loeschenMutation.isPending ? 'Wird gelöscht…' : 'Endgültig löschen'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function UnterlagenUploadFeld({
  art,
  label,
  beschreibung,
  bestand,
  onHochgeladen
}: {
  art: UnterlageArt;
  label: string;
  beschreibung?: string;
  bestand: { anzahl: number; bytes: number };
  onHochgeladen: () => Promise<unknown>;
}) {
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  async function hochladen(datei: File) {
    setFehler(null);
    const vorabPruefung = pruefeUnterlageVorAuswahl({ art, contentType: datei.type, sizeBytes: datei.size }, bestand);
    if (!vorabPruefung.ok) {
      setFehler(vorabPruefung.fehler);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setLaedt(true);
    try {
      const antwortUrl = await holeUnterlageUploadUrl({
        art,
        dateiname: datei.name,
        contentType: datei.type,
        sizeBytes: datei.size
      });

      // WICHTIG: der Header muss GENAU so mitgehen, wie er zurueckkam - sonst
      // lehnt Google den Upload mit einem Signaturfehler ab (s.
      // mappe/components/upload-feld.tsx, derselbe Ablauf).
      const putAntwort = await fetch(antwortUrl.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': datei.type, ...antwortUrl.pflichtHeader },
        body: datei
      });
      if (!putAntwort.ok) {
        setFehler('Die Datei kam nicht an. Bitte versuch es noch einmal.');
        return;
      }

      await registriereUnterlage(antwortUrl.docId);
      toast.success('Hochgeladen.');
      await onHochgeladen();
    } catch (fehlerObjekt) {
      // Ein TypeError heisst: der Browser hat gar keine Antwort bekommen (Netz
      // weg, CORS) - seine englische Meldung ("Failed to fetch") hilft niemandem.
      setFehler(
        fehlerObjekt instanceof TypeError
          ? 'Die Verbindung ist abgebrochen. Prüf deine Internetverbindung und versuch es noch einmal.'
          : fehlerObjekt instanceof Error
            ? fehlerObjekt.message
            : 'Das hat nicht geklappt. Bitte versuch es noch einmal.'
      );
    } finally {
      setLaedt(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

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
          aria-describedby={fehler ? `${inputId}-fehler` : undefined}
          onChange={(ereignis) => {
            const datei = ereignis.target.files?.[0];
            if (datei) void hochladen(datei);
          }}
        />
        <p aria-live='polite' className='sr-only'>
          {laedt ? 'Lädt hoch …' : ''}
        </p>
        {fehler && (
          <p id={`${inputId}-fehler`} role='alert' className='text-destructive text-sm'>
            {fehler}
          </p>
        )}
      </FieldContent>
    </Field>
  );
}
