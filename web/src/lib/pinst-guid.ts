/** Dasselbe Format wie `istGueltigePinstGuid` in functions/src/kiSeite.ts. */
const PINST_GUID = /^[0-9A-Fa-f]{32}$/;

/**
 * Prueft eine Stellenkennung aus der URL, BEVOR sie als Firestore-Dokument-ID
 * dient: was nicht so aussieht, kann keine Stelle sein und kostet dann keinen
 * Lesevorgang.
 */
export function istPinstGuid(id: string): boolean {
  return PINST_GUID.test(id);
}
