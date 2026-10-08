import { describe, expect, it } from 'vitest';
import { signInSchema, signUpSchema } from './auth';

function meldungen(ergebnis: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return (ergebnis.error?.issues ?? []).map((issue) => `${String(issue.path[0])}: ${issue.message}`);
}

// Ein leeres Feld ist "fehlend", nicht "Ungültige E-Mail-Adresse".
describe('Anmelde- und Registrierungsschema', () => {
  it('meldet ein leeres E-Mail-Feld als fehlend, nicht als ungültig - und nur einmal', () => {
    expect(meldungen(signInSchema.safeParse({ email: '', password: '' }))).toEqual([
      'email: Bitte gib deine E-Mail-Adresse ein.',
      'password: Bitte gib dein Passwort ein.'
    ]);
  });

  it('meldet eine falsch geschriebene E-Mail-Adresse mit Beispiel', () => {
    expect(meldungen(signInSchema.safeParse({ email: 'name@', password: 'x' }))).toEqual([
      'email: Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.'
    ]);
  });

  it('nennt bei der Registrierung die Passwortregel', () => {
    expect(
      meldungen(signUpSchema.safeParse({ email: 'a@b.de', password: 'kurz', confirmPassword: 'kurz' }))
    ).toEqual(['password: Das Passwort braucht mindestens 8 Zeichen.']);
    expect(meldungen(signUpSchema.safeParse({ email: '', password: '', confirmPassword: '' }))).toEqual([
      'email: Bitte gib deine E-Mail-Adresse ein.',
      'password: Das Passwort braucht mindestens 8 Zeichen.',
      'confirmPassword: Bitte wiederhole dein Passwort.'
    ]);
  });
});
