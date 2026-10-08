import type { KontoSicht } from '../api/types';
import { schraenktEin } from './schraenkt-ein';

export type BenachrichtigungsZustand = 'nicht-verfuegbar' | 'kein-profil' | 'unbestaetigt' | 'bereit';

/**
 * Entscheidet, ob der Benachrichtigungs-Schalter bedienbar ist und, falls
 * nicht, warum: ohne einen aktiven Filter gibt es nichts, wogegen neue
 * Stellen abgeglichen werden koennten (pausierte zaehlen nicht, wie im
 * Nachtlauf, s. aktiveSuchfilter in functions/src/konto/suchprofile.ts); ohne bestaetigte Mail waere eine
 * Benachrichtigung ein Zustellversuch an eine Adresse, die der Bewerber
 * vielleicht gar nicht besitzt (s. kontoBenachrichtigungSetzen).
 *
 * 'nicht-verfuegbar': die Serverantwort enthaelt keine `benachrichtigung` -
 * dann fehlen auch die Endpunkte dahinter (s. nicht-verfuegbar.ts). Ein Filter ohne einschraenkenden Wert (auch nur 'beide'
 * aus den Formular-Vorgaben) zaehlt wie keiner: er hiesse "alle Stellen", das
 * lehnt der Server ab (s. schraenktEin).
 */
export function benachrichtigungsZustand(sicht: KontoSicht): BenachrichtigungsZustand {
  if (!sicht.benachrichtigung) return 'nicht-verfuegbar';
  if (!sicht.suchprofile.some((eintrag) => eintrag.aktiv && schraenktEin(eintrag.filter))) return 'kein-profil';
  if (!sicht.benachrichtigung.emailBestaetigt) return 'unbestaetigt';
  return 'bereit';
}
