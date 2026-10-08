/**
 * Steht unter JEDEM Wissensdokument.
 *
 * Diese Texte sind NICHT aus den Ausschreibungsdaten abgeleitet. Ein Bewerber handelt danach - deshalb
 * gehoert an jede Stelle, wo die Auskunft herkommt und wo die verbindliche
 * Fassung steht. Im Zweifel lieber knapper und auf die Karriereberatung
 * verweisen, als eine Zahl zu nennen, die nicht mehr stimmt.
 */
export const NICHT_AMTLICH =
  "Diese Übersicht ist eine Lesehilfe eines unabhängigen privaten Projekts, keine amtliche Auskunft " +
  "der Bundeswehr. Verbindlich sind allein die Angaben der jeweiligen Ausschreibung, die offiziellen " +
  "Seiten der Bundeswehr und die Auskunft der Karriereberatung. Regeln und Altersgrenzen ändern sich; " +
  "im Zweifel dort nachfragen statt sich auf diesen Text zu verlassen.";

/** Einheitlicher Fuß unter jedes Dokument, mit den belegenden Quellen. */
export function mitHinweis(markdown: string, quellen: string[]): string {
  const liste = quellen.map((quelle) => `- ${quelle}`).join("\n");
  return `${markdown.trim()}\n\n## Quellen\n\n${liste}\n\n> ${NICHT_AMTLICH}\n`;
}
