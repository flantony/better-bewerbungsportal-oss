import type * as z from 'zod';
import { clientAuth } from '@/lib/firebase/client';
import { FUNCTIONS_BASE_URL } from '@/config/functions';
import { istNichtVerfuegbarFehler } from '../lib/nicht-verfuegbar';
import { fehlerAusAntwort, KontoFehler } from './fehler';
import {
  angabenSichtSchema,
  kontoSichtSchema,
  suchfilterTrefferSchema,
  suchprofileAntwortSchema,
  unterlageDownloadUrlSchema,
  unterlagenListeSchema,
  unterlageSichtSchema,
  unterlageUploadUrlAntwortSchema
} from './schema';
import type {
  AngabenAnfrage,
  AngabenSicht,
  KontoSicht,
  MerkErgebnis,
  NeuerSuchfilter,
  SuchfilterAenderung,
  SuchfilterTreffer,
  SuchprofileAntwort,
  UnterlageArt,
  UnterlageSicht
} from './types';

export { KontoFehler, fehlerAusAntwort } from './fehler';

/** Ergebnis eines Ladevorgangs, dessen Endpunkt auf dem Server fehlen kann (s. lib/nicht-verfuegbar.ts). */
export type NichtVerfuegbar = 'nicht-verfuegbar';

const UNERWARTETE_ANTWORT = 'Die Antwort des Servers war unerwartet. Bitte lade die Seite neu.';

/** Prueft eine Serverantwort gegen ihr Schema - weicht sie ab, derselbe 502-Fehler wie bei den Ladefunktionen. */
function geprueft<T>(schema: z.ZodType<T>, wert: unknown): T {
  const ergebnis = schema.safeParse(wert);
  if (!ergebnis.success) throw new KontoFehler(UNERWARTETE_ANTWORT, 502);
  return ergebnis.data;
}

/**
 * Exportiert: der Bewerben-Assistent (`features/bewerben`)
 * braucht denselben Ablauf (ID-Token, 401-Wiederholung) fuer seine eigenen
 * Endpunkte (`kontoBewerbungsplan`, `kontoBewerbungspaketBauen`) - eine zweite
 * Kopie dieser Funktion wuerde bei einer kuenftigen Aenderung (z.B. an der
 * Wiederholungslogik) garantiert auseinanderlaufen.
 */
