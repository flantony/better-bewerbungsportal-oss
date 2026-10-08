import { describe, expect, it } from 'vitest';
import { mapAuthError } from './auth-error';

// WOZU: Firebase-Fehlercodes sind kein Text fuer Bewerber. Und bei falschem
// Passwort darf die Meldung nicht verraten, ob die Adresse ein Konto hat.
describe('mapAuthError', () => {
  it('sagt bei falschem Passwort und unbekannter Adresse dasselbe', () => {
    expect(mapAuthError({ code: 'auth/wrong-password' })).toBe(
      mapAuthError({ code: 'auth/user-not-found' })
    );
  });
  it('hat eine deutsche Rueckfallmeldung fuer Unbekanntes', () => {
    expect(mapAuthError(new Error('x'))).toMatch(/[äöüß]|erneut|später/);
  });
});
