'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { FieldDescription, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { slugifyId } from '@/lib/dom-id';

/**
 * Presentational Multi-Select-Checkbox-Grid fuer die Suchprofil-Felder mit
 * Array-Werten. Kein eigener Formular-State - wird innerhalb eines
 * `form.AppField mode="array"` render-props verwendet, s.
 * suchprofil-formular.tsx.
 *
 * `beschreibung` liefert optional einen Erklaerungssatz je Option (z.B. die
 * `laufbahngruppeBedeutung`-Texte) - nie selbst formulierte
 * Bundeswehr-Erklaerungen. `anzeigename` liefert optional einen lesbaren Text
 * fuer eine Option, wenn `wert` selbst ein interner Code ist (z.B.
 * Einstiegsweg-Codes) - standardmaessig wird `wert` selbst angezeigt.
 */
export function CheckboxGruppe({
  idPrefix,
  label,
  hinweis,
  optionen,
  werte,
  onToggle,
  beschreibung,
  anzeigename
}: {
  idPrefix: string;
  label: string;
  /** Ein Satz Erklaerung fuer die ganze Gruppe, in Alltagssprache. */
  hinweis?: string;
  optionen: string[];
  werte: string[];
  onToggle: (wert: string, checked: boolean) => void;
  beschreibung?: (wert: string) => string | undefined;
  anzeigename?: (wert: string) => string;
}) {
  return (
    <div className='space-y-2'>
      <FieldLabel>{label}</FieldLabel>
      {hinweis && <FieldDescription>{hinweis}</FieldDescription>}
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        {optionen.map((wert, index) => {
          const id = `${idPrefix}-${slugifyId(wert, index)}`;
          const optionshinweis = beschreibung?.(wert);
          return (
            <div
              key={wert}
              className='flex min-h-11 items-center space-x-2 sm:min-h-0 sm:items-start'
            >
              <Checkbox
                id={id}
                className='mt-0.5'
                checked={werte.includes(wert)}
                onCheckedChange={(checked) => onToggle(wert, Boolean(checked))}
              />
              <div className='flex flex-col'>
                <Label htmlFor={id}>{anzeigename?.(wert) ?? wert}</Label>
                {optionshinweis && <span className='text-muted-foreground text-xs'>{optionshinweis}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
