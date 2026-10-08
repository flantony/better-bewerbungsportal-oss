import { randomBytes } from "node:crypto";

/**
 * Kennung und Download-Token der Mappe.
 *
 * WOZU 128 Bit: die Kennung IST die Berechtigung (die Mappe hat kein Konto). Sie
 * steht in einer URL, die durch einen Chatverlauf geht - erratbar darf sie
 * nicht sein. base32-artige Kodierung, damit sie in URLs und in gesprochener
 * Form unbeschadet bleibt.
 */
function zufall(): string {
  return BigInt(`0x${randomBytes(16).toString("hex")}`).toString(36).padStart(25, "0");
}

export function neueMappenId(): string {
  return `m${zufall()}`;
}

export function neuerEinmalToken(): string {
  return `t${zufall()}`;
}

/**
 * Format eines von `neuerEinmalToken` erzeugten Tokens - "t" plus genau 25
 * Zeichen aus [0-9a-z] (128 Bit Zufall, `toString(36)`, mit `padStart(25,"0")`
 * auf 25 Zeichen aufgefuellt; 2^128-1 passt in base36 immer in 25 Stellen,
 * die Laenge ist also nie laenger). Wird u.a. verwendet, um eine `docId` VOR
 * jedem Firestore-/Storage-Zugriff auf das erwartete Format zu pruefen
 * - alles andere ist per Definition kein von diesem
 * Server ausgestelltes Token und wird ohne jeden Nachschlag abgelehnt.
 */
export const EINMAL_TOKEN_REGEX = /^t[0-9a-z]{25}$/;

/**
 * Dasselbe fuer die Mappen-Kennung aus `neueMappenId` ("m" plus 25 Zeichen).
 * Geprueft vor jedem Firestore-/Storage-Zugriff: eine Kennung mit "/" waere sonst ein anderer Firestore-Pfad bzw.
 * ein anderes Storage-Praefix.
 */
export const MAPPEN_ID_REGEX = /^m[0-9a-z]{25}$/;
