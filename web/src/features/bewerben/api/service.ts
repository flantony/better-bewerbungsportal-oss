import type * as z from 'zod';
import { kontoAufruf } from '@/features/konto/api/service';
import { KontoFehler } from '@/features/konto/api/fehler';
import { istNichtVerfuegbarFehler } from '@/features/konto/lib/nicht-verfuegbar';
import { bewerbungsplanSchema, bewerbungspaketAntwortSchema } from './schema';
import type { Bewerbungsplan, BewerbungspaketAntwort } from './types';

export { KontoFehler, fehlerAusAntwort } from '@/features/konto/api/fehler';

/** Ergebnis eines Ladevorgangs, dessen Endpunkt auf dem Server fehlen kann (s. nicht-verfuegbar.ts). */
export type NichtVerfuegbar = 'nicht-verfuegbar';

const UNERWARTETE_ANTWORT = 'Die Antwort des Servers war unerwartet. Bitte lade die Seite neu.';

/** Prueft eine Serverantwort gegen ihr Schema - weicht sie ab, derselbe 502-Fehler wie beim Konto. */
function geprueft<T>(schema: z.ZodType<T>, wert: unknown): T {
  const ergebnis = schema.safeParse(wert);
  if (!ergebnis.success) throw new KontoFehler(UNERWARTETE_ANTWORT, 502);
  return ergebnis.data;
}

/**
 * Laedt den Bewerbungsplan fuer eine Stelle. 404 bedeutet zweierlei - der
 * Endpunkt ist auf dem Server nicht ausgerollt ODER die Stelle gibt es
 * nicht - `kontoBewerbungsplan` liefert in beiden Faellen 404 (s.
 * kontoHttp.ts). Beides behandelt der Aufrufer gleich: kein Bewerben-Knopf,
 * keine geladene Seite (s. nicht-verfuegbar.ts) - fuer eine
 * tatsaechlich unbekannte Stelle landet ein Redirect zur Detailseite ohnehin
 * bei Next.js' eigenem "nicht gefunden".
 */
export async function ladeBewerbungsplan(pinstGuid: string): Promise<Bewerbungsplan | NichtVerfuegbar> {
  try {
    const antwort = await kontoAufruf(`kontoBewerbungsplan?pinstGuid=${encodeURIComponent(pinstGuid)}`, 'GET');
    return geprueft(bewerbungsplanSchema, await antwort.json());
  } catch (fehler) {
    if (istNichtVerfuegbarFehler(fehler)) return 'nicht-verfuegbar';
    throw fehler;
  }
}

export interface BewerbungspaketAnfrage {
  pinstGuid: string;
  formulare: string[];
  unterlagen: string[];
  anschreiben?: string;
  lebenslauf?: string;
  luekenAkzeptiert?: boolean;
}

/**
 * Baut das Bewerbungspaket. Die Bewerberangaben selbst gehen hier NIE mit -
 * nur `pinstGuid`, gewaehlte docIds und die beiden Texte; der
 * Server liest `privat/angaben` selbst. Ein 400 kommt mit einem fertigen Satz
 * vom Server (z.B. fehlende Formularangaben) - der Aufrufer zeigt ihn direkt.
 */
export async function baueBewerbungspaket(anfrage: BewerbungspaketAnfrage): Promise<BewerbungspaketAntwort> {
  let antwort: Response;
  try {
    antwort = await kontoAufruf('kontoBewerbungspaketBauen', 'POST', anfrage);
  } catch (fehler) {
    // fetch scheitert mit TypeError ("Failed to fetch") bei Netzwerkabbruch,
    // Zeitueberschreitung oder abgebrochener Function - nie englisch anzeigen.
    if (fehler instanceof TypeError) throw new Error(PAKET_NICHT_ERSTELLT, { cause: fehler });
    throw fehler;
  }
  return geprueft(bewerbungspaketAntwortSchema, await antwort.json());
}

export const PAKET_NICHT_ERSTELLT = 'Das Paket konnte gerade nicht erstellt werden. Bitte versuch es gleich noch einmal.';
