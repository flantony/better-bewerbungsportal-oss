import * as z from 'zod';

export const PASSWORT_MINDESTLAENGE = 8;
export const PASSWORT_REGEL = `Mindestens ${PASSWORT_MINDESTLAENGE} Zeichen.`;

// Leer und falsch geschrieben sind zwei verschiedene Fehler: wer nichts
// eingegeben hat, soll nicht "ungültig" lesen. `pipe` prüft das Format erst,
// wenn überhaupt etwas da ist - sonst kämen beide Meldungen zugleich.
const emailSchema = z
  .string()
  .trim()
  .min(1, 'Bitte gib deine E-Mail-Adresse ein.')
  .pipe(z.email('Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.'));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Bitte gib dein Passwort ein.')
});
export type SignInFormValues = z.input<typeof signInSchema>;

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(PASSWORT_MINDESTLAENGE, `Das Passwort braucht mindestens ${PASSWORT_MINDESTLAENGE} Zeichen.`),
    confirmPassword: z.string().min(1, 'Bitte wiederhole dein Passwort.')
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Die beiden Passwörter stimmen nicht überein.',
    path: ['confirmPassword']
  });
export type SignUpFormValues = z.input<typeof signUpSchema>;
