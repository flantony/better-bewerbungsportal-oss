import { suchprofilFilterSchema } from '../api/schema';
import { SUCHPROFILE_MAX, type Suchoptionen, type Suchprofil } from '../api/types';
import { ohneLeeres } from './ohne-leeres';
import { schraenktEin } from './schraenkt-ein';

/**
 * Liest Suchfilter aus dem Fragment eines Uebernahme-Links
 * (`/suchprofil/uebernehmen#v1.…`). Die KI des Bewerbers baut den Link ueber
 * das MCP-Werkzeug `erstelle_suchprofil_link`; das Fragment erreicht nie einen
 * Server und steht in keinem Log.
 *
 * FORMAT: `v1.<base64url(deflate-raw(JSON))>`, JSON-Nutzlast
 * `{ "filter": Suchprofil[], "namen"?: (string | null)[] }`.
 *
 * SPIEGEL von functions/src/lib/suchprofilLink.ts (eigenes Paket). Grenzen,
 * Fehlercodes und Pruefreihenfolge muessen uebereinstimmen; ein Test dort liest
 * die Grenzwerte und die Fixture-Zeichenkette aus dieser Datei bzw. ihrem Test.
 */

// ─── Grenzen (Spiegel) ──────────────────────────────────────────────────────

export { SUCHPROFILE_MAX };
export const LINK_MAX_ZEICHEN = 4000;
export const NAME_MAX_ZEICHEN = 60;
export const ENTPACKT_MAX_BYTES = 64 * 1024;
export const SUCHPROFIL_LINK_VERSION = 'v1';

// ─── Ergebnis ───────────────────────────────────────────────────────────────

export type SuchprofilLinkFehlerCode =
  | 'leer'
  | 'zu-lang'
  | 'version'
  | 'kaputt'
  | 'zu-viele'
  | 'ungueltig';

export type SuchprofilLinkErgebnis =
  | { ok: true; filter: Suchprofil[]; namen: (string | null)[] }
  | { ok: false; code: SuchprofilLinkFehlerCode; grund: string; filterNummer?: number };

const GRUND_KAPUTT =
  'Der Link ist beschädigt oder unvollständig, vermutlich wurde er beim Kopieren abgeschnitten. Kopiere ihn bitte vollständig oder lass ihn dir neu erstellen.';

function fehler(
  code: SuchprofilLinkFehlerCode,
  grund: string,
  filterNummer?: number
): SuchprofilLinkErgebnis {
  return { ok: false, code, grund, ...(filterNummer !== undefined ? { filterNummer } : {}) };
}

// ─── Pruefen ────────────────────────────────────────────────────────────────

const LISTENFELDER = [
  'organisationsbereich',
  'laufbahngruppe',
  'bundesland',
  'vertragsarten',
  'einstiegswege'
] as const;

/** Texte getrimmt, leere Listen und Texte weg - wie der Server beim Kodieren. */
function bereinige(filter: Suchprofil): Suchprofil {
  const getrimmt = Object.fromEntries(
    Object.entries(filter).map(([feld, wert]) => [
      feld,
      typeof wert === 'string' ? wert.trim() : wert
    ])
  ) as Suchprofil;
  return ohneLeeres(getrimmt);
}

/** Ein Wert, den der Server nicht anbietet - nur pruefbar, wenn die Optionen vorliegen. */
function unbekanntesListenfeld(filter: Suchprofil, optionen: Suchoptionen): string | null {
  for (const feld of LISTENFELDER) {
    const erlaubt = new Set(optionen[feld]);
    if ((filter[feld] ?? []).some((wert) => !erlaubt.has(wert))) return feld;
  }
  return null;
}

function pruefe(
  filterRoh: unknown[],
  namenRoh: unknown[] | undefined,
  optionen: Suchoptionen | undefined
): SuchprofilLinkErgebnis {
  if (filterRoh.length === 0) return fehler('leer', 'Der Link enthält keine Suchfilter.');
  if (filterRoh.length > SUCHPROFILE_MAX) {
    return fehler(
      'zu-viele',
      `Der Link enthält ${filterRoh.length} Suchfilter, höchstens ${SUCHPROFILE_MAX} sind möglich. Bitte lass ihn dir mit weniger Filtern neu erstellen.`
    );
  }
  if (namenRoh && namenRoh.length > filterRoh.length) return fehler('kaputt', GRUND_KAPUTT);

  const filter: Suchprofil[] = [];
  for (const [index, roh] of filterRoh.entries()) {
    const nummer = index + 1;
    const pruefung = suchprofilFilterSchema.safeParse(roh);
    const feld = pruefung.success
      ? optionen
        ? unbekanntesListenfeld(pruefung.data, optionen)
        : null
      : pruefung.error.issues[0]?.path[0];
    if (!pruefung.success || feld) {
      // Nur der Feldname, nie der Wert.
      const wo = typeof feld === 'string' ? ` (Feld „${feld}“)` : '';
      return fehler(
        'ungueltig',
        `Suchfilter ${nummer} ist ungültig${wo}. Bitte lass dir den Link neu erstellen.`,
        nummer
      );
    }
    const bereinigt = bereinige(pruefung.data);
    if (!schraenktEin(bereinigt)) {
      return fehler(
        'ungueltig',
        `Suchfilter ${nummer} schränkt nichts ein und würde jede neue Stelle melden. Lass dir den Link bitte mit einem genaueren Filter neu erstellen.`,
        nummer
      );
    }
    filter.push(bereinigt);
  }

  const namen: (string | null)[] = [];
  for (let index = 0; index < filter.length; index++) {
    const roh = namenRoh?.[index];
    if (roh !== undefined && roh !== null && typeof roh !== 'string') {
      return fehler('kaputt', GRUND_KAPUTT);
    }
    const name = typeof roh === 'string' && roh.trim() ? roh.trim() : null;
    if (name && name.length > NAME_MAX_ZEICHEN) {
      return fehler(
        'ungueltig',
        `Der Name von Suchfilter ${index + 1} ist länger als ${NAME_MAX_ZEICHEN} Zeichen.`,
        index + 1
      );
    }
    namen.push(name);
  }
  return { ok: true, filter, namen };
}

