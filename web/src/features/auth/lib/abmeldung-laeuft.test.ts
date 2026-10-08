import { describe, expect, it } from 'vitest';
import { ABMELDUNG_FENSTER_MS, istAbmeldungAmLaufen, merkeAbmeldung } from './abmeldung-laeuft';

// WOZU: Nach einer Konto-Loeschung soll man auf der Startseite landen, nicht auf
// /anmelden. Das Signal muss den spaeten Render nach signOut() abdecken - und
// danach von selbst ablaufen, sonst bliebe eine Kontoseite ohne Anmeldung bei
// "Lädt…" haengen, statt zur Anmeldung umzuleiten.
describe('istAbmeldungAmLaufen', () => {
  const JETZT = 1_800_000_000_000;

  it('gilt kurz nach der Abmeldung', () => {
    merkeAbmeldung(JETZT);
    expect(istAbmeldungAmLaufen(JETZT + 1_000)).toBe(true);
  });

  it('laeuft nach dem Zeitfenster von selbst ab', () => {
    merkeAbmeldung(JETZT);
    expect(istAbmeldungAmLaufen(JETZT + ABMELDUNG_FENSTER_MS)).toBe(false);
  });
});
