/**
 * Die KI-lesbare Klartextseite je Stelle (Chat-Link-Kanal). Ein Bewerber
 * fuegt den Link in sein eigenes
 * Chat-Tool ein (ChatGPT, Claude, Gemini mit Web-Zugriff), statt den
 * MCP-Server zu installieren - die Seite ersetzt dafuer server.ts/instructions
 * und die Werkzeuge fuer GENAU eine Stelle.
 *
 * VIER DESIGNGRENZEN, bindend:
 *  1. Nur lesend abrufbar - keine Datei-Uploads, kein Formularausfuellen ueber
 *     diese Seite. Der Rueckweg ist der Rueckgabeblock (s. `konto/rueckgabeblock.ts`),
 *     den der Bewerber auf der Paketseite einfuegt.
 *  2. Die Seite liest sich als erbetene Anleitung, nicht als Befehl an die KI -
 *     Prompt-Injection-Schutz: die Worte des Nutzers wiegen mehr als ein
 *     abgerufener Text.
 *  3. Ein Link pro Stelle mit allem Noetigen - keine Suchparameter, die eine KI
 *     selbst zusammenbaut.
 *  4. Nie PII im Link - `id` ist ausschliesslich die oeffentliche `pinstGuid`.
 *
 * EINE QUELLE, ZWEI ABNEHMER: der Ablauf-
 * Text kommt unveraendert aus `mcp/knowledge/bewerbungsablauf.ts`, die
 * Glossareintraege aus `mcp/knowledge/glossar.ts` - beide Register bedienen
 * den MCP-Server UND diese Seite, nichts wird hier neu formuliert.
 */
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { logger } from "firebase-functions";
import { parse } from "node-html-parser";
import { loadJobRecord, JobNotFoundError } from "./mcp/lib/loadJobRecord";
import { getDocumentRequirements, type DocumentRequirementsResult } from "./mcp/tools/getDocumentRequirements";
import { bewerbungsablaufMarkdown } from "./mcp/knowledge/bewerbungsablauf";
import { ladeGlossar } from "./mcp/knowledge/glossar";
import { NICHT_AMTLICH } from "./mcp/knowledge/hinweis";
import { bundeslandName } from "./mcp/lib/filterOptions";
import { feldnamenFuer } from "./konto/bewerbung";
import { BEWERBERDATEN_IM_KONTO } from "./lib/funktionsschalter";
import { PUBLIC_SITE_URL } from "./mcp/publicSite";
import { clientKeyFromForwardedFor, createRateLimiter, type Quota } from "./lib/drosselung";
import { bewerbungJederzeitFuerJob, bewerbungsschlussText } from "./lib/bewerbungsschluss";
import { BETREIBER } from "./lib/betreiber";
import { einreichenSchritte } from "./lib/einreichen";
import { istVerfassungstreueErklaerung } from "./mappe/anhangArt";
import type { GlossaryTerm, JobRecord } from "./types";

const REGION = "europe-west3";

/** Nur die public `pinstGuid` - siehe Designgrenze 4 oben. 32 Hex-Zeichen, wie `sync.ts` sie aus `PinstGuid` uebernimmt. */
const PINST_GUID_REGEX = /^[0-9A-Fa-f]{32}$/;

const SEITE_UNBEKANNT_SATZ =
  "Zu dieser Kennung gibt es keine Ausschreibung - entweder ist der Link falsch, oder die Stelle ist " +
  "aus dem Bestand gefallen. Bitte den Link zu dieser Bewerbung neu holen.";

export function istGueltigePinstGuid(id: string): boolean {
  return PINST_GUID_REGEX.test(id);
}

// ─── Textaufbereitung ───────────────────────────────────────────────────────

/** HTML raus, nur Klartext - die Volltextfelder (companyDesc etc.) sind HTML. */
function stripHtml(html: string): string {
  if (!html?.trim()) return "";
  return parse(html).structuredText.trim();
}

const MAX_FELD_ZEICHEN = 2_500;
const MAX_GESAMT_ZEICHEN = 20_000;

/** Kuerzt einen einzelnen Textblock, mit sichtbarem Hinweis statt stillem Abschneiden. */
function kuerzeFeld(text: string, max = MAX_FELD_ZEICHEN): string {
  const bereinigt = text.trim();
  if (bereinigt.length <= max) return bereinigt;
  return `${bereinigt.slice(0, max).trimEnd()} [… gekürzt, der vollständige Text steht in der Ausschreibung selbst]`;
}

