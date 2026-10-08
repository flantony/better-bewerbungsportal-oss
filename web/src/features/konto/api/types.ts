export interface Suchprofil {
  suchbegriff?: string;
  organisationsbereich?: string[];
  laufbahngruppe?: string[];
  taetigkeitsbereich?: 'militaerisch' | 'zivil' | 'beide';
  vertragsarten?: string[];
  beschaeftigungsumfang?: 'vollzeit' | 'teilzeit' | 'beide';
  bundesland?: string[];
  wunschort?: string;
  einstiegswege?: string[];
  seiteneinstieg?: boolean;
  mindestbesoldung?: number;
  besoldungstabelle?: 'A' | 'E';
}

// Mehrere Filter je Konto. Spiegel von
// SUCHPROFILE_MAX/SUCHPROFIL_NAME_MAX in functions/src/konto/kontoTypen.ts -
// dort massgeblich, hier nur fuer Meldung und Eingabefeld.
export const SUCHPROFILE_MAX = 10;
export const SUCHPROFIL_NAME_MAX = 60;

export type SuchprofilQuelle = 'ki' | 'hand';

export interface SuchprofilEintrag {
  id: string;
  name?: string;
  filter: Suchprofil;
  aktiv: boolean;
  /** 'ki': von der KI des Bewerbers angelegt (Import), 'hand': im Formular. */
  quelle: SuchprofilQuelle;
  erstelltAm: string;
}

export interface NeuerSuchfilter {
  filter: Suchprofil;
  name?: string;
  quelle?: SuchprofilQuelle;
}

export interface SuchfilterAenderung {
  filter?: Suchprofil;
  /** Ein leerer Name entfernt den Namen. */
  name?: string;
  aktiv?: boolean;
}

export interface SuchprofileAntwort {
  ergebnis: 'hinzugefuegt' | 'geaendert' | 'geloescht';
  /** Nur bei 'hinzugefuegt': Kennungen der neu angelegten Filter. */
  hinzugefuegt?: string[];
  /** Nur bei 'hinzugefuegt': wie viele schon gespeicherte Filter uebersprungen wurden. */
  uebersprungen?: number;
  suchprofile: SuchprofilEintrag[];
}

export interface SuchfilterTreffer {
  anzahl: number;
  /** true: die Zahl ist eine Untergrenze (Lese-Deckel der Suche hat gegriffen). */
  mindestens: boolean;
}

export interface Suchoptionen {
  organisationsbereich: string[];
  laufbahngruppe: string[];
  bundesland: string[];
  vertragsarten: string[];
  einstiegswege: string[];
  laufbahngruppeBedeutung: Record<string, string>;
  einstiegswegBedeutung: Record<string, string>;
}

export interface Benachrichtigung {
  aktiv: boolean;
  emailBestaetigt: boolean;
}

export interface GemerkteStelle {
  pinstGuid: string;
  gemerktAm: string;
  /** Zeitpunkt der Treffer-Mail, mit der die Stelle auf die Liste kam; fehlt bei selbst gemerkten. */
  ausMail?: string;
}

export interface KontoSicht {
  suchprofile: SuchprofilEintrag[];
  merkliste: GemerkteStelle[];
  optionen: Suchoptionen;
  /** `null`, wenn die Serverantwort das Feld nicht enthaelt. */
  benachrichtigung: Benachrichtigung | null;
  /**
   * Angaben, Unterlagen und gefuehrte Bewerbung im Konto - vom Server gemeldet
   * (Funktionsschalter BEWERBERDATEN_IM_KONTO); `false`, wenn er es nicht schickt.
   */
  bewerberdatenAktiv: boolean;
}

export type MerkErgebnis = 'gemerkt' | 'schon-gemerkt' | 'liste-voll';

// Spiegel von MERKLISTE_MAX in functions/src/konto/kontoTypen.ts - dort ist es
// die massgebliche Grenze, hier nur fuer die Meldung an den Bewerber.
export const MERKLISTE_MAX = 200;

// ─── Gemerkte Angaben ───────────────────────────────────────────────────────

// Spiegel von ANGABEN_SCHLUESSEL in functions/src/fillBewerbungsbogen.ts - dort
// ist die Liste massgeblich, hier nur fuer Formularfelder und die reinen
// Web-Helfer (angaben-anfrage.ts).
export const ANGABEN_FELDER = [
  'nachname',
  'vorname',
  'geburtsdatum',
  'telefon',
  'email',
  'geburtsort',
  'strasse',
  'plz',
  'ort',
  'staatsangehoerigkeit',
  'studienabschluss',
  'fuehrerschein'
] as const;
export type AngabeFeld = (typeof ANGABEN_FELDER)[number];

// Alle Felder optional (leer = nicht gesetzt) - Feldwerte selbst werden nie
// geloggt, nie an ein LLM gegeben, nie in einen Index/eine Dokument-ID
// uebernommen (DSGVO, s. DSFA.md).
export type Angaben = Partial<Record<AngabeFeld, string>>;

export interface AngabenSicht {
  angaben: Angaben;
  staatsangehoerigkeitEingewilligtAm: string | null;
}

/** Spiegel von ANGABEN_TEXT_VERSION in functions/src/konto/angaben.ts - dort ist sie massgeblich. */
export const ANGABEN_TEXT_VERSION = 'staatsangehoerigkeit-v1';

export interface AngabenAnfrage extends Angaben {
  einwilligung?: { textVersion: string };
}

// ─── Unterlagen ─────────────────────────────────────────────────────────────

// Spiegel von UNTERLAGEN_ARTEN in functions/src/konto/unterlagen.ts. Keine
// Ausweiskopie: die nehmen wir nicht entgegen.
export const UNTERLAGEN_ARTEN = ['lebenslauf', 'zeugnis', 'sonstiges'] as const;
export type UnterlageArt = (typeof UNTERLAGEN_ARTEN)[number];

export interface UnterlageSicht {
  docId: string;
  art: UnterlageArt;
  dateiname: string;
  contentType: string;
  sizeBytes: number;
  hochgeladenAm: string;
}

// Spiegel der Grenzen aus functions/src/konto/unterlagen.ts - dort massgeblich,
// hier nur fuer den Hinweistext vor der Auswahl und die client-seitige
// Vorab-Pruefung (lib/unterlage-pruefung.ts).
export const MAX_UNTERLAGEN = 15;
export const MAX_UNTERLAGEN_BYTES = 50 * 1024 * 1024;
// Spiegel von MAX_DATEI_BYTES/ERLAUBTE_TYPEN in functions/src/mappe/uploadRegeln.ts.
export const MAX_DATEI_BYTES = 10 * 1024 * 1024;
export const ERLAUBTE_UNTERLAGEN_TYPEN = ['application/pdf', 'image/jpeg', 'image/png'] as const;
