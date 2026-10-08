// Reine Logik der gespeicherten Filter eines Kontos (mehrere Filter je
// Konto) - keine Firestore-Aufrufe. Der Store
// (kontoStore.ts) liest, ruft diese Funktionen und schreibt in derselben
// Transaktion.
import { randomBytes } from "crypto";
import { hatSuchprofil } from "./benachrichtigung";
import { SUCHPROFILE_MAX, type Suchprofil, type SuchprofilEintrag, type SuchprofilQuelle } from "./kontoTypen";

/**
 * Feste Kennung fuer den Filter, der aus dem Einzelfeld `suchprofil` eines
 * Kontodokuments entsteht (s. `normalisiere`). Fest statt zufaellig, weil die Umwandlung bei
 * jedem Lesen passiert, bis das Konto das erste Mal neu geschrieben wird - eine
 * zufaellige Kennung waere bei jedem Laden eine andere, und "aendern"/"loeschen"
 * per id liefen ins Leere.
 */
export const ALTES_SUCHPROFIL_ID = "bisher";

/** 72 Bit Zufall, URL-sicher - nie aus Feldwerten abgeleitet. */
export function neueSuchprofilId(): string {
  return randomBytes(9).toString("base64url");
}

/**
 * Ein Feldwert ohne Wirkung auf die Suche - dieselben Regeln wie
 * `hatSuchprofil` (benachrichtigung.ts), nur `besoldungstabelle` bleibt
 * stehen: sie ist allein wirkungslos, unterscheidet aber zwei Filter mit
 * derselben Mindeststufe.
 */
function istNeutral(feld: string, wert: unknown): boolean {
  if (wert === undefined || wert === null) return true;
  if (Array.isArray(wert)) return wert.length === 0;
  if (typeof wert === "string" && wert.trim() === "") return true;
  if ((feld === "taetigkeitsbereich" || feld === "beschaeftigungsumfang") && wert === "beide") return true;
  if (feld === "seiteneinstieg") return wert !== true;
  return false;
}

// Codepunkt-Vergleich statt localeCompare: die Kennung darf nicht von der
// Locale der Laufzeit abhaengen.
const vergleiche = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

/**
 * Kanonische Form eines Filters fuer den Dublettenvergleich: neutrale Werte
 * weg, Schluessel und Listen sortiert, Texte getrimmt. `{ bundesland: ["Bayern",
 * "Berlin"], taetigkeitsbereich: "beide" }` aus dem Formular und
 * `{ bundesland: ["Berlin", "Bayern"] }` von einer KI sind derselbe Filter.
 */
export function filterKennung(filter: Suchprofil): string {
  const eintraege = Object.entries(filter)
    .filter(([feld, wert]) => !istNeutral(feld, wert))
    .map(([feld, wert]) => [
      feld,
      Array.isArray(wert) ? [...wert].sort(vergleiche) : typeof wert === "string" ? wert.trim() : wert,
    ] as const)
    .sort(([a], [b]) => vergleiche(a, b));
  return JSON.stringify(eintraege);
}

export interface NeuerFilter {
  filter: Suchprofil;
  name?: string;
  quelle: SuchprofilQuelle;
}

export type HinzufuegeErgebnis =
  | { ok: true; liste: SuchprofilEintrag[]; hinzugefuegt: string[]; uebersprungen: number }
  | { ok: false; frei: number };

/**
 * Haengt neue Filter an. Ein Filter, der (kanonisch) schon gespeichert ist -
 * oder im selben Aufruf schon einmal vorkam -, wird uebersprungen und nur
 * gezaehlt. Passen die uebrigen nicht mehr unter `SUCHPROFILE_MAX`, wird
 * NICHTS angehaengt: ein halber Import waere schwerer zu verstehen als eine
 * klare Ablehnung mit der Zahl der freien Plaetze.
 */
