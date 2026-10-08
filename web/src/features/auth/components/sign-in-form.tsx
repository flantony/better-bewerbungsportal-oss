'use client';

import { scrollToFirstError, useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { clientAuth } from '@/lib/firebase/client';
import { ForgotPasswordDialog } from './forgot-password-dialog';
import { mapAuthError } from '../lib/auth-error';
import { sicheresZiel } from '../lib/sicheres-ziel';
import { signInSchema, type SignInFormValues } from '../schemas/auth';

export function SignInForm() {
  const router = useRouter();

  const form = useAppForm({
    defaultValues: { email: '', password: '' } as SignInFormValues,
    validators: { onSubmit: signInSchema },
    // Sonst bliebe der Fokus nach einem leeren Absenden auf <body>.
    onSubmitInvalid: () => scrollToFirstError(),
    onSubmit: async ({ value }) => {
      try {
        await signInWithEmailAndPassword(clientAuth(), value.email.trim(), value.password);
        const weiter = new URLSearchParams(window.location.search).get('weiter');
        router.push(sicheresZiel(weiter, window.location.origin));
      } catch (err) {
        toast.error(mapAuthError(err));
      }
    }
  });

  const { FormTextField } = useFormFields<SignInFormValues>();

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
          autoComplete='current-password'
        />
        <div className='flex justify-end'>
          <ForgotPasswordDialog />
        </div>
        <form.SubmitButton className='w-full'>Anmelden</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
