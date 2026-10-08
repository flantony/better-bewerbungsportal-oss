'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Icons } from '@/components/icons';
import { kontoKeys } from '../api/queries';
import { setzeBenachrichtigung } from '../api/service';
import type { KontoSicht } from '../api/types';
import { useEmailBestaetigung } from '../hooks/use-email-bestaetigung';
import { benachrichtigungsZustand } from '../lib/benachrichtigungs-zustand';

const BESCHREIBUNG_ID = 'benachrichtigung-beschreibung';
const HINWEIS_ID = 'benachrichtigung-hinweis';

/**
 * Bereich „Benachrichtigungen" auf „Mein Konto", unter dem Suchprofil.
 * Der Schalter selbst bleibt gesperrt, solange `benachrichtigungsZustand`
 * nicht "bereit" liefert - die beiden Gruende dafuer (kein aktiver Filter,
 * unbestaetigte Mail) kommen als Hinweistext direkt am Schalter (per
 * `aria-describedby`), nicht als eigene Fehlermeldung irgendwo anders auf
 * der Seite. Ausschalten geht aber IMMER: eine aktive
 * Benachrichtigung darf nie daran haengen, dass z.B. die Mail inzwischen
 * unbestaetigt ist. Ohne `benachrichtigung` vom Server rendert der Bereich
 * nichts (s. benachrichtigungsZustand, 'nicht-verfuegbar').
 */
export function Benachrichtigungen({ sicht }: { sicht: KontoSicht }) {
  const queryClient = useQueryClient();
  const bestaetigung = useEmailBestaetigung();

  const zustand = benachrichtigungsZustand(sicht);

  const schalterMutation = useMutation({
    mutationFn: setzeBenachrichtigung,
    onSuccess: async (_ergebnis, aktiv) => {
      await queryClient.invalidateQueries({ queryKey: kontoKeys.all });
      toast.success(aktiv ? 'Benachrichtigungen eingeschaltet.' : 'Benachrichtigungen ausgeschaltet.');
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  async function bestaetigungUebernehmen() {
    if (!(await bestaetigung.pruefen())) return;
    await queryClient.invalidateQueries({ queryKey: kontoKeys.all });
    toast.success('E-Mail-Adresse bestätigt. Du kannst die Benachrichtigungen jetzt einschalten.');
  }

  if (zustand === 'nicht-verfuegbar' || !sicht.benachrichtigung) return null;

  const aktiv = sicht.benachrichtigung.aktiv;
  const gesperrt = zustand !== 'bereit';
  const beschreibungIds = gesperrt ? `${BESCHREIBUNG_ID} ${HINWEIS_ID}` : BESCHREIBUNG_ID;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Benachrichtigungen</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='flex items-center gap-3'>
          <Switch
            id='benachrichtigung-aktiv'
            checked={aktiv}
            disabled={(gesperrt && !aktiv) || schalterMutation.isPending}
            aria-describedby={beschreibungIds}
            aria-busy={schalterMutation.isPending}
            onCheckedChange={(checked) => schalterMutation.mutate(Boolean(checked))}
          />
          <Label htmlFor='benachrichtigung-aktiv' className='font-normal'>
            Mail bei neuen passenden Stellen
          </Label>
          {schalterMutation.isPending && (
            <Icons.spinner className='text-muted-foreground h-4 w-4 animate-spin' aria-hidden='true' />
          )}
        </div>
        <p id={BESCHREIBUNG_ID} className='text-muted-foreground text-sm'>
          Wir schreiben dir nur, wenn eine neue Stelle zu einem deiner aktiven Filter passt, höchstens einmal am Tag.
          Die gemeldeten Stellen setzen wir auch auf deine Merkliste; Stellen, die nicht mehr ausgeschrieben sind,
          verschwinden dort automatisch.
        </p>
        {zustand === 'kein-profil' && (
          <p id={HINWEIS_ID} className='text-muted-foreground text-sm'>
            Lege oben im Suchprofil mindestens einen aktiven Filter mit einer Einschränkung an, z. B. einem Bundesland oder einer Vertragsart.
          </p>
        )}
        {zustand === 'unbestaetigt' && (
          <div className='space-y-2'>
            <p id={HINWEIS_ID} className='text-muted-foreground text-sm'>
              Bestätige zuerst deine E-Mail-Adresse. Wir haben dir dazu eine Mail geschickt.
            </p>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={bestaetigung.erneutSenden}
                disabled={bestaetigung.sendet}
              >
                Bestätigungsmail erneut senden
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={bestaetigungUebernehmen}
                disabled={bestaetigung.prueft}
              >
                Ich habe bestätigt
              </Button>
            </div>
            <p role='status' className='text-sm'>
              {bestaetigung.status}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