export async function kontoAufruf(pfad: string, methode: 'GET' | 'PUT' | 'POST', body?: unknown): Promise<Response> {
  const nutzer = clientAuth().currentUser;
  if (!nutzer) throw new KontoFehler('Bitte melde dich an.', 401);
  const senden = async (tokenErneuern: boolean) => {
    const init: RequestInit = {
      method: methode,
      headers: {
        Authorization: `Bearer ${await nutzer.getIdToken(tokenErneuern)}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      }
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch(`${FUNCTIONS_BASE_URL}/${pfad}`, init);
  };
  // Ein abgelaufenes ID-Token (nach einer Stunde offener Seite) kommt als 401
  // zurueck - genau ein Versuch mit frischem Token, keine Schleife.
  let antwort = await senden(false);
  if (antwort.status === 401) antwort = await senden(true);
  if (!antwort.ok) throw fehlerAusAntwort(antwort.status, await antwort.json().catch(() => null));
  return antwort;
}

export async function ladeKonto(): Promise<KontoSicht> {
  const antwort = await kontoAufruf('kontoLaden', 'GET');
  const geprueft = kontoSichtSchema.safeParse(await antwort.json());
  if (!geprueft.success) {
    throw new KontoFehler('Die Antwort des Servers war unerwartet. Bitte lade die Seite neu.', 502);
  }
  // Der Cast ist noetig, weil das Schema jeden Filter nur als losen Objekt-
  // Rahmen prueft: die Feldliste lebt in functions/src/konto/kontoTypen.ts, eine
  // zweite hier liefe auseinander. Der Server validiert jeden Filter beim
  // Speichern - was er zurueckgibt, hat er selbst angenommen.
  return geprueft.data as KontoSicht;
}

// ─── Mehrere Filter je Konto ────────────────────────────────────────────────
//
// Ein Endpunkt, drei Aktionen (s. kontoSuchprofileAendern in
// functions/src/kontoHttp.ts). Die Antwort traegt die vollstaendige neue
// Liste - der Aufrufer schreibt sie direkt in den Cache, ohne kontoLaden.

async function suchprofileAendern(body: unknown): Promise<SuchprofileAntwort> {
  const antwort = await kontoAufruf('kontoSuchprofileAendern', 'POST', body);
  // Cast wie bei ladeKonto: der Filter selbst wird nur als Rahmen geprueft.
  return geprueft(suchprofileAntwortSchema, await antwort.json()) as SuchprofileAntwort;
}

export async function fuegeSuchfilterHinzu(suchprofile: NeuerSuchfilter[]): Promise<SuchprofileAntwort> {
  return suchprofileAendern({ aktion: 'hinzufuegen', suchprofile });
}

export async function aendereSuchfilter(id: string, aenderung: SuchfilterAenderung): Promise<SuchprofileAntwort> {
  return suchprofileAendern({ aktion: 'aendern', id, ...aenderung });
}

export async function loescheSuchfilter(id: string): Promise<SuchprofileAntwort> {
  return suchprofileAendern({ aktion: 'loeschen', id });
}

/**
 * Trefferzahl eines gespeicherten Filters. Fehlt der Endpunkt noch (404 oder
 * TypeError, s. `istNichtVerfuegbarFehler`), kommt 'nicht-verfuegbar' - die
 * Karte zeigt dann einfach keine Zahl.
 */
export async function ladeSuchfilterTreffer(id: string): Promise<SuchfilterTreffer | NichtVerfuegbar> {
  try {
    const antwort = await kontoAufruf(`kontoSuchprofilTreffer?id=${encodeURIComponent(id)}`, 'GET');
    return geprueft(suchfilterTrefferSchema, await antwort.json());
  } catch (fehler) {
    if (istNichtVerfuegbarFehler(fehler)) return 'nicht-verfuegbar';
    throw fehler;
  }
}

export async function aendereMerkliste(
  pinstGuid: string,
  aktion: 'merken' | 'vergessen'
): Promise<MerkErgebnis | 'vergessen'> {
  const antwort = await kontoAufruf('kontoMerklisteAendern', 'POST', { pinstGuid, aktion });
  return (await antwort.json()).ergebnis;
}

export async function loescheKonto(): Promise<void> {
  await kontoAufruf('kontoLoeschen', 'POST', { bestaetigung: 'LOESCHEN' });
}

export async function setzeBenachrichtigung(aktiv: boolean): Promise<void> {
  await kontoAufruf('kontoBenachrichtigungSetzen', 'PUT', { aktiv });
}

// ─── Gemerkte Angaben ───────────────────────────────────────────────────────

export async function ladeAngaben(): Promise<AngabenSicht | NichtVerfuegbar> {
  try {
    const antwort = await kontoAufruf('kontoAngabenLaden', 'GET');
    const geprueft = angabenSichtSchema.safeParse(await antwort.json());
    if (!geprueft.success) {
      throw new KontoFehler(UNERWARTETE_ANTWORT, 502);
    }
    return geprueft.data;
  } catch (fehler) {
    if (istNichtVerfuegbarFehler(fehler)) return 'nicht-verfuegbar';
    throw fehler;
  }
}

export async function speichereAngaben(anfrage: AngabenAnfrage): Promise<void> {
  await kontoAufruf('kontoAngabenSpeichern', 'PUT', anfrage);
}

export async function widerrufeStaatsangehoerigkeit(): Promise<void> {
  await kontoAufruf('kontoStaatsangehoerigkeitWiderrufen', 'POST', {});
}

export async function loescheAngaben(): Promise<void> {
  await kontoAufruf('kontoAngabenLoeschen', 'POST', { bestaetigung: 'LOESCHEN' });
}

// ─── Unterlagen ─────────────────────────────────────────────────────────────

export async function ladeUnterlagen(): Promise<UnterlageSicht[] | NichtVerfuegbar> {
  try {
    const antwort = await kontoAufruf('kontoUnterlagen', 'GET');
    const geprueft = unterlagenListeSchema.safeParse(await antwort.json());
    if (!geprueft.success) {
      throw new KontoFehler(UNERWARTETE_ANTWORT, 502);
    }
    return geprueft.data;
  } catch (fehler) {
    if (istNichtVerfuegbarFehler(fehler)) return 'nicht-verfuegbar';
    throw fehler;
  }
}

export interface UnterlageUploadUrlAntwort {
  docId: string;
  uploadUrl: string;
  pflichtHeader: Record<string, string>;
}

export async function holeUnterlageUploadUrl(anfrage: {
  art: UnterlageArt;
  dateiname: string;
  contentType: string;
  sizeBytes: number;
}): Promise<UnterlageUploadUrlAntwort> {
  const antwort = await kontoAufruf('kontoUnterlageUploadUrl', 'POST', anfrage);
  return geprueft(unterlageUploadUrlAntwortSchema, await antwort.json());
}

export async function registriereUnterlage(docId: string): Promise<UnterlageSicht> {
  const antwort = await kontoAufruf('kontoUnterlageRegistrieren', 'POST', { docId });
  return geprueft(unterlageSichtSchema, await antwort.json());
}

export async function holeUnterlageDownloadUrl(docId: string): Promise<string> {
  const antwort = await kontoAufruf('kontoUnterlageDownloadUrl', 'POST', { docId });
  return geprueft(unterlageDownloadUrlSchema, await antwort.json()).url;
}

export async function loescheUnterlage(docId: string): Promise<void> {
  await kontoAufruf('kontoUnterlageLoeschen', 'POST', { docId });
}

// ─── Export (Art. 15/20 DSGVO) ──────────────────────────────────────────────

/**
 * Holt den Export ueber `kontoAufruf` (ID-Token, 401-Wiederholung) statt
 * ueber einen rohen Link - der Endpunkt verlangt Anmeldung. Der Aufrufer baut
 * daraus selbst einen Blob/ObjectURL-Download (s. daten-export.tsx), damit
 * die Datei nicht ueber die Adresszeile mit Bearer-Header aufgerufen werden
 * muesste. Fehlt der Endpunkt (404 oder, ueber Origins hinweg, TypeError -
 * s. `istNichtVerfuegbarFehler`), kommt 'nicht-verfuegbar' zurueck.
 */
// `unknown` schliesst 'nicht-verfuegbar' (NichtVerfuegbar) bereits ein.
export async function ladeExport(): Promise<unknown> {
  try {
    const antwort = await kontoAufruf('kontoExport', 'GET');
    return await antwort.json();
  } catch (fehler) {
    if (istNichtVerfuegbarFehler(fehler)) return 'nicht-verfuegbar';
    throw fehler;
  }
}