// ─── Entpacken ──────────────────────────────────────────────────────────────

const VERSION_MUSTER = /^v(\d+)\.([\s\S]*)$/;
const BASE64URL_MUSTER = /^[A-Za-z0-9_-]+$/;

function base64urlZuBytes(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binaer = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i++) bytes[i] = binaer.charCodeAt(i);
  return bytes;
}

/**
 * Entpackt mit Obergrenze: ein Fragment von 4000 Zeichen koennte sonst zu
 * Megabytes aufgehen (Kompressionsbombe). `null` bei jedem Fehler.
 */
async function entpacke(bytes: Uint8Array): Promise<string | null> {
  const kopie = new Uint8Array(bytes.byteLength);
  kopie.set(bytes);
  const reader = new Blob([kopie])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const teile: Uint8Array[] = [];
  let laenge = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      laenge += value.byteLength;
      if (laenge > ENTPACKT_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      teile.push(value);
    }
  } catch {
    return null;
  }
  const gesamt = new Uint8Array(laenge);
  let pos = 0;
  for (const teil of teile) {
    gesamt.set(teil, pos);
    pos += teil.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(gesamt);
  } catch {
    return null;
  }
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

// ─── Dekodieren ─────────────────────────────────────────────────────────────

/**
 * Liest ein Fragment (mit oder ohne fuehrendes `#`, z.B. `location.hash`).
 * Wirft nie: jede Ablehnung kommt als `{ ok: false, code, grund }` mit einem
 * Satz fuer den Bewerber.
 *
 * `optionen` (aus `KontoSicht.optionen`) prueft zusaetzlich die Werte der
 * Auswahllisten. Ohne sie werden nur Feldnamen, Typen und Grenzen geprueft -
 * der Server lehnt einen unbekannten Wert beim Speichern ohnehin ab.
 */
export async function dekodiereSuchprofile(
  fragment: string,
  optionen?: Suchoptionen
): Promise<SuchprofilLinkErgebnis> {
  const roh = fragment.trim().replace(/^#/, '');
  if (!roh) return fehler('leer', 'Der Link enthält keine Suchfilter.');
  if (roh.length > LINK_MAX_ZEICHEN) {
    return fehler(
      'zu-lang',
      `Der Link ist zu lang (höchstens ${LINK_MAX_ZEICHEN} Zeichen). Bitte lass ihn dir mit weniger Filtern neu erstellen.`
    );
  }

  const treffer = VERSION_MUSTER.exec(roh);
  if (!treffer) return fehler('kaputt', GRUND_KAPUTT);
  const [, version, daten] = treffer;
  if (`v${version}` !== SUCHPROFIL_LINK_VERSION) {
    return fehler(
      'version',
      `Dieser Link hat ein Format (v${version}), das diese Seite nicht kennt. Bitte lass ihn dir von deiner KI neu erstellen.`
    );
  }
  if (!BASE64URL_MUSTER.test(daten)) return fehler('kaputt', GRUND_KAPUTT);

  let bytes: Uint8Array;
  try {
    bytes = base64urlZuBytes(daten);
  } catch {
    return fehler('kaputt', GRUND_KAPUTT);
  }
  const json = await entpacke(bytes);
  if (json === null) return fehler('kaputt', GRUND_KAPUTT);

  let nutzlast: unknown;
  try {
    nutzlast = JSON.parse(json);
  } catch {
    return fehler('kaputt', GRUND_KAPUTT);
  }

  if (!istObjekt(nutzlast)) return fehler('kaputt', GRUND_KAPUTT);
  const { filter, namen, ...rest } = nutzlast;
  if (!Array.isArray(filter) || Object.keys(rest).length > 0) return fehler('kaputt', GRUND_KAPUTT);
  if (namen !== undefined && !Array.isArray(namen)) return fehler('kaputt', GRUND_KAPUTT);
  return pruefe(filter, namen, optionen);
}
