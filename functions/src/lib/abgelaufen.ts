/**
 * Wann gilt eine Ausschreibung als abgelaufen?
 *
 * ZWEI FALLSTRICKE, die diese Datei kapselt:
 *
 * 1. `applicationEndSortKey` ist MITTERNACHT ZU BEGINN des Stichtags (s.
 *    lib/applicationEndSortKey.ts). Ein naives `sortKey < jetzt` erklärt eine
 *    Ausschreibung, deren Frist HEUTE endet, also schon um 00:01 für abgelaufen -
 *    einen ganzen Tag zu früh. Der Stichtag selbst zählt noch als offen.
 *
 * 2. Löschen ist endgültig: die Bundeswehr-API liefert eine einmal entfernte
 *    Ausschreibung nicht mehr zurück. Deshalb ZWEI Stufen statt einer:
 *    zuerst raus aus der Suche (`GNADENFRIST_TAGE`), dann - erst viel später -
 *    endgültig weg (`ARCHIV_TAGE`). Dazwischen bleibt die Ausschreibung über
 *    ihren Link lesbar.
 */
const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Tage nach dem Bewerbungsschluss, die eine Ausschreibung noch als AKTIV gilt
 * und damit in der Suche auftaucht. Danach wandert sie ins Archiv (s.
 * `ARCHIV_TAGE`), geloescht wird sie erst deutlich spaeter. Klein halten: eine
 * Stelle, auf die man sich nicht mehr bewerben kann, gehoert nicht in
 * Suchtreffer.
 */
export const GNADENFRIST_TAGE = 3;

/**
 * Tage, die eine abgelaufene Ausschreibung als ARCHIV erhalten bleibt, bevor sie
 * endgueltig geloescht wird. Sie ist in dieser Zeit aus jeder Suche heraus
 * (`active: false`), aber ueber ihren Link weiter aufrufbar - "was stand da
 * nochmal drin?" nach einer Bewerbung.
 *
 * GROESSE: Das Archiv erreicht einen STABILEN Umfang von `ARCHIV_TAGE` mal der
 * Zahl der taeglich ablaufenden Ausschreibungen - es waechst nicht weiter, weil hinten
 * genauso viel herausfaellt wie vorn hereinkommt. Reads kostet es praktisch
 * nichts: jede Suche filtert auf `active == true` und fasst das Archiv nie an.
 */
export const ARCHIV_TAGE = 60;

/** Ist eine archivierte Stelle alt genug zum endgueltigen Loeschen? */
export function istArchivReif(
  removedAtMs: number | null | undefined,
  jetztMs: number,
  archivTage: number = ARCHIV_TAGE,
): boolean {
  // Ohne `removedAt` laesst sich das Alter nicht bestimmen - im Zweifel behalten
  // und beim naechsten Lauf erneut pruefen, statt blind zu loeschen.
  if (removedAtMs === null || removedAtMs === undefined) return false;
  return jetztMs >= removedAtMs + archivTage * TAG_MS;
}

/**
 * @param sortKeyMs `applicationEndSortKey` in Millisekunden (Mitternacht zu
 *   Beginn des Stichtags). Fehlt der Wert, gilt die Stelle als NICHT abgelaufen -
 *   ohne Frist ist "abgelaufen" nicht belegbar, und Löschen im Zweifel ist die
 *   falsche Richtung.
 */
export function istAbgelaufen(
  sortKeyMs: number | null | undefined,
  jetztMs: number,
  gnadenfristTage: number = GNADENFRIST_TAGE,
): boolean {
  if (sortKeyMs === null || sortKeyMs === undefined) return false;
  // +1 Tag, weil der Stichtag selbst noch offen ist.
  return jetztMs >= sortKeyMs + (1 + gnadenfristTage) * TAG_MS;
}
