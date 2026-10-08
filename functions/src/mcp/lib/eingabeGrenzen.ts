/**
 * Gemeinsame Eingabefelder und Laengengrenzen der Mappen-Werkzeuge.
 *
 * WOZU: ohne Obergrenze koennte ein einzelner Aufruf Megabytes an Text in die
 * PDF-Erzeugung schicken, und eine `mappenId` mit "/" waere ein fremder
 * Firestore-Pfad. Die Grenzen liegen weit ueber jedem echten Wert -
 * sie sollen Missbrauch abfangen, keinen Bewerber.
 *
 * Die Meldungen sind englisch wie die uebrigen Schema-Meldungen: sie gehen an
 * die anfragende KI, nicht an den Bewerber, und nennen den Weg heraus.
 */
import { z } from "zod/v3";
import { MAPPEN_ID_REGEX } from "../../mappe/mappeId";

/** Lebenslauf und Anschreiben sind wenige tausend Zeichen; 50.000 sind rund 20 Seiten. */
export const MAX_TEXT_ZEICHEN = 50_000;
/** Dieselbe Grenze wie `sichererDateiname` (konto/unterlagen.ts). */
export const MAX_DATEINAME_ZEICHEN = 120;
/** Namen und Orte. */
export const MAX_NAME_ZEICHEN = 100;
/** Uebrige Formularangaben (Anschrift, Abschluss, Fuehrerscheinklassen). */
export const MAX_ANGABE_ZEICHEN = 200;

export const mappenIdFeld = z
  .string()
  .regex(
    MAPPEN_ID_REGEX,
    "mappenId must be copied unchanged from eroeffne_bewerbungsmappe: the letter m followed by 25 lowercase letters and digits. " +
      "If you no longer have it, call eroeffne_bewerbungsmappe again for the same pinstGuid - that creates a NEW, empty folder, " +
      "so tell the applicant that files added earlier have to be added again via the new upload page.",
  )
  .describe("The mappenId from eroeffne_bewerbungsmappe.");

/** Die Meldung bei ueberschrittener Laenge - nennt Feld, Grenze und den Weg heraus. */
export function zuLangMeldung(feldname: string, max: number): string {
  return `${feldname} is limited to ${max} characters. Pass exactly what the applicant stated, not a description.`;
}

/** Ein Formularfeld mit Laengengrenze und einer Meldung, die das Feld nennt. */
export function angabeFeld(feldname: string, max: number) {
  return z.string().min(1).max(max, zuLangMeldung(feldname, max));
}
