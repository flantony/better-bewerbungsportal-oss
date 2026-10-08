/**
 * Die Adresse, die Nutzer in ihr KI-Tool eintragen. Einzige Quelle der
 * Wahrheit — öffentliche Seite und Dashboard zeigen beide diesen Wert.
 */
export const KI_VERBINDUNGS_URL =
  'https://europe-west3-better-bewerbungsportal.cloudfunctions.net/mcpServer/mcp';

/**
 * Skill-Bundle unter web/public, erzeugt von einem separaten Build-Skript —
 * die Verbindungsadresse steckt darin noch einmal, weil functions/ und web/
 * kein Paket teilen. Wer die URL oben ändert, muss das Bundle neu bauen.
 */
export const SKILL_BUNDLE_DATEI = 'bundeswehr-stellensuche.zip';

/**
 * Die KI-lesbare Seite je Stelle (functions/src/kiSeite.ts, Chat-Link-Kanal).
 * Kein Installieren: der Bewerber fuegt den Link in einen ganz normalen Chat
 * ein, das geht auch mit kostenlosen Tarifen. Eine huebschere Adresse unter
 * unserer eigenen Domain waere hier die einzige Stelle zum Umstellen.
 */
export const KI_SEITE_BASIS_URL = 'https://europe-west3-better-bewerbungsportal.cloudfunctions.net/kiSeite';

/** Nur die oeffentliche `pinstGuid` - nie etwas ueber den Bewerber (Designgrenze 4 in kiSeite.ts). */
export function kiSeitenUrl(pinstGuid: string): string {
  return `${KI_SEITE_BASIS_URL}?id=${encodeURIComponent(pinstGuid)}`;
}

/**
 * Der Text, den der Bewerber in seinen Chat kopiert. Bewusst als Bitte des
 * Nutzers formuliert: die Seite selbst ist eine erbetene Anleitung, kein
 * Befehl an die KI (Designgrenze 2).
 */
export function kiChatText(pinstGuid: string): string {
  return (
    'Ich möchte mich auf diese Stelle bei der Bundeswehr bewerben. Lies bitte die folgende Seite ' +
    `und hilf mir genau nach dem Ablauf, der dort beschrieben ist: ${kiSeitenUrl(pinstGuid)}`
  );
}