export function fuegeSuchprofileHinzu(
  liste: SuchprofilEintrag[],
  neue: NeuerFilter[],
  erstelltAm: FirebaseFirestore.Timestamp,
  erzeugeId: () => string = neueSuchprofilId,
): HinzufuegeErgebnis {
  const bekannt = new Set(liste.map((e) => filterKennung(e.filter)));
  const ids = new Set(liste.map((e) => e.id));
  const anzuhaengen: SuchprofilEintrag[] = [];
  let uebersprungen = 0;
  for (const neu of neue) {
    const kennung = filterKennung(neu.filter);
    if (bekannt.has(kennung)) {
      uebersprungen++;
      continue;
    }
    bekannt.add(kennung);
    let id = erzeugeId();
    while (ids.has(id)) id = erzeugeId();
    ids.add(id);
    anzuhaengen.push({
      id,
      ...(neu.name ? { name: neu.name } : {}),
      filter: neu.filter,
      aktiv: true,
      quelle: neu.quelle,
      erstelltAm,
    });
  }
  if (liste.length + anzuhaengen.length > SUCHPROFILE_MAX) {
    return { ok: false, frei: Math.max(0, SUCHPROFILE_MAX - liste.length) };
  }
  return { ok: true, liste: [...liste, ...anzuhaengen], hinzugefuegt: anzuhaengen.map((e) => e.id), uebersprungen };
}

/** Ein leerer `name` entfernt den Namen. */
export interface SuchprofilAenderung {
  filter?: Suchprofil;
  name?: string;
  aktiv?: boolean;
}

export type AenderErgebnis = { ok: true; liste: SuchprofilEintrag[] } | { ok: false; grund: "unbekannt" | "doppelt" };

/**
 * Aendert genau einen Filter. Wuerde er dadurch zur Dublette eines ANDEREN
 * gespeicherten Filters, wird abgelehnt statt zusammengelegt - stillschweigend
 * einen Filter zu verlieren, waere fuer den Bewerber nicht nachvollziehbar.
 */
export function aendereSuchprofil(liste: SuchprofilEintrag[], id: string, aenderung: SuchprofilAenderung): AenderErgebnis {
  const index = liste.findIndex((e) => e.id === id);
  if (index < 0) return { ok: false, grund: "unbekannt" };
  if (aenderung.filter) {
    const kennung = filterKennung(aenderung.filter);
    if (liste.some((e, i) => i !== index && filterKennung(e.filter) === kennung)) return { ok: false, grund: "doppelt" };
  }
  const { name: alterName, ...alt } = liste[index];
  const name = aenderung.name === undefined ? alterName : aenderung.name;
  // Kein `name: undefined` - ein explizites undefined lehnt das Admin SDK ab.
  const neu: SuchprofilEintrag = {
    ...alt,
    ...(name ? { name } : {}),
    filter: aenderung.filter ?? alt.filter,
    aktiv: aenderung.aktiv ?? alt.aktiv,
  };
  return { ok: true, liste: liste.map((e, i) => (i === index ? neu : e)) };
}

export function entferneSuchprofil(liste: SuchprofilEintrag[], id: string): SuchprofilEintrag[] {
  return liste.filter((e) => e.id !== id);
}

/**
 * Die Filter, die der Nachtlauf tatsaechlich abfragt: nur aktive, und nur
 * solche, die die Suche ueberhaupt einschraenken - ein Filter ohne
 * Einschraenkung hiesse "alle Stellen".
 */
export function aktiveSuchfilter(liste: readonly Pick<SuchprofilEintrag, "aktiv" | "filter">[]): Suchprofil[] {
  return liste.filter((e) => e.aktiv && hatSuchprofil(e.filter)).map((e) => e.filter);
}

export function hatAktivenSuchfilter(liste: readonly Pick<SuchprofilEintrag, "aktiv" | "filter">[]): boolean {
  return aktiveSuchfilter(liste).length > 0;
}
