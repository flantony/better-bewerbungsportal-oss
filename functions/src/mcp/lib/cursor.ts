/**
 * Undurchsichtiger Cursor fuer das Blaettern in Trefferlisten.
 *
 * WARUM UNDURCHSICHTIG: der Client soll ihn zurueckgeben, nicht auseinandernehmen.
 * Welches Feld sortiert wird und ob Firestore oder wir selbst blaettern, ist eine
 * Implementierungsfrage - stuende sie im Cursor lesbar drin, wuerde ein Modell
 * anfangen, eigene Cursor zu basteln.
 *
 * ZWEI FORMEN, weil es zwei Abfragewege gibt (s. queryJobs.ts):
 *  - `index`: Firestore sortiert selbst. Der Cursor traegt den Sortierwert des
 *    letzten Treffers plus dessen ID als Tiebreaker - ohne die ID wuerden bei
 *    gleichem Bewerbungsschluss (sehr haeufig) Stellen doppelt oder gar nicht
 *    erscheinen.
 *  - `speicher`: es wird ohnehin die ganze gefilterte Menge geladen und in
 *    JavaScript sortiert. Dann genuegt ein Offset.
 */

export type CursorInhalt =
  | { typ: "index"; wert: string; id: string }
  | { typ: "speicher"; offset: number };

export function encodeCursor(inhalt: CursorInhalt): string {
  return Buffer.from(JSON.stringify(inhalt), "utf8").toString("base64url");
}

/**
 * Gibt `null` zurueck, wenn der Cursor nicht von uns stammt oder beschaedigt ist.
 * Der Aufrufer muss das als Fehler behandeln und darf NICHT stillschweigend von
 * vorn anfangen: der Nutzer bekaeme sonst dieselbe Seite noch einmal und haette
 * keinen Anhaltspunkt, warum das Blaettern nicht weitergeht.
 */
export function decodeCursor(cursor: string): CursorInhalt | null {
  try {
    const roh = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (typeof roh !== "object" || roh === null) return null;
    const kandidat = roh as Partial<CursorInhalt> & Record<string, unknown>;

    if (kandidat.typ === "index") {
      if (typeof kandidat.wert !== "string" || typeof kandidat.id !== "string") return null;
      return { typ: "index", wert: kandidat.wert, id: kandidat.id };
    }
    if (kandidat.typ === "speicher") {
      if (typeof kandidat.offset !== "number" || !Number.isInteger(kandidat.offset) || kandidat.offset < 0) {
        return null;
      }
      return { typ: "speicher", offset: kandidat.offset };
    }
    return null;
  } catch {
    return null;
  }
}

/** Meldung fuer einen unbrauchbaren Cursor - sagt dem Client, was er tun soll. */
export const CURSOR_UNGUELTIG =
  "Der uebergebene cursor stammt nicht aus einer Antwort dieses Servers oder ist beschaedigt. " +
  "Bitte die Suche ohne cursor erneut stellen und ab da wieder mit dem jeweils zurueckgegebenen " +
  "naechsterCursor weiterblaettern.";
