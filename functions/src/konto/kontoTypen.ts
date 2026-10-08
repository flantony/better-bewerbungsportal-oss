import { z } from "zod/v3";
import { listJobsInputSchema } from "../mcp/tools/listJobs";
import {
  BUNDESLAND_NAMES,
  LAUFBAHNGRUPPE_BEDEUTUNG_DE,
  LAUFBAHNGRUPPE_NAMES,
  ORGANISATIONSBEREICH_NAMES,
} from "../mcp/lib/filterOptions";
import { VERTRAGSART_OPTIONS } from "../lib/onboardingOptions";
import { EINSTIEGSWEG_BEDEUTUNG_DE, EINSTIEGSWEG_WERTE } from "../lib/einstiegsweg";

export const KONTEN_COLLECTION = "konten";
export const KONTO_SCHEMA_VERSION = "konto-v1";
export const MERKLISTE_MAX = 200;

// Das Suchprofil IST ein list_jobs-Filter. Paging und Sortierung gehoeren zu einer einzelnen Abfrage, nicht
// zum Profil; das Alter ist eine Bewerberangabe und gehoert nicht hierher.
const {
  cursor: _cursor,
  limit: _limit,
  sortierung: _sortierung,
  alter: _alter,
  ...suchfelder
} = listJobsInputSchema;

// Das Konto ist ein eigener Speicher: ohne Obergrenzen liesse sich ueber den
// Endpunkt beliebig viel Text je Nutzer ablegen. Begrenzt wird nur HIER, damit
// list_jobs unveraendert bleibt; die Feldnamen bleiben dieselben (Test).
const TEXT_MAX = 100;
const LISTE_MAX = 30;

export const suchprofilSchema = z
  .object({
    ...suchfelder,
    suchbegriff: suchfelder.suchbegriff.unwrap().max(TEXT_MAX).optional(),
    wunschort: suchfelder.wunschort.unwrap().max(TEXT_MAX).optional(),
    organisationsbereich: suchfelder.organisationsbereich.unwrap().max(LISTE_MAX).optional(),
    laufbahngruppe: suchfelder.laufbahngruppe.unwrap().max(LISTE_MAX).optional(),
    vertragsarten: suchfelder.vertragsarten.unwrap().max(LISTE_MAX).optional(),
    bundesland: suchfelder.bundesland.unwrap().max(LISTE_MAX).optional(),
    einstiegswege: suchfelder.einstiegswege.unwrap().max(LISTE_MAX).optional(),
  })
  .strict();
export type Suchprofil = z.infer<typeof suchprofilSchema>;

// Ein Konto haelt mehrere Filter (die KI des Bewerbers kann sie aus einem
// Gespraech erzeugen). Ein Treffer
// auf irgendeinen aktiven Filter zaehlt. Die Obergrenze ist rein technisch -
// sie haelt Dokumentgroesse und Nachtlauf (je Filter eine Kandidatensuche)
// begrenzt.
export const SUCHPROFILE_MAX = 10;
export const SUCHPROFIL_NAME_MAX = 60;
export const SUCHPROFIL_QUELLEN = ["ki", "hand"] as const;
export type SuchprofilQuelle = (typeof SUCHPROFIL_QUELLEN)[number];

/**
 * Ein gespeicherter Filter. `id` erzeugt der Server zufaellig (nie aus
 * Feldwerten abgeleitet - keine PII in IDs); `filter` ist genau ein
 * `suchprofilSchema`-Wert.
 */
export interface SuchprofilEintrag {
  id: string;
  name?: string;
  filter: Suchprofil;
  aktiv: boolean;
  quelle: SuchprofilQuelle;
  erstelltAm: FirebaseFirestore.Timestamp;
}

export interface SuchprofilSicht {
  id: string;
  name?: string;
  filter: Suchprofil;
  aktiv: boolean;
  quelle: SuchprofilQuelle;
  erstelltAm: string;
}

