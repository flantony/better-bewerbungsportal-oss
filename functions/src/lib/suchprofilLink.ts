import { deflateRawSync, inflateRawSync } from "node:zlib";
import { SUCHPROFILE_MAX, suchprofilSchema, type Suchprofil } from "../konto/kontoTypen";
import { hatSuchprofil } from "../konto/benachrichtigung";
import { PUBLIC_SITE_URL } from "../mcp/publicSite";
import { HinweisFehler } from "./hinweisFehler";

/**
 * Suchfilter als Link: die KI des Bewerbers stellt sie zusammen, der Bewerber
 * oeffnet den Link, meldet sich an, prueft und speichert.
 *
 * FORMAT: `v1.<base64url(deflate-raw(JSON))>` im FRAGMENT der URL (nach `#`).
 * Das Fragment schickt kein Browser an einen Server - die Filter landen also
 * weder bei uns noch in einem Request-Log. Die JSON-Nutzlast ist
 * `{ "filter": Suchprofil[], "namen"?: (string | null)[] }`.
 *
 * GESPIEGELT in web/src/features/konto/lib/suchprofil-link.ts (eigenes Paket,
 * dekodiert im Browser). Grenzen und Fehlercodes muessen uebereinstimmen; das
 * pruefen suchprofilLink.test.ts (Grenzwerte, Feldliste) und ein gemeinsames
 * Fixture in beiden Testsuiten.
 */

// ─── Grenzen ─────────────────────────────────────────────────────────────────

/** Hoechstens so viele Suchfilter je Link - dieselbe Grenze wie je Konto. */
export { SUCHPROFILE_MAX };
/**
 * Laenge des Fragments ohne `#`. Chat-Oberflaechen und Mailprogramme kuerzen
 * oder umbrechen sehr lange Links; 4000 Zeichen kommen ueberall heil an.
 */
export const LINK_MAX_ZEICHEN = 4000;
/** Ein Name ist eine Ueberschrift fuer den Bewerber, kein Freitextfeld. */
export const NAME_MAX_ZEICHEN = 60;
/** Schutz gegen eine Kompressionsbombe im Fragment. */
export const ENTPACKT_MAX_BYTES = 64 * 1024;

export const SUCHPROFIL_LINK_VERSION = "v1";
export const SUCHPROFIL_LINK_PFAD = "/suchprofil/uebernehmen";

// ─── Ergebnis ────────────────────────────────────────────────────────────────

export type SuchprofilLinkFehlerCode = "leer" | "zu-lang" | "version" | "kaputt" | "zu-viele" | "ungueltig";

export type SuchprofilLinkErgebnis =
  | { ok: true; filter: Suchprofil[]; namen: (string | null)[] }
  | { ok: false; code: SuchprofilLinkFehlerCode; grund: string; filterNummer?: number };

export class SuchprofilLinkFehler extends HinweisFehler {
  constructor(
    readonly code: SuchprofilLinkFehlerCode,
    readonly grund: string,
    readonly filterNummer?: number,
  ) {
    super(grund);
    this.name = "SuchprofilLinkFehler";
  }
}

const GRUND_KAPUTT =
  "Der Link ist beschädigt oder unvollständig, vermutlich wurde er beim Kopieren abgeschnitten. Kopiere ihn bitte vollständig oder lass ihn dir neu erstellen.";

function fehler(code: SuchprofilLinkFehlerCode, grund: string, filterNummer?: number): SuchprofilLinkErgebnis {
  return { ok: false, code, grund, ...(filterNummer !== undefined ? { filterNummer } : {}) };
}

// ─── Pruefen und vereinheitlichen ────────────────────────────────────────────

/**
 * Leere Listen und leere Texte fallen weg: in queryJobs ist eine leere Liste
 * kein "egal", sondern je nach Feld ein Filter auf nichts (wie `ohneLeeres` im
 * Web). Texte werden getrimmt.
 */
function ohneLeeres(filter: Suchprofil): Suchprofil {
  const eintraege = Object.entries(filter)
    .map(([feld, wert]) => [feld, typeof wert === "string" ? wert.trim() : wert] as const)
    .filter(([, wert]) => (Array.isArray(wert) ? wert.length > 0 : wert !== undefined && wert !== ""));
  return Object.fromEntries(eintraege) as Suchprofil;
}

function bereinigeName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const getrimmt = name.trim();
  return getrimmt ? getrimmt : null;
}

/**
 * Prueft einen Satz Filter samt Namen. Gemeinsam fuer Kodieren und Dekodieren,
 * damit ein Link, den der Server baut, auch immer wieder gelesen werden kann.
 */
