'use client';

import Link from 'next/link';
import { scrollToFirstError, useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { clientAuth } from '@/lib/firebase/client';
import { mapAuthError } from '../lib/auth-error';
import { sicheresZiel } from '../lib/sicheres-ziel';
import { PASSWORT_REGEL, signUpSchema, type SignUpFormValues } from '../schemas/auth';

export function SignUpForm() {
  const router = useRouter();

  const form = useAppForm({
    defaultValues: { email: '', password: '', confirmPassword: '' } as SignUpFormValues,
    validators: { onSubmit: signUpSchema },
    // Bewusst kein eigener onBlur-Validator am Passwortfeld: schlaegt der
    // fehl, bricht TanStack Form das Absenden vor der Formularpruefung ab und
    // nur das Passwort bekommt eine Meldung. Die Regel steht dafuer vorab
    // sichtbar unter dem Feld. Nach einem leeren Absenden springt der Fokus
    // ins erste fehlerhafte Feld, statt auf <body> zu bleiben.
    onSubmitInvalid: () => scrollToFirstError(),
    onSubmit: async ({ value }) => {
      try {
        const { user } = await createUserWithEmailAndPassword(clientAuth(), value.email.trim(), value.password);
        // Best-effort - ein fehlgeschlagener Versand soll die Kontoerstellung nicht blockieren.
        sendEmailVerification(user).catch(() => {});
        toast.success('Konto erstellt. Wir haben dir eine Bestätigungs-E-Mail geschickt.');
        const weiter = new URLSearchParams(window.location.search).get('weiter');
        router.push(sicheresZiel(weiter, window.location.origin));
      } catch (err) {
        toast.error(mapAuthError(err));
      }
    }
  });

  const { FormTextField } = useFormFields<SignUpFormValues>();

  return (
    <form.AppForm>
      <form.Form className='space-y-4'>
        <p className='text-muted-foreground text-xs'>Felder mit * sind Pflichtfelder.</p>
        <FormTextField
          name='email'
          label='E-Mail'
          required
          type='email'
          autoComplete='email'
          placeholder='name@beispiel.de'
        />
        <FormTextField
          name='password'
          label='Passwort'
          required
          type='password'
          autoComplete='new-password'
          description={PASSWORT_REGEL}
        />
        <FormTextField
          name='confirmPassword'
          label='Passwort wiederholen'
          required
          type='password'
          autoComplete='new-password'
        />
        <form.SubmitButton className='w-full'>Konto erstellen</form.SubmitButton>
        <p className='text-muted-foreground text-center text-xs'>
          Mit der Kontoerstellung stimmst du unserer{' '}
          <Link href='/datenschutz' className='underline-offset-4 hover:underline' target='_blank'>
            Datenschutzerklärung
          </Link>{' '}
          zu.
        </p>
      </form.Form>
    </form.AppForm>
  );
}
