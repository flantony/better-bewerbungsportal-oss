'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useStore } from '@tanstack/react-form';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { kontoAngabenQueryOptions, kontoKeys } from '../api/queries';
import { loescheAngaben, speichereAngaben, widerrufeStaatsangehoerigkeit } from '../api/service';
import { ANGABEN_TEXT_VERSION, type Angaben } from '../api/types';
import { baueAngabenAnfrage } from '../lib/angaben-anfrage';
import { angabenFormularWerte, nachAngabenLoeschen } from '../lib/angaben-geloescht';

const STAATSANGEHOERIGKEIT_EINWILLIGUNG_TEXT =
  'Ich willige ein, dass meine Staatsangehörigkeit in meinem Konto gespeichert wird, damit sie in Bewerbungsformulare eingetragen werden kann. Ich kann das jederzeit widerrufen – dann wird sie sofort gelöscht.';

const HEUTE_ISO = () => new Date().toISOString().slice(0, 10);

function formatiereDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE');
}

type AngabenFormValues = Required<Angaben>;

/**
 * Bereich „Meine Angaben" auf „Mein Konto". Eigene Query (eigener Endpunkt) -
 * ohne `kontoAngabenLaden` vom Server (404, s. lib/nicht-verfuegbar.ts) zeigt der
 * Bereich nichts, statt die Seite abzubrechen.
 */
export function MeineAngaben() {
  const user = useAuthUser();
  const angabenQuery = useQuery({ ...kontoAngabenQueryOptions(user?.uid ?? ''), enabled: Boolean(user) });
  // Liegt AUSSERHALB des gekeyten Formulars: das montiert nach dem Loeschen
  // neu, ein Zustand darin waere sofort wieder weg.
  const [geloescht, setGeloescht] = useState(false);
  // Der Loeschknopf verschwindet mit dem alten Formular - der Fokus geht
  // einmalig auf die Bestaetigung im neuen, statt auf <body> zu fallen.
  const fokusNachLoeschen = useRef(false);
  const bestaetigungRef = useCallback((element: HTMLParagraphElement | null) => {
    if (element && fokusNachLoeschen.current) {
      fokusNachLoeschen.current = false;
      element.focus();
    }
  }, []);
  // Nach dem Speichern montiert das Formular mit dem frischen Stand neu (Key)
  // und der Speichern-Knopf mit ihm - der Fokus kommt auf den neuen Knopf
  // zurueck, statt auf <body> zu fallen.
  const fokusNachSpeichern = useRef(false);
  const speichernKnopfRef = useCallback((element: HTMLButtonElement | null) => {
    if (element && fokusNachSpeichern.current) {
      fokusNachSpeichern.current = false;
      element.focus();
    }
  }, []);
  // Nach dem Widerruf verschwindet der Knopf "Einwilligung widerrufen"; an seine
  // Stelle tritt die Einwilligungs-Checkbox im neu montierten Formular - dorthin
  // geht der Fokus, statt auf <body> zu fallen.
  const fokusNachWiderruf = useRef(false);
  const einwilligungRef = useCallback((element: HTMLButtonElement | null) => {
    if (element && fokusNachWiderruf.current) {
      fokusNachWiderruf.current = false;
      element.focus();
    }
  }, []);
  // Jeder neue Stand (oder Fehler) der Query verbraucht die Merker - die
  // Callback-Refs oben laufen vorher. So reisst ein spaeteres, unabhaengiges
  // Neumontieren den Fokus nicht auf "Speichern", wenn der Refetch nach dem
  // Speichern fehlschlug.
  useEffect(() => {
    fokusNachSpeichern.current = false;
    fokusNachWiderruf.current = false;
  }, [angabenQuery.dataUpdatedAt, angabenQuery.errorUpdatedAt]);

  if (angabenQuery.isPending) return <p className='text-muted-foreground text-sm'>Lädt deine Angaben…</p>;
  if (angabenQuery.isError) return <p className='text-destructive text-sm'>{angabenQuery.error.message}</p>;
  if (angabenQuery.data === 'nicht-verfuegbar') return null;

  return (
    // Key enthaelt dataUpdatedAt: nach jedem Refetch -
    // insbesondere nach Widerruf/Loeschen, s. invalidieren() unten - montiert
    // das Formular komplett neu und uebernimmt den frischen Server-Stand statt
    // laenger einen veralteten Formularwert (z.B. eine laengst widerrufene
    // Staatsangehoerigkeit) anzuzeigen. Ergaenzt, nicht ersetzt, die direkte
    // Feldkorrektur in den onSuccess-Handlern unten (die greift sofort, auch
    // wenn ein Refetch aus irgendeinem Grund ausbleibt oder verzoegert ist).
    <AngabenFormular
      key={`${user?.uid}-${angabenQuery.dataUpdatedAt}`}
      sicht={angabenQuery.data}
      userEmail={user?.email ?? null}
      geloescht={geloescht}
      bestaetigungRef={bestaetigungRef}
      speichernKnopfRef={speichernKnopfRef}
      einwilligungRef={einwilligungRef}
      onWiderrufen={() => {
        fokusNachSpeichern.current = false;
        fokusNachWiderruf.current = true;
      }}
      onGeloescht={() => {
        fokusNachSpeichern.current = false;
        fokusNachLoeschen.current = true;
        setGeloescht(true);
      }}
      onGespeichert={() => {
        fokusNachSpeichern.current = true;
        setGeloescht(false);
      }}
    />
  );
}

