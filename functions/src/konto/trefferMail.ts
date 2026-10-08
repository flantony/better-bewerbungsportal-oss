// Reiner Mailinhalt (Betreff, Text, HTML) fuer die Treffer-Benachrichtigung und
// die Loesch-Vorwarnung - kein Versand, kein Firestore-, kein Auth-Zugriff. Die
// Basis-URL kommt als Parameter (PUBLIC_SITE_URL beim Aufrufer), damit sie hier
// nicht hartkodiert ist.
//
// KEINE BUNDESWEHR-BEGRIFFSERKLAERUNG AUS DEM GEDAECHTNIS: diese
// Texte enthalten bewusst keine Erklaerung von Fachbegriffen - sie geben nur
// weiter, was die aufrufende Seite an Stellendaten und Links mitgibt.

import { BEWERBERDATEN_IM_KONTO } from "../lib/funktionsschalter";
import { MERKLISTE_MAX } from "./kontoTypen";

export interface MailStelle {
  pinstGuid: string;
  titel: string;
  ort: string;
  bewerbungsschluss: string;
}

export interface MailInhalt {
  betreff: string;
  text: string;
  html: string;
}

/** & zuerst, sonst verdoppelt sich das Escaping der folgenden Ersetzungen. */
function escapeHtml(wert: string): string {
  return wert
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const UNABHAENGIGKEITSHINWEIS =
  "Better Bewerbungsportal ist ein unabhängiges privates Projekt und kein offizielles Angebot der Bundeswehr.";

function fussText(links: { basis: string; abbestellen: string }): string {
  return [
    "Du bekommst diese Mail, weil du Benachrichtigungen in deinem Konto eingeschaltet hast.",
    `Abbestellen: ${links.abbestellen}`,
    `Suchprofil ändern: ${links.basis}/dashboard/konto`,
    "",
    UNABHAENGIGKEITSHINWEIS,
  ].join("\n");
}

function fussHtml(links: { basis: string; abbestellen: string }): string {
  return `
    <p style="margin:24px 0 0 0;font-size:13px;color:#555555;">
      Du bekommst diese Mail, weil du Benachrichtigungen in deinem Konto eingeschaltet hast.<br>
      <a href="${escapeHtml(links.abbestellen)}" style="color:#555555;">Abbestellen</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(links.basis)}/dashboard/konto" style="color:#555555;">Suchprofil ändern</a>
    </p>
    <p style="margin:12px 0 0 0;font-size:12px;color:#888888;">${UNABHAENGIGKEITSHINWEIS}</p>
  `;
}

export interface TrefferMailOptionen {
  /**
   * Link auf die gefuehrte Bewerbung (`/dashboard/bewerben/...`). Nur, solange
   * es sie gibt - Vorgabe ist der Funktionsschalter BEWERBERDATEN_IM_KONTO.
   */
  bewerbenLink?: boolean;
  /**
   * Passen nicht alle neuen Stellen auf die Merkliste (`MERKLISTE_MAX`)? Dann
   * sagt die Mail das, statt zu behaupten, sie stuenden alle dort.
   */
  merklisteVoll?: boolean;
}

/**
 * Der Kurzlink auf die KI-Seite der Stelle (web `/k/{id}` -> `kiSeite`). Er
 * traegt nur die oeffentliche `pinstGuid`, nie etwas ueber den Empfaenger.
 * Der Bewerber fuegt ihn in seine eigene KI
 * ein - wir rufen keine KI auf.
 */
export function kiKurzlink(basis: string, pinstGuid: string): string {
  return `${basis}/k/${encodeURIComponent(pinstGuid)}`;
}

// Am Handy oeffnet ein Antippen nur die Textfassung fuer die KI - deshalb
// sagt die Mail, wie man den Link kopiert, und verweist einmal auf /ki fuer
// alle, die noch nicht wissen, was "deine KI" sein kann.
const KI_ERKLAERUNG =
  "Bei jeder Stelle steht ein Link „Für deine KI“. Kopiere ihn (am Handy: Link gedrückt halten, dann " +
  "„Link kopieren“) und füge ihn in den Chat deiner KI ein, zum Beispiel ChatGPT, Claude oder Gemini. Die KI " +
  "hilft dir dann, die Bewerbung vorzubereiten. Öffnest du den Link selbst, siehst du nur die Textfassung für die KI.";
const KI_MEHR = "Wie das geht";

const KI_LINK_LABEL = "Für deine KI";

/**
 * Der Satz zur Merkliste. Bei voller Liste stehen nicht alle neuen Stellen
 * dort - dann sagt die Mail das und verlinkt zusaetzlich die Suche, damit die
 * nicht einzeln genannten ("weitere") erreichbar bleiben.
 */
function merklisteSatz(gesamtzahl: number, weitere: number, merklisteVoll: boolean): string {
  if (merklisteVoll) {
    return `Deine Merkliste ist voll (${MERKLISTE_MAX} Stellen), deshalb ${gesamtzahl === 1 ? "steht die neue Stelle nicht darauf" : "stehen dort nicht alle neuen Stellen"}.`;
  }
  if (weitere > 0) return "Alle neuen Stellen, auch die weiteren, stehen auf deiner Merkliste, solange sie ausgeschrieben sind.";
  return gesamtzahl === 1
    ? "Du findest diese Stelle auch auf deiner Merkliste, solange sie ausgeschrieben ist."
    : "Du findest diese Stellen auch auf deiner Merkliste, solange sie ausgeschrieben sind.";
}

function stellenblockText(stellen: MailStelle[], basis: string, bewerbenLink: boolean): string {
  return stellen
    .map((stelle) =>
      [
        `${stelle.titel}`,
        `Ort: ${stelle.ort}`,
        `Bewerbungsschluss: ${stelle.bewerbungsschluss}`,
        `Stelle ansehen: ${basis}/dashboard/jobs/${stelle.pinstGuid}`,
        ...(bewerbenLink ? [`Bewerben: ${basis}/dashboard/bewerben/${stelle.pinstGuid}`] : []),
        `${KI_LINK_LABEL}: ${kiKurzlink(basis, stelle.pinstGuid)}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function bewerbenKnopfHtml(stelle: MailStelle, basis: string): string {
  return `
      <a href="${escapeHtml(basis)}/dashboard/bewerben/${escapeHtml(stelle.pinstGuid)}"
         style="display:inline-block;margin:0 8px 8px 0;padding:8px 16px;background:#1b7a43;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;">
        Bewerben
      </a>`;
}

function stellenblockHtml(stellen: MailStelle[], basis: string, bewerbenLink: boolean): string {
  return stellen
    .map(
      (stelle) => `
    <div style="margin:0 0 20px 0;padding:16px;border:1px solid #dddddd;border-radius:8px;">
      <p style="margin:0 0 8px 0;font-size:16px;font-weight:bold;color:#1a1a1a;">${escapeHtml(stelle.titel)}</p>
      <p style="margin:0 0 4px 0;font-size:14px;color:#333333;">Ort: ${escapeHtml(stelle.ort)}</p>
      <p style="margin:0 0 12px 0;font-size:14px;color:#333333;">Bewerbungsschluss: ${escapeHtml(stelle.bewerbungsschluss)}</p>
      <a href="${escapeHtml(basis)}/dashboard/jobs/${escapeHtml(stelle.pinstGuid)}"
         style="display:inline-block;margin:0 8px 8px 0;padding:8px 16px;background:#0a3d62;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;">
        Stelle ansehen
      </a>${bewerbenLink ? bewerbenKnopfHtml(stelle, basis) : ""}
      <p style="margin:4px 0 0 0;font-size:14px;color:#333333;">
        <a href="${escapeHtml(kiKurzlink(basis, stelle.pinstGuid))}" style="color:#0a3d62;">${KI_LINK_LABEL}: ${escapeHtml(stelle.titel)}</a><br>
        <span style="font-size:12px;color:#555555;word-break:break-all;">${escapeHtml(kiKurzlink(basis, stelle.pinstGuid))}</span>
      </p>
    </div>`,
    )
    .join("");
}

function betreffFuer(gesamtzahl: number): string {
  return gesamtzahl === 1
    ? "Eine neue Stelle passt zu deinem Suchprofil"
    : `${gesamtzahl} neue Stellen passen zu deinem Suchprofil`;
}

export function trefferMail(
  stellen: MailStelle[],
  weitere: number,
  links: { basis: string; abbestellen: string },
  { bewerbenLink = BEWERBERDATEN_IM_KONTO, merklisteVoll = false }: TrefferMailOptionen = {},
): MailInhalt {
  const gesamtzahl = stellen.length + weitere;
  const betreff = betreffFuer(gesamtzahl);
  const merklisteUrl = `${links.basis}/dashboard/merkliste`;
  const sucheUrl = `${links.basis}/dashboard/jobs`;
  const kiUrl = `${links.basis}/ki`;
  // Bei voller Merkliste waeren die "weiteren" sonst aus der Mail nicht mehr
  // erreichbar - dann bleibt der Link auf die Suche.
  const mitSuche = merklisteVoll && weitere > 0;

  const weitereText = weitere > 0 ? `\n\n... und ${weitere} weitere.` : "";
  const weitereHtml =
    weitere > 0 ? `<p style="margin:12px 0 0 0;font-size:14px;color:#333333;">... und ${weitere} weitere.</p>` : "";
  const satz = merklisteSatz(gesamtzahl, weitere, merklisteVoll);

  const text = [
    betreff,
    "",
    KI_ERKLAERUNG,
    `${KI_MEHR}: ${kiUrl}`,
    "",
    stellenblockText(stellen, links.basis, bewerbenLink) + weitereText,
    "",
    satz,
    `Zur Merkliste: ${merklisteUrl}`,
    ...(mitSuche ? [`Alle Stellen durchsuchen: ${sucheUrl}`] : []),
    "",
    fussText(links),
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:16px;">
      <h1 style="font-size:18px;color:#1a1a1a;margin:0 0 12px 0;">${escapeHtml(betreff)}</h1>
      <p style="margin:0 0 20px 0;font-size:14px;color:#333333;">
        ${escapeHtml(KI_ERKLAERUNG)}
        <a href="${escapeHtml(kiUrl)}" style="color:#0a3d62;">${KI_MEHR}</a>
      </p>
      ${stellenblockHtml(stellen, links.basis, bewerbenLink)}
      ${weitereHtml}
      <p style="margin:12px 0 0 0;font-size:14px;color:#333333;">
        ${escapeHtml(satz)}<br>
        <a href="${escapeHtml(merklisteUrl)}" style="color:#0a3d62;">Zur Merkliste</a>${
          mitSuche
            ? ` &nbsp;·&nbsp; <a href="${escapeHtml(sucheUrl)}" style="color:#0a3d62;">Alle Stellen durchsuchen</a>`
            : ""
        }
      </p>
      ${fussHtml(links)}
    </div>
  `;

  return { betreff, text, html };
}

const VORWARN_BETREFF = "Wir löschen dein Konto bald";

export function vorwarnMail(links: { basis: string; loeschtAm: string }): MailInhalt {
  const kern =
    `Wir löschen dein Konto am ${links.loeschtAm}, weil du dich ein Jahr nicht angemeldet hast. ` +
    `Willst du es behalten, melde dich vorher an: ${links.basis}/anmelden.`;

  const text = [VORWARN_BETREFF, "", kern, "", UNABHAENGIGKEITSHINWEIS].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:16px;">
      <h1 style="font-size:18px;color:#1a1a1a;margin:0 0 20px 0;">${escapeHtml(VORWARN_BETREFF)}</h1>
      <p style="margin:0 0 16px 0;font-size:14px;color:#333333;">
        Wir löschen dein Konto am ${escapeHtml(links.loeschtAm)}, weil du dich ein Jahr nicht angemeldet hast.
        Willst du es behalten, melde dich vorher an:
        <a href="${escapeHtml(links.basis)}/anmelden" style="color:#0a3d62;">${escapeHtml(links.basis)}/anmelden</a>.
      </p>
      <p style="margin:12px 0 0 0;font-size:12px;color:#888888;">${UNABHAENGIGKEITSHINWEIS}</p>
    </div>
  `;

  return { betreff: VORWARN_BETREFF, text, html };
}
