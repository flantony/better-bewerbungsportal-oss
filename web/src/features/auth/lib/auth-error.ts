import { FirebaseError } from 'firebase/app';
import { PASSWORT_MINDESTLAENGE } from '../schemas/auth';

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'E-Mail-Adresse oder Passwort stimmen nicht.',
  'auth/user-not-found': 'E-Mail-Adresse oder Passwort stimmen nicht.',
  'auth/wrong-password': 'E-Mail-Adresse oder Passwort stimmen nicht.',
  'auth/too-many-requests': 'Zu viele Versuche. Warte kurz und versuch es dann noch einmal.',
  'auth/email-already-in-use': 'Zu dieser E-Mail-Adresse gibt es schon ein Konto.',
  'auth/weak-password': `Das Passwort ist zu schwach. Nimm mindestens ${PASSWORT_MINDESTLAENGE} Zeichen.`,
  'auth/account-exists-with-different-credential':
    'Zu dieser E-Mail-Adresse gibt es schon ein Konto mit einer anderen Anmeldeart (z. B. Passwort). Melde dich bitte darüber an.',
  'auth/popup-blocked':
    'Dein Browser hat das Anmeldefenster blockiert. Erlaube Pop-ups für diese Seite und versuch es noch einmal.'
};

/** Nutzer hat das Google-Popup selbst geschlossen/abgebrochen - keine echte Fehlermeldung nötig. */
export function isUserCancelledAuthError(err: unknown): boolean {
  return (
    err instanceof FirebaseError &&
    (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')
  );
}

/** Liest `code`, egal ob eine echte `FirebaseError` oder nur ein aehnlich geformtes Objekt (z.B. im Test) vorliegt. */
function authErrorCode(err: unknown): string | undefined {
  if (err instanceof FirebaseError) return err.code;
  if (typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string') {
    return (err as { code: string }).code;
  }
  return undefined;
}

export function mapAuthError(err: unknown): string {
  const code = authErrorCode(err);
  if (code !== undefined) {
    return MESSAGES[code] ?? 'Etwas ist schiefgelaufen. Versuch es bitte später noch einmal.';
  }
  return 'Etwas ist schiefgelaufen. Versuch es bitte später noch einmal.';
}