/** Globale Notbremse, falls trotz Feldkuerzung die Zielgroesse ueberschritten wird. */
function kuerzeGesamt(markdown: string, jobUrl: string): string {
  if (markdown.length <= MAX_GESAMT_ZEICHEN) return markdown;
  return (
    `${markdown.slice(0, MAX_GESAMT_ZEICHEN).trimEnd()}\n\n` +
    `[… Seite gekürzt. Vollständige Angaben zu dieser Ausschreibung: ${jobUrl}]`
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Nur die Glossareintraege, deren Begriff oder Alias in DIESER Ausschreibung
 * vorkommt - keine vollstaendige Liste (das waere das MCP-Resource-Pendant,
 * hier ist Platz knapp und der Bezug soll zur Stelle passen).
 */
export function begriffeInText(begriffe: GlossaryTerm[], text: string): GlossaryTerm[] {
  if (!text.trim()) return [];
  return begriffe.filter((eintrag) => {
    const kandidaten = [eintrag.term, ...(eintrag.aliases ?? [])].filter((wert) => wert.trim());
    return kandidaten.some((kandidat) => new RegExp(`\\b${escapeRegExp(kandidat)}\\b`, "i").test(text));
  });
}

/**
 * Bettet den Ablauf-Text aus dem Wissensregister als Unterabschnitt ein: die
 * eigene Quellenangabe/den Nicht-amtlich-Hinweis traegt schon der Fuss dieser
 * Seite, die fuehrende H1-Ueberschrift ("# Wie eine Bewerbung ...") entfaellt,
 * weil die eigene "## Was nach dem Absenden passiert"-Ueberschrift dasselbe
 * schon sagt - sonst stuenden zwei fast gleichlautende Ueberschriften direkt
 * hintereinander. Die verbleibenden Ueberschriften werden um zwei Ebenen
 * abgesenkt, damit sie unter der eigenen "##"-Ueberschrift dieser Seite
 * haengen statt daneben.
 */
function alsUnterabschnitt(markdownAusRegister: string): string {
  const ohneFuss = markdownAusRegister.replace(/\n+## Quellen[\s\S]*$/, "").trim();
  const ohneTitel = ohneFuss.replace(/^#\s+.*\n+/, "");
  return ohneTitel.replace(/^(#+)/gm, (raute) => "#".repeat(raute.length + 2));
}

// ─── Bausteine der Seite ────────────────────────────────────────────────────

/**
 * Betreiber, Kontakt und Impressum stehen hier oben: kann eine KI nicht
 * pruefen, wer die Seite betreibt, raet sie davon ab, dort persoenliche Daten
 * einzugeben. Die Betreiberangaben sind bewusst oeffentlich.
 *
 * Der Satz verspricht NICHT "keine personenbezogenen Daten von ...
 * Ansprechpersonen": weggelassen wird nur contactDesc, die Freitexte
 * (jobDesc/requireDesc/remarcDesc) koennen Namen tragen. Er sagt nur, was
 * wirklich gilt.
 */
function kopf(job: JobRecord): string {
  return (
    `# KI-Hilfe für eine Bewerbung: ${job.title}\n\n` +
    `> Diese Seite kommt vom Better Bewerbungsportal - **nicht von der Bundeswehr**. Better Bewerbungsportal ` +
    `ist ein privates Projekt von ${BETREIBER.name}. Kontakt: ${BETREIBER.email} · Impressum: ` +
    `${BETREIBER.impressumUrl}\n>\n` +
    `> Sie enthält nur öffentliche Angaben aus der Ausschreibung und keine Daten von Bewerbern; die ` +
    `Kontaktangaben der Ansprechpersonen lassen wir weg.`
  );
}

/**
 * Punkt 8: gibt es die gefuehrte Bewerbung nicht (Funktionsschalter
 * BEWERBERDATEN_IM_KONTO aus), fuehrt ein Link
 * dorthin ins Leere - dann der Weg ohne Paket ueber die Stellenseite.
 */
function paketPunkt(jobUrl: string, bewerbenUrl: string | null): string {
  if (bewerbenUrl) {
    return `8. Für das fertige Bewerbungspaket (PDFs, ausgefüllte Formulare) auf ${bewerbenUrl} verweisen (ein Konto ist
   dafür nötig) - ohne Konto füllt die bewerbende Person die Formulare selbst aus, mit den Links unten.`;
  }
  return `8. Ein fertiges Bewerbungspaket stellt ${PUBLIC_SITE_URL} derzeit nicht zusammen: die bewerbende Person füllt die
   Formulare selbst aus, mit den Links unten. Was sie einreichen muss, steht auch als Checkliste zum Herunterladen
   auf ${jobUrl}.`;
}

/**
 * DESIGNGRENZE 2: als erbetene Anleitung geschrieben, nicht als Befehl - wer
 * diesen Link eingefuegt hat, hat seine KI vermutlich selbst darum gebeten,
 * hier nachzulesen. Die Formulierungen sind deshalb beschreibend ("hilft",
 * "es lohnt sich"), keine Systemprompt-Anweisungen an ein fremdes Modell.
 */
function soHilfstDu(job: JobRecord, jobUrl: string, bewerbenUrl: string | null): string {
  return `## So hilfst du bei dieser Bewerbung

Wer dir diesen Link geschickt hat, möchte vermutlich deine Hilfe bei genau dieser einen Bewerbung - diese Seite
beschreibt, wie das gut gelingt.

1. Die Stelle in ein paar Sätzen zusammenfassen: Titel, Ort, Vertragsart, Bewerbungsschluss.
2. Die Bewerbungsfrist prüfen (\`Bewerbungsschluss\` unten). Ist sie schon vorbei, das direkt sagen - eine
   weitere Vorbereitung lohnt sich dann nicht mehr.
3. Die benötigten Unterlagen auflisten (Abschnitt "Benötigte Unterlagen" unten) - dazu die Vordrucke, die die
   bewerbende Person selbst ausfüllen und unterschreiben muss (Abschnitt "Formulare").
4. Hängt ein amtliches Formular an (Abschnitt "Formulare"), nur die dort genannten Angaben erfragen - und auch
   die nur, wenn die bewerbende Person tatsächlich beim Ausfüllen geholfen bekommen möchte. Nichts erfinden,
   nichts aus eigenem Wissen ergänzen. Das PDF-Formular selbst kannst du hier nicht ausfüllen - über diese
   Textseite nicht anbieten und nicht versprechen. ${bewerbenUrl ? "Ausgefüllt wird es über das Bewerbungspaket (Punkt 8) oder von Hand." : "Ausgefüllt wird es von Hand (Punkt 8)."}
5. Bundeswehr- oder Behördenbegriffe nicht aus eigenem Wissen erklären. Was in dieser Ausschreibung vorkommt,
   steht unten unter "Begriffe in dieser Ausschreibung" mit der amtlichen Erklärung. Kommt ein Begriff vor, der
   dort nicht steht, lieber sagen, dass keine gesicherte Erklärung vorliegt, als zu raten.
6. Beim Schreiben von Anschreiben und Lebenslauf helfen, auf Grundlage dessen, was die bewerbende Person selbst
   mitteilt. Fürs Anschreiben gilt: in ihren eigenen Worten und mit konkreten Beispielen aus ihrem Werdegang statt
   austauschbarer Floskeln; mit Ort und Datum; adressiert an die zuständige Karriereberatung bzw. das
   Karrierecenter der Bundeswehr - keine erfundene Abteilung und kein erfundener Name. Verlangt die Ausschreibung
   bundesweite Einsatzbereitschaft, die Person nicht auf einen Wunschort festlegen, sondern ihre Versetzbarkeit
   ansprechen.
${
  bewerbenUrl
    ? `7. Am Ende die fertigen Texte genau im Format ausgeben, das ganz unten auf dieser Seite als Vorlage steht -
   dieses Format liest die Paketseite von ${PUBLIC_SITE_URL} wieder ein.`
    : `7. Am Ende die fertigen Texte vollständig ausgeben, so dass die bewerbende Person sie kopieren, selbst als
   PDF speichern und mit einreichen kann (Hinweise dazu ganz unten auf dieser Seite).`
}
${paketPunkt(jobUrl, bewerbenUrl)}
9. Abschicken kann diese Seite nicht. Eingereicht wird so - genau diese Adresse nennen, keine andere erfinden:
${einreichenSchritte(job.refCode)
  .map((schritt) => `   - ${schritt}`)
  .join("\n")}

Mehr zur eigenen Ausschreibung: ${jobUrl}`;
}

/** "Soldatin bzw. Soldat auf Zeit", "Soldatin/Soldat auf Zeit", "Soldat auf Zeit" - nicht "Zeitsoldat". */
const SOLDAT_AUF_ZEIT = /\bSoldat(?:in)?(?:\s*(?:\/|bzw\.|oder)\s*Soldat(?:in)?)?\s+auf\s+Zeit\b/i;

/**
 * Kein "Vertragsart: keine Angabe" neben einem Text, der "Soldat auf Zeit ...
 * 3 bis 13 Jahre" sagt. Das amtliche Feld hat
 * Vorrang; fehlt es, sagt die Seite, was im Text steht - als solches
 * gekennzeichnet. Nur die Statusbezeichnung "auf Zeit" wird erkannt, keine
 * eigene Deutung des Textes.
 */
export function vertragsartZeile(job: JobRecord): string {
  if (job.contractTypeLabel) return job.contractTypeLabel;
  const text = [job.title, job.companyDesc, job.jobDesc, job.requireDesc, job.remarcDesc].map(stripHtml).join(" ");
  const teile: string[] = [];
  if (SOLDAT_AUF_ZEIT.test(text)) teile.push("Soldatin/Soldat auf Zeit");
  const dauer = job.jobAttributes?.verpflichtungsdauer?.trim();
  if (dauer) teile.push(`Verpflichtungsdauer ${dauer}`);
  return teile.length > 0 ? `${teile.join(", ")} (laut Ausschreibungstext)` : "keine Angabe";
}

function ausschreibung(job: JobRecord): string {
  const ort = bundeslandName(job.region) ? `${job.besOrt}, ${bundeslandName(job.region)}` : job.besOrt || "keine Angabe";
  const zeilen = [
    `## Die Ausschreibung`,
    ``,
    `- **Titel:** ${job.title}`,
    `- **Kennung (refCode):** ${job.refCode}`,
    `- **Ort:** ${ort}`,
    `- **Vertragsart:** ${vertragsartZeile(job)}`,
    `- **Bewerbungsschluss:** ${bewerbungsschlussText(job.applicationEnd, bewerbungJederzeitFuerJob(job))}`,
    `- **Ansprechperson:** die in der Ausschreibung genannte Ansprechperson (siehe die Stellenseite oben)`,
  ];

  const abschnitte: [string, string][] = [
    ["Beschreibung", job.companyDesc],
    ["Aufgaben", job.jobDesc],
    ["Anforderungen laut Ausschreibungstext", job.requireDesc],
    ["Sonstige Hinweise", job.remarcDesc],
  ];
  for (const [titel, html] of abschnitte) {
    const text = kuerzeFeld(stripHtml(html));
    if (text) zeilen.push(``, `### ${titel}`, ``, text);
  }

  return zeilen.join("\n");
}

function benoetigteUnterlagen(anforderungen: DocumentRequirementsResult): string {
  const zeilen = [`## Benötigte Unterlagen`, ``];
  if (anforderungen.geforderteUnterlagen.length > 0) {
    zeilen.push(...anforderungen.geforderteUnterlagen.map((eintrag) => `- ${eintrag}`));
  } else if (anforderungen.hinweis?.fuerDenBewerber) {
    zeilen.push(anforderungen.hinweis.fuerDenBewerber);
  }
  if (anforderungen.unterlagenHinweise.trim()) {
    zeilen.push(``, `Formale Hinweise dazu: ${anforderungen.unterlagenHinweise.trim()}`);
  }
  return zeilen.join("\n");
}

/**
 * "Anlage 1 zum Bewerbungsbogen" (Erklaerung zur Verfassungstreue) muss auf
 * dieser Seite vorkommen. Ohne sie ist die Bewerbung unvollstaendig. Die Fragen darauf (Parteien, Vereinigungen,
 * Staatenliste) gehoeren nicht in einen Chat - das steht hier ausdruecklich.
 */
function selbstAuszufuellen(anforderungen: DocumentRequirementsResult): string[] {
  const vordrucke = anforderungen.selbstAuszufuellen ?? [];
  if (vordrucke.length === 0) return [];
  const erklaerung = vordrucke.some((vordruck) => istVerfassungstreueErklaerung(vordruck.attHeader));
  return [
    `### Selbst ausfüllen und unterschreiben`,
    ``,
    `Diese Vordrucke werden nie im Bewerbungspaket ausgefüllt: die bewerbende Person füllt sie selbst von Hand ` +
      `aus, soweit sie auf sie zutreffen, unterschreibt sie und reicht sie mit ein. Angaben dafür nicht im Chat ` +
      `sammeln.` +
      (erklaerung
        ? ` Die Erklärung zur Verfassungstreue gehört immer dazu; ihre Fragen nicht im Chat stellen und nicht ` +
          `beim Beantworten helfen - sie betreffen Mitgliedschaften in Parteien und Vereinigungen.`
        : ``),
    ``,
    ...vordrucke.map((vordruck) => `- **${vordruck.attHeader}:** ${vordruck.downloadUrl}`),
  ];
}

function formulare(anforderungen: DocumentRequirementsResult, mitPaket: boolean): string {
  const zeilen = [`## Formulare`, ``];
  if (anforderungen.bewerbungsboegen.length === 0) {
    zeilen.push(anforderungen.bogenHinweis?.fuerDenBewerber ?? "Für diese Ausschreibung liegt kein Bewerbungsbogen vor.");
    const vordrucke = selbstAuszufuellen(anforderungen);
    if (vordrucke.length > 0) zeilen.push(``, ...vordrucke);
    return zeilen.join("\n");
  }

  for (const bogen of anforderungen.bewerbungsboegen) {
    zeilen.push(
      `### ${bogen.attHeader}`,
      ``,
      ...(mitPaket ? [`- **Wird im Bewerbungspaket ausgefüllt:** ${bogen.ausfuellbar ? "ja" : "nein, nur von Hand"}`] : []),
      `- **Formular herunterladen:** ${bogen.downloadUrl}`,
    );
    if (bogen.ausfuellbar && bogen.benoetigteAngaben?.length) {
      zeilen.push(`- **Benötigte Angaben:** ${feldnamenFuer(bogen.benoetigteAngaben).join(", ")}`);
      if (bogen.optionaleAngaben?.length) {
        zeilen.push(`- **Nur wenn von selbst genannt:** ${feldnamenFuer(bogen.optionaleAngaben).join(", ")}`);
      }
      // Ohne ausdrueckliche Negativliste fragt eine KI z.B. nach dem Geburtsort,
      // obwohl dieser Bogen kein Feld dafuer hat - sie ergaenzt, was ein
      // Bewerbungsbogen "ueblicherweise" enthaelt.
      if (bogen.nichtVerwendeteAngaben?.length) {
        zeilen.push(
          `- **Nicht erfragen** (dieser Bogen hat kein Feld dafür): ${feldnamenFuer(bogen.nichtVerwendeteAngaben).join(", ")}`,
        );
      }
    }
    zeilen.push(``);
  }
  zeilen.push(...selbstAuszufuellen(anforderungen));
  return zeilen.join("\n").trim();
}

function begriffeAbschnitt(glossar: GlossaryTerm[]): string {
  const zeilen = [`## Begriffe in dieser Ausschreibung`, ``];
  if (glossar.length === 0) {
    zeilen.push(
      "Für diese Ausschreibung sind keine Fachbegriffe hinterlegt. Taucht trotzdem einer auf, nicht raten -" +
        " lieber sagen, dass keine gesicherte Erklärung vorliegt.",
    );
    return zeilen.join("\n");
  }
  for (const eintrag of glossar) {
    const auch = eintrag.aliases?.length ? ` _(auch: ${eintrag.aliases.join(", ")})_` : "";
    zeilen.push(`**${eintrag.term}**${auch}\n${eintrag.definition}`, ``);
  }
  return zeilen.join("\n").trim();
}

/** Marker exakt wie `konto/rueckgabeblock.ts` sie parst - dort nicht exportiert, hier deshalb wortgleich. */
const RUECKGABE_VORLAGE = `## Rückgabeformat für Anschreiben und Lebenslauf

Sind Anschreiben und/oder Lebenslauf fertig, bitte GENAU in diesem Format ausgeben - jeder Abschnitt vollständig
zwischen seinen Markern, sonst nichts davor oder danach:

\`\`\`
=== BEWERBUNG:ANSCHREIBEN ===
(vollständiger Text des Anschreibens)
=== BEWERBUNG:LEBENSLAUF ===
(vollständiger Text des Lebenslaufs)
=== ENDE ===
\`\`\`

Diese Blöcke lassen sich unverändert einfügen - die Paketseite baut daraus die fertigen PDFs.

Fehlt eine persönliche Angabe für den Briefkopf, sie weder erfinden noch weglassen, sondern genau so als
Platzhalter stehen lassen: [Adresse] (Straße und Hausnummer), [PLZ Ort], [Telefon], [E-Mail] - die Paketseite
setzt sie aus dem Konto ein.
Andere fehlende Angaben ebenfalls in eckigen Klammern markieren (zum Beispiel [Eintrittsdatum]), damit sie vor
dem Einreichen auffallen.`;

/**
 * Ohne gefuehrte Bewerbung (Funktionsschalter BEWERBERDATEN_IM_KONTO aus) gibt
 * es keine Paketseite, die Marker einliest oder Platzhalter einsetzt - die
 * bewerbende Person uebernimmt die Texte selbst.
 */
const TEXTE_OHNE_PAKETSEITE = `## Anschreiben und Lebenslauf übergeben

Die fertigen Texte vollständig und ohne Kommentar davor oder danach ausgeben, Anschreiben und Lebenslauf getrennt
und klar überschrieben. Die bewerbende Person kopiert sie selbst in ein Dokument und speichert sie als PDF.

Fehlt eine persönliche Angabe für den Briefkopf (Adresse, PLZ und Ort, Telefon, E-Mail), sie weder erfinden noch
weglassen, sondern in eckigen Klammern stehen lassen (zum Beispiel [Adresse]) und am Ende sagen, dass die bewerbende
Person diese Stellen vor dem Einreichen selbst ersetzt. Andere fehlende Angaben ebenso markieren.`;

// ─── Zusammenbau ────────────────────────────────────────────────────────────

export interface KiSeiteWissen {
  /** Unveraendert aus `mcp/knowledge/bewerbungsablauf.ts` - eine Quelle, zwei Abnehmer. */
  bewerbungsablauf: string;
  /**
   * VOLLSTAENDIGE Liste aus `mcp/knowledge/glossar.ts` (`ladeGlossar()`) - die
   * Filterung auf die Begriffe DIESER Stelle (s. `begriffeInText`) passiert
   * hier, in der reinen Funktion, nicht beim Aufrufer.
   */
  glossar: GlossaryTerm[];
}

/**
 * Baut die komplette Klartextseite fuer eine Stelle. Reine Funktion - kein
 * Firestore-/HTTP-Zugriff hier, damit sie ohne Mocks testbar bleibt (s.
 * `kiSeite.test.ts`).
 *
 * Ist die Stelle nicht mehr aktiv, endet die Seite absichtlich sofort nach dem
 * Kopf: eine Bewerbung ist nicht mehr moeglich, alles Weitere (Formulare,
 * Unterlagen, Ablauf) waere fuer diesen Fall irrefuehrend.
 */
export function baueKiSeite(
  job: JobRecord,
  anforderungen: DocumentRequirementsResult,
  wissen: KiSeiteWissen,
  /** Gibt es die gefuehrte Bewerbung mit Paketbau aus dem Konto? Vorgabe: der Funktionsschalter. */
  { gefuehrteBewerbung = BEWERBERDATEN_IM_KONTO }: { gefuehrteBewerbung?: boolean } = {},
): string {
  const jobUrl = `${PUBLIC_SITE_URL}/dashboard/jobs/${job.pinstGuid}`;
  const bewerbenUrl = gefuehrteBewerbung ? `${PUBLIC_SITE_URL}/dashboard/bewerben/${job.pinstGuid}` : null;

  if (!job.active) {
    return [
      kopf(job),
      `## Diese Ausschreibung ist geschlossen`,
      ``,
      `Die Bewerbungsfrist für "${job.title}" (Kennung \`${job.refCode}\`) ist vorbei, oder die Stelle wurde ` +
        `zurückgezogen. Eine Bewerbung ist darauf nicht mehr möglich - bitte auf ${PUBLIC_SITE_URL} nach einer ` +
        `aktuellen Ausschreibung suchen.`,
      ``,
      `> ${NICHT_AMTLICH}`,
    ].join("\n\n");
  }

  const glossarText = begriffeInText(
    wissen.glossar,
    [job.title, job.companyDesc, job.jobDesc, job.requireDesc, job.remarcDesc].join(" "),
  );

  const seite = [
    kopf(job),
    soHilfstDu(job, jobUrl, bewerbenUrl),
    ausschreibung(job),
    benoetigteUnterlagen(anforderungen),
    formulare(anforderungen, gefuehrteBewerbung),
    `## Was nach dem Absenden passiert\n\n${alsUnterabschnitt(wissen.bewerbungsablauf)}`,
    begriffeAbschnitt(glossarText),
    gefuehrteBewerbung ? RUECKGABE_VORLAGE : TEXTE_OHNE_PAKETSEITE,
    `> ${NICHT_AMTLICH}`,
  ].join("\n\n");

  return kuerzeGesamt(seite, jobUrl);
}

// ─── HTTP-Endpunkt ──────────────────────────────────────────────────────────

/**
 * Eigenes, kleines Kontingent statt Wiederverwendung von `mappeHttp.ts` oder
 * `mcp/lib/rateLimit.ts`: die Mechanik kommt aus `lib/drosselung.ts`
 * (s. dortige Begruendung fuer Bauart/Grenzen), aber diese Seite ist ein
 * einzelner, cachebarer GET-Abruf ohne Schreibzugriff - naeher an einer
 * Suchanfrage als an Dateiverkehr oder Formularausfuellung.
 */
export const KI_SEITE_QUOTA: Quota = { capacity: 30, refillPerMinute: 20 };

const drossel = createRateLimiter();

export const kiSeite = onRequest({ region: REGION, cors: true, maxInstances: 10 }, async (req: Request, res: Response) => {
  // HEAD mit erlauben: Link-Vorschauen und manche Abrufwerkzeuge der Chats
  // fragen erst per HEAD an und geben bei 405 auf. Express schickt bei HEAD
  // nur die Kopfzeilen.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.set("Allow", "GET, HEAD");
    res.status(405).set("Content-Type", "text/plain; charset=utf-8").send("Nur GET wird unterstützt.");
    return;
  }

  const schluessel = clientKeyFromForwardedFor(req.headers["x-forwarded-for"], req.socket?.remoteAddress);
  const entscheidung = drossel.check(schluessel, KI_SEITE_QUOTA, "kiSeite");
  if (!entscheidung.allowed) {
    res.set("Retry-After", String(entscheidung.retryAfterSeconds));
    res
      .status(429)
      .set("Content-Type", "text/plain; charset=utf-8")
      .send(`Zu viele Anfragen. Bitte in ${entscheidung.retryAfterSeconds} Sekunden erneut versuchen.`);
    return;
  }

  const id = String(req.query.id ?? "");
  if (!istGueltigePinstGuid(id)) {
    res.status(404).set("Content-Type", "text/plain; charset=utf-8").send(SEITE_UNBEKANNT_SATZ);
    return;
  }

  try {
    const job = await loadJobRecord(id);
    const [anforderungen, glossar] = await Promise.all([
      getDocumentRequirements({ pinstGuid: id }, job),
      ladeGlossar(),
    ]);
    const wissen: KiSeiteWissen = { bewerbungsablauf: bewerbungsablaufMarkdown("chat"), glossar };
    const markdown = baueKiSeite(job, anforderungen, wissen);

    res.set("Cache-Control", "public, max-age=3600");
    res.set("X-Robots-Tag", "noindex");
    // text/plain statt text/markdown: der Webzugriff von ChatGPT (ChatGPT-User)
    // bekommt bei text/markdown ein 200 und meldet trotzdem "nicht
    // unterstuetzter Inhalt". Markdown bleibt als Text lesbar.
    res.status(200).set("Content-Type", "text/plain; charset=utf-8").send(markdown);
  } catch (fehler) {
    if (fehler instanceof JobNotFoundError) {
      res.status(404).set("Content-Type", "text/plain; charset=utf-8").send(SEITE_UNBEKANNT_SATZ);
      return;
    }
    logger.error("kiSeite fehlgeschlagen", { name: (fehler as Error).name });
    res
      .status(500)
      .set("Content-Type", "text/plain; charset=utf-8")
      .send("Da ist etwas schiefgelaufen. Bitte versuch es später erneut.");
  }
});