export interface GemerkteStelle {
  pinstGuid: string;
  /** Millisekunden seit Epoch - die reine Logik rechnet ohne Firestore-Typen. */
  gemerktAm: number;
  /**
   * Zeitpunkt der Treffer-Mail, mit der die Stelle auf die Liste kam. Fehlt
   * bei allem, was der Nutzer selbst gemerkt hat.
   */
  ausMail?: number;
}

/**
 * Der Benachrichtigungs-Zustand eines Kontos. Fehlt der Schluessel ganz, war
 * noch nie eingeschaltet - kein leeres/false-Objekt, damit ein Dokument ohne
 * diesen Zweig gueltig bleibt (s. `normalisiere`).
 *
 * `abmeldeToken` und `gemeldet` verlassen den Server NIE (s. `KontoSicht`):
 * das Token traegt der Abbestell-Link, `gemeldet` ist reine Server-Buchhaltung
 * gegen doppelte Mails.
 */
export interface BenachrichtigungRecord {
  aktiv: boolean;
  abmeldeToken: string;
  seit: FirebaseFirestore.Timestamp;
  letzteAm: FirebaseFirestore.Timestamp | null;
  /** Hoechstens MAX_GEMELDET Eintraege (s. konto/benachrichtigung.ts). */
  gemeldet: string[];
}

/** Ein Merklisten-Eintrag, wie er in Firestore liegt (s. `GemerkteStelle`). */
export interface GemerkteStelleRecord {
  pinstGuid: string;
  gemerktAm: FirebaseFirestore.Timestamp;
  ausMail?: FirebaseFirestore.Timestamp;
}

/** Ein Merklisten-Eintrag fuer den Browser (ISO-Zeitpunkte). */
export interface GemerkteStelleSicht {
  pinstGuid: string;
  gemerktAm: string;
  ausMail?: string;
}

export interface KontoRecord {
  schemaVersion: string;
  erstelltAm: FirebaseFirestore.Timestamp;
  /** Ein Einzelfeld `suchprofil` im Dokument liest `normalisiere` als Eintrag dieser Liste (s. kontoStore.ts). */
  suchprofile: SuchprofilEintrag[];
  merkliste: GemerkteStelleRecord[];
  benachrichtigung?: BenachrichtigungRecord;
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

/**
 * Die Auswahllisten fuers Formular kommen vom Server, nicht aus einer Kopie im
 * Web: so kann das Formular nie einen Wert anbieten, den das Schema ablehnt.
 * Die Bedeutungstexte sind die DEUTSCHEN Fassungen - die englischen sind an
 * KI-Clients gerichtet und gehoeren nicht vor einen Bewerber.
 */
export const SUCHOPTIONEN: Suchoptionen = {
  organisationsbereich: [...ORGANISATIONSBEREICH_NAMES],
  laufbahngruppe: [...LAUFBAHNGRUPPE_NAMES],
  bundesland: [...BUNDESLAND_NAMES],
  vertragsarten: VERTRAGSART_OPTIONS.map((option) => option.value),
  einstiegswege: [...EINSTIEGSWEG_WERTE],
  laufbahngruppeBedeutung: Object.fromEntries(
    LAUFBAHNGRUPPE_NAMES.map((name) => [name, LAUFBAHNGRUPPE_BEDEUTUNG_DE[name] ?? ""]),
  ),
  einstiegswegBedeutung: Object.fromEntries(
    EINSTIEGSWEG_WERTE.map((weg) => [weg, EINSTIEGSWEG_BEDEUTUNG_DE[weg] ?? ""]),
  ),
};

export interface KontoSicht {
  suchprofile: SuchprofilSicht[];
  merkliste: GemerkteStelleSicht[];
  optionen: Suchoptionen;
  /**
   * Nur diese zwei Felder gehen an den Browser - nie das Token, nie
   * `gemeldet`. `emailBestaetigt` kommt aus dem geprueften ID-Token
   * (`email_verified`), nie aus Firestore (s. kontoStore.ladeOderLegeAn).
   */
  benachrichtigung: { aktiv: boolean; emailBestaetigt: boolean };
}
