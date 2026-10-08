'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { SUCHPROFIL_NAME_MAX, type Suchoptionen, type Suchprofil, type SuchprofilEintrag } from '../api/types';
import { EINSTIEGSWEG_LABELS } from '../lib/filter-beschreibung';
import { zusammenfuehren } from '../lib/zusammenfuehren';
import { CheckboxGruppe } from './checkbox-gruppe';

// useFormFields verlangt `Record<string, unknown>` als Constraint - ein
// `interface` bekommt (anders als ein Mapped Type) kein implizites
// Index-Signature-Match, daher hier ein abgeleiteter Typalias fuer den
// generischen Aufruf. `filtername` ist der Anzeigename des Filters, kein
// Suchfeld - er wird vor dem Speichern abgetrennt.
type SuchprofilFormValues = { [K in keyof Suchprofil]: Suchprofil[K] } & { filtername: string };

const taetigkeitsbereichOptionen = [
  { value: 'militaerisch', label: 'Militärisch' },
  { value: 'zivil', label: 'Zivil' },
  { value: 'beide', label: 'Beides' }
];

const beschaeftigungsumfangOptionen = [
  { value: 'vollzeit', label: 'Vollzeit' },
  { value: 'teilzeit', label: 'Teilzeit' },
  { value: 'beide', label: 'Beides' }
];

// Haengt einen Wert an ein Listenfeld an oder entfernt ihn (Checkbox-Gruppe).
function umschalten(
  field: { pushValue: (wert: string) => void; removeValue: (index: number) => void },
  werte: string[],
  wert: string,
  checked: boolean
) {
  if (checked) field.pushValue(wert);
  else {
    const idx = werte.indexOf(wert);
    if (idx > -1) field.removeValue(idx);
  }
}

/**
 * Formular fuer GENAU EINEN Filter - zum Bearbeiten eines gespeicherten
 * (`eintrag`) oder leer fuer einen neuen (`eintrag: null`). Es ist immer nur
 * eins auf der Seite offen (s. SuchprofileBereich), deshalb kollidieren die
 * Feld-ids nicht. Gespeichert wird vom Aufrufer: er schliesst das Formular
 * nach Erfolg, bei einem Fehler bleibt es mit den Eingaben offen.
 */