function pruefe(filterRoh: unknown[], namenRoh: unknown[] | undefined): SuchprofilLinkErgebnis {
  if (filterRoh.length === 0) return fehler("leer", "Der Link enthält keine Suchfilter.");
  if (filterRoh.length > SUCHPROFILE_MAX) {
    return fehler(
      "zu-viele",
      `Der Link enthält ${filterRoh.length} Suchfilter, höchstens ${SUCHPROFILE_MAX} sind möglich. Bitte lass ihn dir mit weniger Filtern neu erstellen.`,
    );
  }
  if (namenRoh && namenRoh.length > filterRoh.length) return fehler("kaputt", GRUND_KAPUTT);

  const filter: Suchprofil[] = [];
  for (const [index, roh] of filterRoh.entries()) {
    const nummer = index + 1;
    const pruefung = suchprofilSchema.safeParse(roh);
    if (!pruefung.success) {
      // Nur der Feldname, nie der Wert - die Meldung landet auf dem Bildschirm
      // und unter Umstaenden in einem Fehlerbericht.
      const feld = pruefung.error.issues[0]?.path[0];
      const wo = typeof feld === "string" ? ` (Feld „${feld}“)` : "";
      return fehler(
        "ungueltig",
        `Suchfilter ${nummer} ist ungültig${wo}. Bitte lass dir den Link neu erstellen.`,
        nummer,
      );
    }
    const bereinigt = ohneLeeres(pruefung.data);
    if (!hatSuchprofil(bereinigt)) {
      return fehler(
        "ungueltig",
        `Suchfilter ${nummer} schränkt nichts ein und würde jede neue Stelle melden. Lass dir den Link bitte mit einem genaueren Filter neu erstellen.`,
        nummer,
      );
    }
    filter.push(bereinigt);
  }

  const namen: (string | null)[] = [];
  for (let index = 0; index < filter.length; index++) {
    const roh = namenRoh?.[index];
    if (roh !== undefined && roh !== null && typeof roh !== "string") return fehler("kaputt", GRUND_KAPUTT);
    const name = bereinigeName(roh);
    if (name && name.length > NAME_MAX_ZEICHEN) {
      return fehler(
        "ungueltig",
        `Der Name von Suchfilter ${index + 1} ist länger als ${NAME_MAX_ZEICHEN} Zeichen.`,
        index + 1,
      );
    }
    namen.push(name);
  }
  return { ok: true, filter, namen };
}

// ─── Kodieren ────────────────────────────────────────────────────────────────

/**
 * Baut das Fragment (ohne `#`). Wirft `SuchprofilLinkFehler`, wenn die Filter
 * ungueltig sind oder der Link zu lang wuerde - ein Link, den die Uebernahme
 * ablehnen wuerde, wird gar nicht erst herausgegeben.
 */
export function kodiereSuchprofile(filter: Suchprofil[], namen?: (string | null | undefined)[]): string {
  const geprueft = pruefe(filter, namen);
  if (!geprueft.ok) throw new SuchprofilLinkFehler(geprueft.code, geprueft.grund, geprueft.filterNummer);

  const mitNamen = geprueft.namen.some((name) => name !== null);
  const nutzlast = JSON.stringify({ filter: geprueft.filter, ...(mitNamen ? { namen: geprueft.namen } : {}) });
  const fragment = `${SUCHPROFIL_LINK_VERSION}.${deflateRawSync(Buffer.from(nutzlast, "utf8"), { level: 9 }).toString("base64url")}`;

  if (fragment.length > LINK_MAX_ZEICHEN) {
    throw new SuchprofilLinkFehler(
      "zu-lang",
      `Der Link wäre ${fragment.length} Zeichen lang, höchstens ${LINK_MAX_ZEICHEN} sind möglich.`,
    );
  }
  return fragment;
}

/** Der vollstaendige Link zur Uebernahmeseite. */
export function baueSuchprofilLink(filter: Suchprofil[], namen?: (string | null | undefined)[]): string {
  return `${PUBLIC_SITE_URL}${SUCHPROFIL_LINK_PFAD}#${kodiereSuchprofile(filter, namen)}`;
}

// ─── Dekodieren ──────────────────────────────────────────────────────────────

const VERSION_MUSTER = /^v(\d+)\.([\s\S]*)$/;
const BASE64URL_MUSTER = /^[A-Za-z0-9_-]+$/;

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

/**
 * Liest ein Fragment (mit oder ohne fuehrendes `#`). Wirft nie: jede Ablehnung
 * kommt als `{ ok: false, code, grund }` mit einem Satz fuer den Bewerber.
 */
export function dekodiereSuchprofile(fragment: string): SuchprofilLinkErgebnis {
  const roh = fragment.trim().replace(/^#/, "");
  if (!roh) return fehler("leer", "Der Link enthält keine Suchfilter.");
  if (roh.length > LINK_MAX_ZEICHEN) {
    return fehler("zu-lang", `Der Link ist zu lang (höchstens ${LINK_MAX_ZEICHEN} Zeichen). Bitte lass ihn dir mit weniger Filtern neu erstellen.`);
  }

  const treffer = VERSION_MUSTER.exec(roh);
  if (!treffer) return fehler("kaputt", GRUND_KAPUTT);
  const [, version, daten] = treffer;
  if (`v${version}` !== SUCHPROFIL_LINK_VERSION) {
    return fehler(
      "version",
      `Dieser Link hat ein Format (v${version}), das diese Seite nicht kennt. Bitte lass ihn dir von deiner KI neu erstellen.`,
    );
  }
  if (!BASE64URL_MUSTER.test(daten)) return fehler("kaputt", GRUND_KAPUTT);

  let nutzlast: unknown;
  try {
    const json = inflateRawSync(Buffer.from(daten, "base64url"), { maxOutputLength: ENTPACKT_MAX_BYTES });
    nutzlast = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
  } catch {
    return fehler("kaputt", GRUND_KAPUTT);
  }

  if (!istObjekt(nutzlast)) return fehler("kaputt", GRUND_KAPUTT);
  const { filter, namen, ...rest } = nutzlast;
  if (!Array.isArray(filter) || Object.keys(rest).length > 0) return fehler("kaputt", GRUND_KAPUTT);
  if (namen !== undefined && !Array.isArray(namen)) return fehler("kaputt", GRUND_KAPUTT);
  return pruefe(filter, namen);
}
