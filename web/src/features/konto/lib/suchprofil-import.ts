import { SUCHPROFILE_MAX, type Suchprofil } from '../api/types';

// ─── Zwischenablage fuer das Fragment ───────────────────────────────────────
//
// Das Fragment eines Uebernahme-Links (`/suchprofil/uebernehmen#v1.…`) traegt
// die Suchfilter. Es darf nie in einen Query-String, einen Request oder ein
// Log (DSFA.md, Eintrag `erstelle_suchprofil_link`). Muss der Bewerber sich
// erst anmelden, wartet es deshalb im `sessionStorage` dieses Tabs - nicht im
// `weiter`-Parameter. Geht das nicht (gesperrt, privater Modus), bleibt es im
// Arbeitsspeicher: das reicht fuer die Anmeldung innerhalb der Seite
// (Client-Navigation), nicht aber fuer ein Neuladen.

export const IMPORT_SPEICHER_SCHLUESSEL = 'suchprofil-import';
export const IMPORT_PFAD = '/suchprofil/uebernehmen';

let imArbeitsspeicher: string | null = null;

/**
 * Nur fuer den Weg ueber die Anmeldung: legt das Fragment in den
 * `sessionStorage` dieses Tabs. `true`, wenn das ging (uebersteht ein Neuladen).
 */
export function merkeImportLink(fragment: string): boolean {
  imArbeitsspeicher = fragment;
  try {
    window.sessionStorage.setItem(IMPORT_SPEICHER_SCHLUESSEL, fragment);
    return true;
  } catch {
    return false;
  }
}

export function holeImportLink(): string | null {
  try {
    const gespeichert = window.sessionStorage.getItem(IMPORT_SPEICHER_SCHLUESSEL);
    if (gespeichert) return gespeichert;
  } catch {
    // sessionStorage nicht verfuegbar - dann nur der Arbeitsspeicher.
  }
  return imArbeitsspeicher;
}

/**
 * Angemeldet braucht es den `sessionStorage` nicht mehr - nur noch den
 * Arbeitsspeicher, der mit dem Verlassen der Seite geleert wird.
 */
export function nurNochImArbeitsspeicher(fragment: string): void {
  imArbeitsspeicher = fragment;
  try {
    window.sessionStorage.removeItem(IMPORT_SPEICHER_SCHLUESSEL);
  } catch {
    // nichts zu tun
  }
}

/** Nach dem Speichern, Verwerfen, einem unlesbaren Link oder dem Verlassen der Seite (angemeldet). */
export function vergissImportLink(): void {
  imArbeitsspeicher = null;
  try {
    window.sessionStorage.removeItem(IMPORT_SPEICHER_SCHLUESSEL);
  } catch {
    // nichts zu tun
  }
}

/**
 * Liest das Fragment aus der Adresszeile und entfernt es dort sofort
 * (`replaceState`), damit es weder im Zurueck-Verlauf des Tabs noch in einem
 * Lesezeichen stehen bleibt. Ohne Fragment: `null`.
 */
export function nimmFragmentAusAdresse(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  // Arbeitsspeicher sofort: ein zweiter Lauf des Effekts (React StrictMode)
  // findet die Adresse schon leer.
  imArbeitsspeicher = hash;
  return hash;
}

// ─── Platz im Konto ─────────────────────────────────────────────────────────

/**
 * Wirkungslose Werte - Spiegel von `istNeutral` in
 * functions/src/konto/suchprofile.ts (dort massgeblich).
 */
function istNeutral(feld: string, wert: unknown): boolean {
  if (wert === undefined || wert === null) return true;
  if (Array.isArray(wert)) return wert.length === 0;
  if (typeof wert === 'string' && wert.trim() === '') return true;
  if ((feld === 'taetigkeitsbereich' || feld === 'beschaeftigungsumfang') && wert === 'beide') return true;
  if (feld === 'seiteneinstieg') return wert !== true;
  return false;
}

const vergleiche = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

/**
 * Kanonische Form fuer den Dublettenvergleich - Spiegel von `filterKennung` in
 * functions/src/konto/suchprofile.ts. Der Server entscheidet beim Speichern
 * selbst; hier geht es nur darum, vorher richtig zu sagen, ob die Auswahl passt.
 */
export function dublettenKennung(filter: Suchprofil): string {
  const eintraege = Object.entries(filter)
    .filter(([feld, wert]) => !istNeutral(feld, wert))
    .map(
      ([feld, wert]) =>
        [
          feld,
          Array.isArray(wert) ? wert.toSorted(vergleiche) : typeof wert === 'string' ? wert.trim() : wert
        ] as const
    )
    .toSorted(([a], [b]) => vergleiche(a, b));
  return JSON.stringify(eintraege);
}

export interface ImportPlan {
  /** Je Filter im Link: schon im Konto gespeichert? (Doppelte im Link selbst zaehlt nur `neu` einmal.) */
  schonGespeichert: boolean[];
  /** Wie viele der ausgewaehlten Filter wirklich neu dazukommen. */
  neu: number;
  ausgewaehlt: number;
  belegt: number;
  frei: number;
  passt: boolean;
}

/**
 * Was die Auswahl im Konto belegen wuerde. Schon gespeicherte Filter
 * ueberspringt der Server (s. `fuegeSuchprofileHinzu`), sie brauchen keinen Platz.
 */
export function planeImport(filter: Suchprofil[], auswahl: boolean[], gespeichert: Suchprofil[]): ImportPlan {
  const bekannt = new Set(gespeichert.map(dublettenKennung));
  const schonGespeichert = filter.map((f) => bekannt.has(dublettenKennung(f)));

  const gezaehlt = new Set<string>();
  let neu = 0;
  filter.forEach((f, index) => {
    if (!auswahl[index]) return;
    const kennung = dublettenKennung(f);
    if (bekannt.has(kennung) || gezaehlt.has(kennung)) return;
    gezaehlt.add(kennung);
    neu++;
  });

  const belegt = gespeichert.length;
  const frei = Math.max(0, SUCHPROFILE_MAX - belegt);
  return {
    schonGespeichert,
    neu,
    ausgewaehlt: auswahl.filter(Boolean).length,
    belegt,
    frei,
    passt: neu <= frei
  };
}

/** „2 Filter gespeichert, 1 hattest du schon." */
export function ergebnisText(hinzugefuegt: number, uebersprungen: number): string {
  if (hinzugefuegt === 0) {
    return uebersprungen === 1
      ? 'Diesen Filter hattest du schon gespeichert. Es hat sich nichts geändert.'
      : 'Diese Filter hattest du schon alle gespeichert. Es hat sich nichts geändert.';
  }
  const gespeichert = hinzugefuegt === 1 ? '1 Filter gespeichert' : `${hinzugefuegt} Filter gespeichert`;
  if (uebersprungen === 0) return `${gespeichert}.`;
  return `${gespeichert}, ${uebersprungen} hattest du schon.`;
}