export function SuchprofilFormular({
  optionen,
  eintrag,
  onSpeichern,
  onAbbrechen
}: {
  optionen: Suchoptionen;
  eintrag: SuchprofilEintrag | null;
  onSpeichern: (werte: { filter: Suchprofil; name: string }) => Promise<void>;
  onAbbrechen: () => void;
}) {
  const alt = eintrag?.filter ?? null;
  const huelle = useRef<HTMLDivElement>(null);

  // Beim Oeffnen ins erste Feld, statt den Fokus auf dem Knopf zu lassen, der
  // das Formular geoeffnet hat.
  useEffect(() => {
    huelle.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);

  const form = useAppForm({
    // `...alt` zuerst: Felder, die dieses Formular nicht zeigt (seiteneinstieg,
    // mindestbesoldung, besoldungstabelle - z. B. aus einem KI-Import), muessen
    // im Formularzustand erhalten bleiben, sonst loescht `zusammenfuehren` beim
    // Speichern etwas, das der Bewerber nie gesehen hat.
    defaultValues: {
      ...alt,
      filtername: eintrag?.name ?? '',
      suchbegriff: alt?.suchbegriff ?? '',
      taetigkeitsbereich: alt?.taetigkeitsbereich ?? 'beide',
      vertragsarten: alt?.vertragsarten ?? [],
      beschaeftigungsumfang: alt?.beschaeftigungsumfang ?? 'beide',
      bundesland: alt?.bundesland ?? [],
      wunschort: alt?.wunschort ?? '',
      organisationsbereich: alt?.organisationsbereich ?? [],
      laufbahngruppe: alt?.laufbahngruppe ?? [],
      einstiegswege: alt?.einstiegswege ?? []
    } as SuchprofilFormValues,
    onSubmit: async ({ value }) => {
      const { filtername, ...filter } = value;
      await onSpeichern({ filter: zusammenfuehren(alt, filter), name: filtername.trim() });
    }
  });

  const { FormTextField, FormRadioGroupField } = useFormFields<SuchprofilFormValues>();

  return (
    <div ref={huelle}>
      <form.AppForm>
        <form.Form className='max-w-2xl space-y-6'>
          <FormTextField
            name='filtername'
            label='Name des Filters (freiwillig)'
            description='Damit du ihn in der Liste wiederfindest, z. B. „IT im Rheinland“.'
            maxLength={SUCHPROFIL_NAME_MAX}
          />

          <FormTextField
            name='suchbegriff'
            label='Suchbegriff'
            description='Ein Wort aus dem Stellentitel, z. B. IT oder Sanitäter.'
            placeholder='z. B. IT'
          />

          <FormRadioGroupField
            name='taetigkeitsbereich'
            label='Bereich'
            description='Wähle militärisch, zivil oder beides.'
            options={taetigkeitsbereichOptionen}
          />

          <form.AppField name='vertragsarten' mode='array'>
            {(field) => {
              const werte = (field.state.value as string[]) ?? [];
              return (
                <CheckboxGruppe
                  idPrefix='vertragsarten'
                  label='Vertragsart'
                  hinweis='Als was möchtest du bei der Bundeswehr arbeiten?'
                  optionen={optionen.vertragsarten}
                  werte={werte}
                  onToggle={(wert, checked) => umschalten(field, werte, wert, checked)}
                />
              );
            }}
          </form.AppField>

          <FormRadioGroupField
            name='beschaeftigungsumfang'
            label='Beschäftigungsumfang'
            description='Voll- oder Teilzeit? Wähle „Beides“, wenn dir das egal ist.'
            options={beschaeftigungsumfangOptionen}
          />

          <form.AppField name='bundesland' mode='array'>
            {(field) => {
              const werte = (field.state.value as string[]) ?? [];
              return (
                <CheckboxGruppe
                  idPrefix='bundesland'
                  label='Bundesland'
                  hinweis='In welchem Bundesland möchtest du arbeiten?'
                  optionen={optionen.bundesland}
                  werte={werte}
                  onToggle={(wert, checked) => umschalten(field, werte, wert, checked)}
                />
              );
            }}
          </form.AppField>

          <FormTextField
            name='wunschort'
            label='Wunschort'
            description='Stadt, z. B. Berlin. Für eine Region wähle oben das Bundesland.'
            placeholder='z. B. Berlin'
          />

          <form.AppField name='organisationsbereich' mode='array'>
            {(field) => {
              const werte = (field.state.value as string[]) ?? [];
              return (
                <CheckboxGruppe
                  idPrefix='organisationsbereich'
                  label='Organisationsbereich'
                  hinweis='In welchem Bereich der Bundeswehr möchtest du arbeiten, zum Beispiel Heer, Marine oder Luftwaffe?'
                  optionen={optionen.organisationsbereich}
                  werte={werte}
                  onToggle={(wert, checked) => umschalten(field, werte, wert, checked)}
                />
              );
            }}
          </form.AppField>

          <form.AppField name='laufbahngruppe' mode='array'>
            {(field) => {
              const werte = (field.state.value as string[]) ?? [];
              return (
                <CheckboxGruppe
                  idPrefix='laufbahngruppe'
                  label='Laufbahngruppe'
                  hinweis='Wähle, wenn du schon weißt, welche Laufbahn zu dir passt. Wo es eine kurze Erklärung gibt, steht sie unter der Option.'
                  optionen={optionen.laufbahngruppe}
                  werte={werte}
                  beschreibung={(wert) => optionen.laufbahngruppeBedeutung[wert]}
                  onToggle={(wert, checked) => umschalten(field, werte, wert, checked)}
                />
              );
            }}
          </form.AppField>

          <form.AppField name='einstiegswege' mode='array'>
            {(field) => {
              const werte = (field.state.value as string[]) ?? [];
              return (
                <CheckboxGruppe
                  idPrefix='einstiegswege'
                  label='Einstiegsweg'
                  hinweis='Nur wenn einer dieser besonderen Wege auf dich zutrifft.'
                  optionen={optionen.einstiegswege}
                  werte={werte}
                  anzeigename={(wert) => EINSTIEGSWEG_LABELS[wert] ?? wert}
                  beschreibung={(wert) => optionen.einstiegswegBedeutung[wert]}
                  onToggle={(wert, checked) => umschalten(field, werte, wert, checked)}
                />
              );
            }}
          </form.AppField>

          <div className='flex flex-wrap gap-2'>
            <form.SubmitButton>{eintrag ? 'Änderungen speichern' : 'Filter speichern'}</form.SubmitButton>
            <Button type='button' variant='outline' onClick={onAbbrechen}>
              Abbrechen
            </Button>
          </div>
        </form.Form>
      </form.AppForm>
    </div>
  );
}
