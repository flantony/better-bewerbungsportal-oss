'use client';

import { useStore } from '@tanstack/react-form';
import { Input } from '@/components/ui/input';
import { FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  useFieldContext,
  FormFieldSet,
  FormField,
  FormFieldError,
  createFormField
} from '@/components/ui/form-context';
import { Spinner } from '@/components/ui/spinner';

interface TextFieldProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'onBlur'
> {
  label: string;
  description?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'number';
}

/** Sichtbares Sternchen plus "Pflichtfeld" für Screenreader - das Sternchen allein sagt nichts (WCAG 3.3.2). */
export function PflichtfeldMarke() {
  return (
    <>
      {' '}
      <span aria-hidden='true'>*</span>
      <span className='sr-only'> (Pflichtfeld)</span>
    </>
  );
}

export function TextField(props: TextFieldProps) {
  // Der Inhalt liegt in einer eigenen Komponente INNERHALB von FormFieldSet:
  // erst dort liefert useFieldContext die ids für Beschreibung und Fehler,
  // auf die das Eingabefeld per aria-describedby zeigt.
  return (
    <FormFieldSet>
      <TextFieldInhalt {...props} />
      <FormFieldError />
    </FormFieldSet>
  );
}

function TextFieldInhalt({
  label,
  description,
  required,
  type = 'text',
  className,
  ...inputProps
}: TextFieldProps) {
  const field = useFieldContext();
  const isTouched = useStore(field.store, (s) => s.meta.isTouched);
  const isValid = useStore(field.store, (s) => s.meta.isValid);
  const isValidating = useStore(field.store, (s) => s.meta.isValidating);
  const value = useStore(field.store, (s) => s.value) as string | number;
  const zeigtFehler = isTouched && !isValid;
  const beschriebenDurch =
    [description ? field.formDescriptionId : null, zeigtFehler ? field.formMessageId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <FormField>
      <FieldLabel htmlFor={field.name}>
        {label}
        {required && <PflichtfeldMarke />}
      </FieldLabel>
      <div className='relative'>
        <Input
          id={field.name}
          type={type}
          value={value ?? ''}
          onBlur={field.handleBlur}
          onChange={(e) => {
            if (type === 'number') {
              const v = e.target.value;
              field.handleChange(v === '' ? '' : parseFloat(v));
            } else {
              field.handleChange(e.target.value);
            }
          }}
          required={required}
          aria-required={required || undefined}
          aria-invalid={zeigtFehler}
          aria-describedby={beschriebenDurch}
          className={className}
          {...inputProps}
        />
        {isValidating && (
          <div className='absolute top-1/2 right-3 -translate-y-1/2'>
            <Spinner className='h-4 w-4' />
          </div>
        )}
      </div>
      {description && <FieldDescription id={field.formDescriptionId}>{description}</FieldDescription>}
    </FormField>
  );
}

export const FormTextField = createFormField(TextField);
