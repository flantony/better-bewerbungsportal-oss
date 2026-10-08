import { MERKLISTE_MAX, type GemerkteStelle } from "./kontoTypen";

export type MerkErgebnis = "gemerkt" | "schon-gemerkt" | "liste-voll";

export function merke(
  liste: GemerkteStelle[],
  pinstGuid: string,
  jetzt: number,
): { liste: GemerkteStelle[]; ergebnis: MerkErgebnis } {
  if (liste.some((stelle) => stelle.pinstGuid === pinstGuid)) return { liste, ergebnis: "schon-gemerkt" };
  // Verweigern statt verdraengen: eine still verschwundene Stelle ist fuer den
  // Bewerber schlimmer als ein Hinweis, dass die Liste voll ist.
  if (liste.length >= MERKLISTE_MAX) return { liste, ergebnis: "liste-voll" };
  return { liste: [{ pinstGuid, gemerktAm: jetzt }, ...liste], ergebnis: "gemerkt" };
}

export function vergiss(liste: GemerkteStelle[], pinstGuid: string): GemerkteStelle[] {
  return liste.filter((stelle) => stelle.pinstGuid !== pinstGuid);
}

/**
 * Die Stellen einer Treffer-Mail auf die Merkliste. `pinstGuids` kommt
 * neueste zuerst und steht
 * danach in dieser Reihenfolge oben auf der Liste. Was schon draufsteht,
 * bleibt, wie es ist (auch ein selbst gemerkter Eintrag wird nicht zum
 * Mail-Eintrag). Ist die Liste voll, fallen die uebrigen still weg - wie bei
 * `merke` wird nichts verdraengt; die Mail geht trotzdem raus.
 */
export function merkeAusMail(
  liste: GemerkteStelle[],
  pinstGuids: readonly string[],
  jetzt: number,
): { liste: GemerkteStelle[]; hinzugefuegt: number; keinPlatz: number } {
  const vorhanden = new Set(liste.map((stelle) => stelle.pinstGuid));
  const neu = pinstGuids.filter((id) => {
    if (vorhanden.has(id)) return false;
    vorhanden.add(id);
    return true;
  });
  const frei = Math.max(0, MERKLISTE_MAX - liste.length);
  const passt = neu.slice(0, frei);
  if (passt.length === 0) return { liste, hinzugefuegt: 0, keinPlatz: neu.length };
  return {
    liste: [...passt.map((pinstGuid) => ({ pinstGuid, gemerktAm: jetzt, ausMail: jetzt })), ...liste],
    hinzugefuegt: passt.length,
    keinPlatz: neu.length - passt.length,
  };
}

/**
 * Wie viele der Stellen passen nicht mehr auf die Liste? Fuer den Satz in der
 * Mail, BEVOR sie rausgeht - dieselbe Zaehlung wie `merkeAusMail`.
 */
export function ohnePlatzAufMerkliste(liste: GemerkteStelle[], pinstGuids: readonly string[]): number {
  return merkeAusMail(liste, pinstGuids, 0).keinPlatz;
}

/**
 * Wann ist eine gemerkte Stelle geschlossen? Dieselbe Grenze wie ueberall:
 * der Sync setzt `active: false`, sobald die Frist samt `GNADENFRIST_TAGE`
 * vorbei oder die Stelle nachweislich zurueckgezogen ist
 * (lib/abgelaufen.ts, lib/archivEntscheidung.ts), und loescht sie nach
 * `ARCHIV_TAGE` ganz. Geschlossen heisst deshalb: Dokument in `jobsV2` fehlt,
 * oder `active` steht ausdruecklich auf `false`. Ein fehlendes `active`-Feld
 * zaehlt NICHT - geloescht wird nur auf einen Beleg hin.
 */
export function istGeschlossen(stelle: { exists: boolean; active?: unknown }): boolean {
  return !stelle.exists || stelle.active === false;
}

/** Ohne die geschlossenen Stellen - selbst gemerkte und aus der Mail gleichermassen. */
export function ohneGeschlossene(liste: GemerkteStelle[], geschlossen: ReadonlySet<string>): GemerkteStelle[] {
  return liste.filter((stelle) => !geschlossen.has(stelle.pinstGuid));
}
