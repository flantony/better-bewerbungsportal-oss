/**
 * Funktionsschalter - bewusst Code-Konstanten, keine Umgebungsvariablen oder
 * Params: Umschalten ist ein Commit plus Functions-Deploy, also in der History
 * nachvollziehbar und in jedem Lauf (Tests, Deploy, Einmal-Skripte) gleich.
 *
 * BEWERBERDATEN_IM_KONTO: ausgeschaltet speichert das Konto nur Anmelde-E-Mail,
 * Suchprofil, Merkliste und Benachrichtigungszustand. Gemerkte Bewerberangaben
 * (inkl. Einwilligung zur Staatsangehoerigkeit), abgelegte Unterlagen und die
 * gefuehrte Bewerbung mit Paketbau aus dem Konto sind dann aus. Massgeblich ist
 * der SERVER: die
 * schreibenden bzw. verarbeitenden Endpunkte in `kontoHttp.ts` lehnen dann
 * mit 404 ab; das Web blendet die Bereiche nur zusaetzlich aus und erfaehrt
 * den Stand ueber `kontoLaden` (`bewerberdatenAktiv`), nicht ueber eine
 * eigene Kopie dieses Werts.
 *
 * Lesen, Exportieren und Loeschen vorhandener Daten (`privat/angaben`,
 * `privat/dokumente`) bleiben auch im ausgeschalteten Zustand moeglich, und
 * die Aufraeumlaeufe (`raeumeKontenAuf`, `raeumeUploadsAuf`) laufen weiter.
 * Einschalten nimmt Verarbeitungstaetigkeiten auf, die eine eigene
 * Datenschutz-Folgenabschaetzung brauchen.
 */
export const BEWERBERDATEN_IM_KONTO: boolean = false;