function AngabenFormular({
  sicht,
  userEmail,
  geloescht,
  bestaetigungRef,
  speichernKnopfRef,
  einwilligungRef,
  onWiderrufen,
  onGeloescht,
  onGespeichert
}: {
  sicht: { angaben: Angaben; staatsangehoerigkeitEingewilligtAm: string | null };
  userEmail: string | null;
  geloescht: boolean;
  bestaetigungRef: (element: HTMLParagraphElement | null) => void;
  speichernKnopfRef: (element: HTMLButtonElement | null) => void;
  einwilligungRef: (element: HTMLButtonElement | null) => void;
  onWiderrufen: () => void;
  onGeloescht: () => void;
  onGespeichert: () => void;
}) {
  const queryClient = useQueryClient();
  const user = useAuthUser();
  // Ganzer Konto-Ast statt nur des eigenen Schluessels: der Bewerbungsplan
  // (kontoKeys.bewerbungsplan) haengt an Angaben UND Unterlagen und waere sonst veraltet.
  const invalidieren = () => queryClient.invalidateQueries({ queryKey: kontoKeys.detail(user?.uid ?? '') });

  // Nie vorbelegt (Art. 9 Abs. 2 lit. a DSGVO) - wird nach jedem Speichern
  // wieder zurueckgesetzt (s. onSuccess), unabhaengig vom Ergebnis.
  const [einwilligungGesetzt, setEinwilligungGesetzt] = useState(false);
  const einwilligungId = useId();
  const staatsangehoerigkeitHinweisId = useId();
  const geburtsdatumLabelId = useId();
  const geburtsdatumFormatId = useId();

  const eingewilligtAm = sicht.staatsangehoerigkeitEingewilligtAm;
  const staatsangehoerigkeitGesperrt = !eingewilligtAm && !einwilligungGesetzt;

  const speichernMutation = useMutation({
    mutationFn: speichereAngaben,
    onSuccess: async () => {
      setEinwilligungGesetzt(false);
      onGespeichert();
      await invalidieren();
      toast.success('Gespeichert.');
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  const form = useAppForm({
    // E-Mail nur als Vorschlags-Vorbelegung - solange der
    // Bewerber nicht selbst speichert, ist keine E-Mail-Adresse im Konto abgelegt.
    defaultValues: angabenFormularWerte(sicht, userEmail) as AngabenFormValues,
    onSubmit: async ({ value }) => {
      const anfrage = baueAngabenAnfrage({
        alt: sicht.angaben,
        formular: value,
        staatsangehoerigkeitEingewilligtAm: eingewilligtAm,
        neueEinwilligung: einwilligungGesetzt,
        textVersion: ANGABEN_TEXT_VERSION
      });
      await speichernMutation.mutateAsync(anfrage);
    }
  });

  const widerrufMutation = useMutation({
    mutationFn: widerrufeStaatsangehoerigkeit,
    onSuccess: async () => {
      // Kritisch: der Formularzustand zieht nicht von
      // selbst mit dem Server-Stand nach - ohne dieses sofortige Leeren
      // wuerde das Feld weiter den GERADE ALS "sofort gelöscht" versprochenen
      // Wert anzeigen, und ein spaeteres Speichern eines ANDEREN Feldes
      // wuerde ihn erneut (und ohne gueltige Einwilligung) mitschicken - s.
      // das Sicherheitsnetz in baueAngabenAnfrage, das das zusaetzlich
      // abfaengt. Der Haken wird ebenfalls zurueckgesetzt (nie vorbelegt).
      form.setFieldValue('staatsangehoerigkeit', '');
      setEinwilligungGesetzt(false);
      onWiderrufen();
      await invalidieren();
      toast.success('Widerrufen.');
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  const loeschenMutation = useMutation({
    mutationFn: loescheAngaben,
    onSuccess: async () => {
      // Kein `form.reset(leer)` - TanStack Form setzt das beim naechsten
      // Rendern auf die alten defaultValues zurueck, und bis der Refetch durch
      // waere, zeigte das Formular weiter alles (s. lib/angaben-geloescht.ts).
      // Stattdessen: Cache sofort leer -> dieses Formular montiert leer neu (Key),
      // die Bestaetigung steht im neuen Formular am Loeschknopf und bekommt
      // den Fokus (s. MeineAngaben) - kein Toast dazu, sonst wird sie doppelt
      // vorgelesen.
      onGeloescht();
      await nachAngabenLoeschen(queryClient, user?.uid ?? '');
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  const { FormTextField } = useFormFields<AngabenFormValues>();
  // Der Hinweis gilt nur dem Vorschlag: weg, sobald eine E-Mail gespeichert
  // ist oder der Bewerber etwas anderes eingetragen hat.
  const emailWert = useStore(form.store, (state) => state.values.email);
  const emailIstVorschlag = !sicht.angaben.email && Boolean(userEmail) && emailWert === userEmail;

  return (
    <Card id='meine-angaben'>
      <CardHeader>
        <CardTitle>
          <h2>Meine Angaben</h2>
        </CardTitle>
        <CardDescription>
          Diese Angaben merkt sich dein Konto, damit deine KI sie beim Ausfüllen eines
          Bewerbungsformulars übernehmen kann. Die Werte liegen nur in deinem Konto, nie in einem
          Protokoll und nie bei einer KI außerhalb des Formular-Ausfüllens.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form.AppForm>
          <form.Form className='max-w-2xl space-y-6'>
            <FormTextField name='vorname' label='Vorname' />
            <FormTextField name='nachname' label='Nachname' />

            {/* Das native Datumsfeld zerfaellt fuer Screenreader in "Tag",
                "Monat", "Jahr" (Chrome: "Baujahr") - die Gruppe traegt deshalb
                den Namen, das Feld zusaetzlich das Format. */}
            <form.AppField name='geburtsdatum'>
              {(field) => (
                <field.FieldSet aria-labelledby={geburtsdatumLabelId}>
                  <field.Field>
                    <field.FieldLabel id={geburtsdatumLabelId} htmlFor='geburtsdatum'>
                      Geburtsdatum
                    </field.FieldLabel>
                    <Input
                      id='geburtsdatum'
                      type='date'
                      max={HEUTE_ISO()}
                      aria-describedby={geburtsdatumFormatId}
                      value={field.state.value as string}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    <field.FieldDescription id={geburtsdatumFormatId}>
                      Tag, Monat und Jahr, im Format TT.MM.JJJJ
                    </field.FieldDescription>
                  </field.Field>
                  <field.FieldError />
                </field.FieldSet>
              )}
            </form.AppField>

            <FormTextField name='telefon' label='Telefon' type='tel' />
            <FormTextField
              name='email'
              label='E-Mail-Adresse'
              type='email'
              description={
                emailIstVorschlag
                  ? 'Vorbelegt mit deiner Anmelde-Adresse. Das ist nur ein Vorschlag, gespeichert wird sie erst mit „Speichern".'
                  : undefined
              }
            />
            <FormTextField name='geburtsort' label='Geburtsort' />
            <FormTextField name='strasse' label='Straße und Hausnummer' />

            <form.AppField
              name='plz'
              validators={{
                onBlur: ({ value }) => {
                  const wert = (value as string) ?? '';
                  if (wert !== '' && !/^\d{5}$/.test(wert)) {
                    return 'Die Postleitzahl muss aus 5 Ziffern bestehen.';
                  }
                  return undefined;
                }
              }}
            >
              {(field) => (
                <field.FieldSet>
                  <field.Field>
                    <field.FieldLabel htmlFor='plz'>Postleitzahl</field.FieldLabel>
                    <Input
                      id='plz'
                      inputMode='numeric'
                      maxLength={5}
                      value={field.state.value as string}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </field.Field>
                  <field.FieldError />
                </field.FieldSet>
              )}
            </form.AppField>

            <FormTextField name='ort' label='Ort' />

            <form.AppField name='staatsangehoerigkeit'>
              {(field) => (
                <field.FieldSet>
                  <field.Field>
                    <field.FieldLabel htmlFor='staatsangehoerigkeit'>Staatsangehörigkeit</field.FieldLabel>
                    <Input
                      id='staatsangehoerigkeit'
                      value={field.state.value as string}
                      disabled={staatsangehoerigkeitGesperrt}
                      aria-describedby={staatsangehoerigkeitHinweisId}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </field.Field>
                  <field.FieldError />
                </field.FieldSet>
              )}
            </form.AppField>

            <div id={staatsangehoerigkeitHinweisId} className='-mt-4 space-y-3'>
              {eingewilligtAm ? (
                <div className='space-y-2'>
                  <p className='text-muted-foreground text-sm'>Eingewilligt am {formatiereDatum(eingewilligtAm)}</p>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={widerrufMutation.isPending}
                    isLoading={widerrufMutation.isPending}
                    onClick={() => widerrufMutation.mutate()}
                  >
                    Einwilligung widerrufen
                  </Button>
                </div>
              ) : (
                <div className='flex items-start gap-3'>
                  <Checkbox
                    id={einwilligungId}
                    ref={einwilligungRef}
                    className='mt-0.5'
                    checked={einwilligungGesetzt}
                    onCheckedChange={(gehakt) => setEinwilligungGesetzt(gehakt === true)}
                  />
                  <Label htmlFor={einwilligungId} className='items-start text-sm leading-snug font-normal'>
                    {STAATSANGEHOERIGKEIT_EINWILLIGUNG_TEXT}
                  </Label>
                </div>
              )}
            </div>

            <FormTextField name='studienabschluss' label='Studienabschluss / akademischer Grad' />
            <FormTextField name='fuehrerschein' label='Führerschein (Klassen)' />

            <form.SubmitButton ref={speichernKnopfRef}>Speichern</form.SubmitButton>
          </form.Form>
        </form.AppForm>

        <div className='mt-8 border-t pt-6'>
          {geloescht && (
            <p ref={bestaetigungRef} tabIndex={-1} className='focus-visible:ring-ring/50 mb-4 flex items-center gap-2 rounded-sm text-sm outline-none focus-visible:ring-[3px]'>
              <Icons.circleCheck aria-hidden='true' className='h-4 w-4 text-green-600' />
              Alle Angaben wurden gelöscht. Die E-Mail-Adresse oben ist nur ein Vorschlag aus deiner Anmeldung.
            </p>
          )}
          <AlleAngabenLoeschen
            wirdGeloescht={loeschenMutation.isPending}
            onBestaetigt={() => loeschenMutation.mutate()}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function AlleAngabenLoeschen({
  wirdGeloescht,
  onBestaetigt
}: {
  wirdGeloescht: boolean;
  onBestaetigt: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button type='button' variant='outline'>
            <Icons.trash className='mr-2 h-4 w-4' />
            Alle Angaben löschen
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alle Angaben wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Alle Felder auf dieser Seite werden sofort gelöscht, einschließlich einer gespeicherten
            Staatsangehörigkeit und ihrer Einwilligung. Das lässt sich nicht rückgängig machen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={onBestaetigt}
            disabled={wirdGeloescht}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            {wirdGeloescht ? 'Wird gelöscht…' : 'Endgültig löschen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
