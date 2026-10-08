/**
 * Betreiber des Projekts, fuer die KI-Seite (kiSeite.ts). Spiegel von
 * web/src/config/betreiber.ts (Impressum, Datenschutzerklaerung) - eigenes
 * Paket, darum kein gemeinsamer Import; Aenderungen immer an beiden Stellen.
 *
 * WOZU: Kann eine fremde KI nicht pruefen, wer better-bewerbungsportal.de
 * betreibt, raet sie davon ab, dort persoenliche Daten einzugeben. Die
 * KI-Seite nennt deshalb Betreiber, Kontakt und Impressum - eine fremde KI
 * entscheidet daran, ob die Quelle vertrauenswuerdig ist.
 */
import { PUBLIC_SITE_URL } from "../mcp/publicSite";

export const BETREIBER = {
  name: "Florian Antony",
  email: "florian.antony@mailbox.org",
  impressumUrl: `${PUBLIC_SITE_URL}/impressum`,
} as const;
