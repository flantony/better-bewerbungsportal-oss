// Reine Benachrichtigungslogik - keine Firestore-, Auth- oder Mail-Aufrufe.
// Der Nachtlauf (Cloud Function) liefert die Kandidaten und ruft diese
// Funktionen nur mit Werten auf, keine I/O hier.
import { timingSafeEqual } from "crypto";

/**
 * Hoechstens so viele gemeldete Stellen-IDs je Konto - aeltere fallen heraus.
 * 4000 IDs a ~40 Byte sind ~160 KB je Dokument (Firestore-Grenze 1 MiB). Die
 * Liste muss auch bei einem breiten Profil das ganze 7-Tage-Fenster abdecken,
 * sonst wuerden noch im Fenster liegende, schon gemeldete Stellen erneut
 * gemeldet.
 */
export const MAX_GEMELDET = 4000;
/** Hoechstens so viele Stellen in einer einzelnen Mail. */
export const MAX_STELLEN_JE_MAIL = 10;
/**
 * Ein Kandidat gilt nur innerhalb dieses rollierenden Fensters (ab `jetzt`,
 * s. benachrichtige.ts `plane()`) ueberhaupt als "neu" - unabhaengig von
 * `seit`/`letzteAm`. `letzteAm` als zusaetzliche, mit jeder Nacht
 * vorrueckende Untergrenze wuerde genau die Stellen verschlucken, die wegen
 * eines Fetch-Limits oder eines Zwischensyncs erst eine Nacht spaeter als
 * Kandidat auftauchen: sie laegen dann bereits vor der inzwischen
 * vorgerueckten `letzteAm`-Grenze und wuerden NIE gemeldet. Die
 * Fenstergrenze faengt stattdessen eine laengere Sync-/Versand-Panne ab, ohne
 * je eine wochenalte Stelle als "neu" wiederzubeleben.
 */
export const NEU_FENSTER_TAGE = 7;

/**
 * Schraenkt das Suchprofil die Suche ueberhaupt ein? Gezaehlt wird nur ein
 * Wert, der in `buildQuery` (mcp/lib/queryJobs.ts) eine Bedingung erzeugt.
 * Neutral sind: leere Listen, leere oder nur aus Leerzeichen bestehende
 * Texte, `undefined`/`null`, `taetigkeitsbereich: "beide"`,
 * `beschaeftigungsumfang: "beide"`, `seiteneinstieg: false` und
 * `besoldungstabelle` ohne `mindestbesoldung` (die Tabelle wird nur zusammen
 * mit der Mindeststufe abgefragt). Ohne Einschraenkung ist das Profil "alle
 * Stellen" - dafuer gibt es keine Benachrichtigung. Dieselbe
 * Regel steht im Web in `schraenktEin` (features/konto/lib/schraenkt-ein.ts).
 */
export function hatSuchprofil(profil: Record<string, unknown> | null | undefined): boolean {
  if (!profil) return false;
  return Object.entries(profil).some(([feld, wert]) => {
    if (wert === undefined || wert === null) return false;
    if (Array.isArray(wert)) return wert.length > 0;
    if (typeof wert === "string" && wert.trim() === "") return false;
    if ((feld === "taetigkeitsbereich" || feld === "beschaeftigungsumfang") && wert === "beide") return false;
    if (feld === "seiteneinstieg") return wert === true;
    if (feld === "besoldungstabelle") return false;
    return true;
  });
}

export interface Kandidat {
  pinstGuid: string;
  firstSeenAtMs: number;
}

/**
 * Neue Treffer: `firstSeenAt` STRIKT nach `seitMs` (nicht "seit einschliesslich" -
 * sonst zaehlt der Zeitpunkt des letzten Laufs selbst noch einmal mit), noch
 * nicht gemeldet, neueste zuerst.
 *
 * "Noch nicht gemeldet" schlaegt eine neuere `firstSeenAt`: eine Stelle, deren
 * ID schon in `gemeldet` steht, bleibt draussen, selbst wenn sie unter derselben
 * `pinstGuid` neu ausgeschrieben wurde (Wiederausschreibung) - sonst bekaeme ein
 * Konto dieselbe Stelle mehrfach gemeldet.
 */
export function neueTreffer(kandidaten: Kandidat[], seitMs: number, gemeldet: string[]): Kandidat[] {
  const bekannt = new Set(gemeldet);
  return kandidaten
    .filter((k) => k.firstSeenAtMs > seitMs && !bekannt.has(k.pinstGuid))
    .sort((a, b) => b.firstSeenAtMs - a.firstSeenAtMs);
}

/**
 * Vorne anfuegen (neueste zuerst), Duplikate raus, auf `MAX_GEMELDET` kuerzen -
 * die aeltesten (hintersten) Eintraege fallen zuerst heraus.
 */
export function fortschreiben(gemeldet: string[], neu: string[]): string[] {
  const ergebnis: string[] = [];
  const gesehen = new Set<string>();
  for (const id of [...neu, ...gemeldet]) {
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    ergebnis.push(id);
  }
  return ergebnis.slice(0, MAX_GEMELDET);
}

/**
 * Der Benachrichtigungs-Zustand in Millisekunden statt Firestore-`Timestamp` -
 * dieselbe Konvention wie `GemerkteStelle` (kontoTypen.ts): reine Logik
 * rechnet ohne Firestore-Typen, die Umwandlung passiert im Store.
 */
export interface BenachrichtigungsZustand {
  aktiv: boolean;
  abmeldeToken: string;
  seitMs: number;
  letzteAmMs: number | null;
  gemeldet: string[];
}

/**
 * Reine Zustandsuebergangs-Logik fuer `kontoBenachrichtigungSetzen`.
 * Das neue Token kommt als FERTIGER Wert herein (`neuesToken`), nicht als
 * Erzeuger-Funktion - sonst waere diese Funktion nicht mehr rein/ohne I/O.
 *
 * - Noch nie eingeschaltet (`alt` fehlt): alles frisch, `seit = jetzt`,
 *   `letzteAm = null`, `gemeldet = []`, ein neues Token.
 * - Ausschalten (`aktiv: false`): Token und `gemeldet` bleiben unangetastet -
 *   ein spaeteres Wiedereinschalten braucht keinen neuen Abbestell-Link.
 * - (Wieder-)Einschalten (`aktiv: true`, `alt` vorhanden): Token und
 *   `gemeldet` bleiben, `seit` wird auf `jetzt` gesetzt - keine Nachmeldung
 *   von Stellen, die waehrend der Pause neu erschienen sind.
 */
export function naechsterBenachrichtigungsStand(
  alt: BenachrichtigungsZustand | undefined,
  aktiv: boolean,
  jetzt: number,
  neuesToken: string,
): BenachrichtigungsZustand {
  if (!alt) return { aktiv, abmeldeToken: neuesToken, seitMs: jetzt, letzteAmMs: null, gemeldet: [] };
  if (!aktiv) return { ...alt, aktiv: false };
  return { ...alt, aktiv: true, seitMs: jetzt };
}

/**
 * Konstante Zeit (`crypto.timingSafeEqual`), damit ein Angreifer aus der
 * Antwortzeit keine Rueckschluesse auf das Abbestell-Token ziehen kann. `false`
 * bei fehlendem Wert, unterschiedlicher Laenge oder wenn beide leer sind - ein
 * leerer erwarteter Wert darf niemals "passen".
 */
export function tokenPasst(erwartet: string | undefined, erhalten: string | undefined): boolean {
  if (!erwartet || !erhalten) return false;
  const a = Buffer.from(erwartet, "utf8");
  const b = Buffer.from(erhalten, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
