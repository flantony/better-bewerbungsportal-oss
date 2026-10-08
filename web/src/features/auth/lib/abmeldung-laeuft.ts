/**
 * Modul-globales Signal fuer eine gewollte Abmeldung (Sign-out oder
 * Konto-Loeschung). `KontoGuard` reagiert auf einen Anmeldestatus-Wechsel zu
 * `null` mit einem eigenen Redirect nach `/anmelden` - ohne dieses Signal
 * gewinnt dieser Redirect das Rennen gegen die gewollte Navigation (z.B. nach
 * `/` nach einer Konto-Loeschung).
 *
 * Bewusst ein Zeitpunkt statt eines An/Aus-Schalters: der Guard sieht den
 * neuen Anmeldestatus erst beim naechsten Render, und der kommt NACH dem Ende
 * von `await signOut()`. Ein Schalter, der nach dem signOut zurueckgesetzt
 * wird, ist dann schon wieder aus.
 * Ein Zeitfenster braucht kein Zuruecksetzen und laeuft von selbst ab - ein
 * spaeterer Besuch einer Kontoseite ohne Anmeldung leitet wieder normal um.
 */
export const ABMELDUNG_FENSTER_MS = 5_000;

let abmeldungSeit: number | null = null;

export function merkeAbmeldung(jetzt: number = Date.now()): void {
  abmeldungSeit = jetzt;
}

export function istAbmeldungAmLaufen(jetzt: number = Date.now()): boolean {
  return abmeldungSeit !== null && jetzt - abmeldungSeit < ABMELDUNG_FENSTER_MS;
}
