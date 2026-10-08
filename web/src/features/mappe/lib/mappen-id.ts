/**
 * Format von `neueMappenId` (functions/src/mappe/mappeId.ts): "m" plus genau
 * 25 Zeichen aus [0-9a-z]. Alles andere hat der Server nie ausgestellt und
 * wird ohne Firestore-Zugriff als unbekannt behandelt. functions/ prueft in
 * mappeId.test.ts, dass jede neue Kennung hier durchkommt.
 */
const MAPPEN_ID = /^m[0-9a-z]{25}$/;

export function istMappenId(id: string): boolean {
  return MAPPEN_ID.test(id);
}
