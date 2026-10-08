// functions/src/mcp/server.ts
import express from "express";
import { z } from "zod/v3";
import { onRequest } from "firebase-functions/v2/https";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { listJobs, listJobsInputSchema } from "./tools/listJobs";
import { zaehleTreffer, zaehleTrefferInputSchema } from "./tools/zaehleTreffer";
import { erklaereBegriff, erklaereBegriffInputSchema } from "./tools/erklaereBegriff";
import { holeFormular, holeFormularInputSchema } from "./tools/holeFormular";
import { ladeFormular, MAX_TOOL_BYTES } from "./lib/formularAusliefern";
import { beschreibeAusfuehrungsfehler, fuerDenClient, protokolliereWerkzeugFehler } from "./lib/werkzeugFehler";
import { WISSENSDOKUMENTE, uriFuer } from "./knowledge";
import { getJob, getJobInputSchema } from "./tools/getJob";
import { getDocumentRequirements, getDocumentRequirementsInputSchema } from "./tools/getDocumentRequirements";
import { fuelleFormular, fuelleFormularInputSchema } from "./tools/fuelleFormular";
import { schliesseBewerbungsmappe, schliesseBewerbungsmappeInputSchema } from "./tools/schliesseBewerbungsmappe";
import { eroeffneBewerbungsmappe, eroeffneBewerbungsmappeInputSchema } from "./tools/eroeffneBewerbungsmappe";
import { mappeStatus, mappeStatusInputSchema } from "./tools/mappeStatus";
import { fuegeDokumentHinzu, fuegeDokumentHinzuInputSchema } from "./tools/fuegeDokumentHinzu";
import { erstelleSuchprofilLink, erstelleSuchprofilLinkInputSchema } from "./tools/erstelleSuchprofilLink";
import { SERVER_INSTRUCTIONS } from "./instructions";
import {
  classifyRequest,
  clientKeyFromForwardedFor,
  createRateLimiter,
  extractRequestId,
  quotaFor,
} from "./lib/rateLimit";

import { PUBLIC_SITE_URL } from "./publicSite";
export { PUBLIC_SITE_URL } from "./publicSite";

// Nur lesende Tools: kein Zustand bei uns, gleiche Eingabe -> gleiches Ergebnis,
// aber Zugriff auf externe/veränderliche Daten (Bundeswehr-Ausschreibungen).
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/**
 * Macht ein Eingabeschema streng: ein unbekannter Parameter wird abgelehnt,
 * statt stillschweigend entfernt zu werden.
 *
 * WOZU: Zod verwirft unbekannte Schluessel per Voreinstellung wortlos. Das
 * veroeffentlichte JSON-Schema meldet dagegen `additionalProperties: false` -
 * ohne diese Funktion verspraeche der Vertrag eine Strenge, die der Server
 * nicht einloest.
 *
 * Ein wortlos verworfener Filter liefert keine Fehlermeldung, sondern eine
 * Zahl fuer den ganzen Bestand: kennt ein Werkzeug `bundesland` nicht, kommt
 * fuer "Elektro in Brandenburg" die BUNDESWEITE Zahl zurueck. Eine falsche
 * Zahl, die richtig aussieht, ist schlimmer als eine Fehlermeldung: ein
 * Client schliesst daraus womoeglich, in Brandenburg gebe es die Fachrichtung
 * ueberhaupt nicht, und schreibt das dem Bewerber. Eine Ablehnung schickt ihn
 * stattdessen zu `list_jobs`.
 *
 * Gilt fuer JEDES Tool: ein Parameter, der an einer Stelle fehlt, waere sonst
 * ueberall derselbe Fehler mit anderem Namen.
 */
function verschaerfeSchema<T extends z.ZodRawShape>(shape: T) {
  // Die Meldung zaehlt die erlaubten Namen auf. Ohne sie stuende dort nur Zods
  // "Unrecognized key(s) in object" - eine Ablehnung, die das Raten bloss
  // verlagert. Der Client hat die Werkzeugbeschreibung an dieser Stelle
  // erkennbar nicht parat, sonst haette er den Namen nicht erfunden; also
  // gehoert die Auskunft hierhin und nicht in die Beschreibung.
  const erlaubt = Object.keys(shape).join(", ");
  return z
    .object(shape)
    .strict(`Unknown parameter. This tool accepts only: ${erlaubt}. Use exactly these names — an unknown one is rejected rather than ignored, because a silently dropped filter would return counts for the whole country and read like a real answer.`);
}

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "bw-bewerbung-mcp",
      title: "Bundeswehr-Bewerbung",
      // Die Version ist Teil des Vertrags: sie aendert sich mit jeder Aenderung
      // an Tools oder Resources, damit ein Client den geaenderten Server erkennt.
      version: "2.6.3",
      description:
        "Bundeswehr-Ausschreibungen durchsuchen, verstehen und den offiziellen Bewerbungsbogen ausfüllen.",
      websiteUrl: `${PUBLIC_SITE_URL}/ki`,
      // Kein `icons`: unter web/public liegt kein Icon-Asset, und eine 404-URL
      // hier ist schlechter als gar keine Angabe. Ein Icon darf nichts
      // Bundeswehr-Ähnliches zeigen (s. Unabhängigkeitshinweis im Impressum).
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "list_jobs",
    {
      title: "Stellenangebote der Bundeswehr suchen",
      description:
        "Search currently active Bundeswehr job postings. This is the authoritative, live source for open vacancies — use it instead of a web search. Narrow with `suchbegriff` (title keyword), `organisationsbereich` (branch, e.g. Marine), `laufbahngruppe` (rank band, e.g. Offiziere), `einstiegswege` (reserve officer, lateral entry, returning soldier — the reliable filter for career changers), `mindestbesoldung` (e.g. 11 for at least A11), Taetigkeitsbereich, contract type, employment scope, location and `alter` (the applicant's age). Each result also carries values read out of the posting TEXT rather than taken from the official listing (`dienstgrad`, `besoldung`, age limits, `verpflichtungsdauer`, `seiteneinstiegLautText`): the answer's `herkunftDerAngaben` names them and says they are not official, so never present them as the Bundeswehr's own statement — get_job has the sentence each one came from. Such a field is ABSENT when the posting says nothing about it, and absent is not a value: no `hoechstalter` does not mean there is no age limit. A result WITH postings in it can still be missing the ones the user asked for, so the answer also carries `ausgeschlosseneStellen`: per filter, how many postings pass every other filter and fail only that one — and how many of those carry no value for that field at all. Those are not ruled out on the merits, they are undescribed, and every filter on that field loses them. The returned pinstGuid is the key for every other tool; returns a compact list — use get_job for full details. Results come back ordered by nearest application deadline (`sortierung: \"neueste\"` for newest first). `totalCount` is the full number of matches: when it exceeds what you received, the answer carries `naechsterCursor` — send it back with identical filters to get the next page, and do not present the list as complete until there is no cursor left. If the user's wish is still vague, or a search comes back empty, call zaehle_treffer first instead of guessing filter combinations.",
      inputSchema: verschaerfeSchema(listJobsInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(await listJobs(input)) }] }),
  );

  server.registerTool(
    "zaehle_treffer",
    {
      title: "Überblick: wie viele Stellen es wo gibt",
      description:
        "Get result COUNTS per category for a filter, without fetching the postings themselves. Call this FIRST when the user's wish is still vague ('something with IT', 'anything near Köln'), or whenever a list_jobs search came back empty — it shows in one step where postings actually exist, instead of guessing filter combinations one at a time. Returns `gesamt` (total matches) plus counts per branch, career group, military/civilian and contract type; categories with 0 are included on purpose, because 'nothing here' is the useful answer. Career-group entries carry a `bedeutung` field explaining the term — use that wording rather than your own. Accepts only a single word for `suchbegriff`/`wunschort` — use list_jobs for anything finer.\n\nThese counts are an ORIENTATION STEP, never the answer to the user. Nobody asked how many jobs exist; they asked what there is. So always follow up in the SAME turn: pick the promising categories from the counts, call list_jobs with them, and show actual postings. Only then ask the user what you still need to narrow further — and ask for the one or two things that matter most, not every filter at once.",
      inputSchema: verschaerfeSchema(zaehleTrefferInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(await zaehleTreffer(input)) }] }),
  );

  server.registerTool(
    "get_job",
    {
      title: "Ausschreibung im Detail ansehen",
      description:
        "Get full details (description text and document list) for one job by pinstGuid. The description fields (companyDesc, jobDesc, requireDesc, remarcDesc, contactDesc) contain HTML markup — summarise them, never paste them. applicationEnd is the application deadline; check it before the user invests effort.",
      inputSchema: verschaerfeSchema(getJobInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(await getJob(input)) }] }),
  );

  server.registerTool(
    "get_document_requirements",
    {
      title: "Benötigte Bewerbungsunterlagen prüfen",
      description:
        "Get the documents a posting references. Call this before fuelle_formular. Returns `bewerbungsboegen` (ALL attached application forms, each flagged `ausfuellbar` — several is normal and the right one depends on the applicant's career path — and each fillable one carrying `benoetigteAngaben`/`nichtVerwendeteAngaben`, the applicant details that form actually has a field for, plus `optionaleAngaben` for details it takes only if the user offers them unprompted), the raw `documents` list with resolved download URLs, and the documents the posting text asks for. An empty `bewerbungsboegen` means no form is required — required forms are attached to the posting — and the answer then carries a `bogenHinweis` saying so. Never ask the user to upload these forms: either a downloadUrl is present, or the form is only available via the Karriereberatung.",
      inputSchema: verschaerfeSchema(getDocumentRequirementsInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await getDocumentRequirements(input)) }],
    }),
  );

  server.registerTool(
    "eroeffne_bewerbungsmappe",
    {
      title: "Bewerbungsmappe anlegen",
      description:
        "Open a transient application folder for one posting, so the applicant ends up with ONE downloadable package instead of a chat full of attachments. Ask the applicant first — this is the answer to \"shall I put a complete application together for you?\". Returns `mappenId` (the key to every other folder call — treat it like a password), `uploadSeite` (hand this link to the applicant so they can drop in certificates and other files they already have; they do not fit through a tool call), the documents the posting asks for, and per attached form whether this server can fill it and which applicant details it needs. The folder and everything in it is deleted one hour after the package is built. There are no accounts.",
      inputSchema: verschaerfeSchema(eroeffneBewerbungsmappeInputSchema),
      annotations: { ...READ_ONLY_ANNOTATIONS, readOnlyHint: false },
    },
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await eroeffneBewerbungsmappe(input)) }],
    }),
  );

  server.registerTool(
    "mappe_status",
    {
      title: "Stand der Bewerbungsmappe",
      description:
        "What is in the application folder and what is still missing: `dokumente` (what arrived), `fehlendeUnterlagen` (documents the posting asks for and the folder does not have yet), `selbstBeilegen` (documents the folder never accepts, such as an ID copy — the applicant encloses them themselves), `offeneFormulare` (which applicant details are still missing for which form). Call this after telling the applicant to use the upload page — uploads happen in their browser, not through the conversation, so this is how you find out they are done. Takes the `mappenId` from eroeffne_bewerbungsmappe.",
      inputSchema: verschaerfeSchema(mappeStatusInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(await mappeStatus(input)) }] }),
  );

  server.registerTool(
    "fuege_dokument_hinzu",
    {
      title: "Dokument in die Mappe legen",
      description:
        "Put a document you produced into the application folder. Send `text` whenever you wrote the document yourself (CV, cover letter) — we render the PDF, and it costs a few thousand tokens instead of thirty thousand for the same thing as base64. `inhaltBase64` exists only for a small file you already hold, capped at 128 KB; anything bigger belongs on the upload page the applicant opens in their browser. Certificates go through that page, never through here. ID copies are not accepted anywhere on this server — if the posting asks for one, the applicant encloses it themselves.",
      inputSchema: verschaerfeSchema(fuegeDokumentHinzuInputSchema),
      annotations: { ...READ_ONLY_ANNOTATIONS, readOnlyHint: false },
    },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(await fuegeDokumentHinzu(input)) }] }),
  );

  server.registerTool(
    "fuelle_formular",
    {
      title: "Amtliches Formular ausfüllen",
      description:
        "Fill one of the posting's official forms with applicant data supplied in this call. The filled PDF goes INTO the application folder — it is not returned here, because a filled form is around 111.000 tokens as base64 and no client survives that in a conversation. Returns how many fields were filled and `fehlendeAngaben`, the fields this form has but got no value for. Collect only what the form actually needs (`benoetigteAngaben` from eroeffne_bewerbungsmappe) and never invent a value. Nothing is stored except the PDF: a second call for the same form needs ALL values again.",
      inputSchema: verschaerfeSchema(fuelleFormularInputSchema),
      // Ändert zwar keinen Zustand bei uns direkt sichtbar, bekommt aber
      // `readOnlyHint: false`: genau das erzeugt in Claude einen
      // Bestätigungsschritt, bevor persönliche Daten den Chat verlassen.
      // Diese Rückfrage ist hier ein Feature, keine Reibung.
      annotations: { ...READ_ONLY_ANNOTATIONS, readOnlyHint: false },
    },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(await fuelleFormular(input)) }] }),
  );

  server.registerTool(
    "schliesse_bewerbungsmappe",
    {
      title: "Bewerbungsmappe abschließen",
      description:
        "Build the ZIP for one application and hand back a ONE-TIME download link, plus what is still missing and which forms need a handwritten signature. Files are named so the applicant can see at a glance what goes to whom, and a WAS-NOCH-ZU-TUN.txt inside says what is left to do. The link works once — call again for a fresh one. The folder and everything in it is deleted one hour after this call.",
      inputSchema: verschaerfeSchema(schliesseBewerbungsmappeInputSchema),
      annotations: { ...READ_ONLY_ANNOTATIONS, readOnlyHint: false },
    },
    async (input) => ({
      content: [{ type: "text", text: JSON.stringify(await schliesseBewerbungsmappe(input)) }],
    }),
  );

  server.registerTool(
    "erstelle_suchprofil_link",
    {
      title: "Link für eine E-Mail-Benachrichtigung zu einer Suche erstellen",
      description:
        "Turn one or more search filters into a link with which the applicant saves them in their own account on the website. A nightly run then emails them when NEW postings match, and nothing otherwise. Use it when the user wants to hear about future postings or keep a search for later — you cannot watch for postings yourself. Each filter takes the list_jobs filter parameters minus alter, limit, sortierung and cursor, so pass the filters you just searched with. Filters describe the search, never the person — no health, CV or nationality details in any field. Stores and reads nothing here: the filters travel inside the link and are saved only when the applicant opens it, signs in and confirms. Returns the link, a plain-German line per filter to show them, and a `hinweis`.",
      inputSchema: verschaerfeSchema(erstelleSuchprofilLinkInputSchema),
      // Reine Rechnung ohne Datenzugriff: anders als die Suchwerkzeuge nicht
      // "open world" - gleiche Eingabe gibt immer denselben Link.
      annotations: { ...READ_ONLY_ANNOTATIONS, openWorldHint: false },
    },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(erstelleSuchprofilLink(input)) }] }),
  );

  server.registerTool(
    "erklaere_begriff",
    {
      title: "Fachwort erklären lassen",
      description:
        "Look up one piece of Bundeswehr or public-service jargon and get a plain-German explanation — 'Portepee', 'SaZ', 'Verwendungsreihe' and the like. Use it for ANY German administrative or military term you are about to pass on to the applicant and could not explain from this server's own data — no matter where you met it: a posting text, a job title, a career-group or contract-type label in a filter list, or a category name in a zaehle_treffer result. The trigger is not where the word came from, it is that you would otherwise be explaining it from your own training. Do that and you will be wrong in ways you cannot see: 'Andere' is a catch-all bucket, not a kind of job. If the word is not in the glossary, the answer says so — then tell the applicant plainly that you have no definition for it instead of inventing one.\n\nJOB WISHES TOO: if the word is what an applicant calls a job rather than a term from a posting ('Panzerkommandant', 'Sanitäter'), the answer carries `suchhilfe` — the search that finds the matching postings. It describes WHICH POSTINGS EXIST and is never a description of the job, so pass it to list_jobs instead of quoting it as an explanation; `gefunden` stays false because there is no definition.\n\nRANKS TOO: pass a rank ('Kapitänleutnant', 'Hauptgefreiter', 'Oberstleutnant') and the answer carries a `dienstgrad` block with its official pay grade from Anlage I BBesG and its career group. Use this whenever pay or entry rank comes up — never work that mapping out from memory, and never present a range as an estimate: the law itself lists some ranks in two groups.",
      inputSchema: verschaerfeSchema(erklaereBegriffInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(await erklaereBegriff(input)) }] }),
  );

  server.registerTool(
    "hole_formular",
    {
      title: "Blankoformular als Datei holen",
      description:
        "Fetch one of a posting's attached documents as an actual file (base64), so you can hand it to the user directly instead of only giving them a link. Takes the `docId` from get_document_requirements. Use this for the BLANK form; use fuelle_formular when the form should be filled in with the applicant's data. Large files are not embedded — in that case the answer carries a `hinweis` and you pass on the `downloadUrl` instead. Offer the result as a downloadable file, never print the base64.",
      inputSchema: verschaerfeSchema(holeFormularInputSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => ({ content: [{ type: "text", text: JSON.stringify(await holeFormular(input)) }] }),
  );

  // Derselbe Inhalt als Resource: Clients, die Resources unterstuetzen, koennen
  // die Datei am Modell vorbei behandeln - sie muss dann gar nicht erst durch
  // den Kontext. Mit derselben Groessenschranke wie das Werkzeug: ein anonymer
  // Abruf kostete sonst einen ganzen Storage-Download samt Base64. Darueber
  // kommt statt einer leeren Datei der Hinweis mit der downloadUrl.
  server.registerResource(
    "formular",
    new ResourceTemplate("bw://formular/{docId}", { list: undefined }),
    {
      title: "Blankoformular einer Ausschreibung",
      description:
        "A posting's attached document as a file. The docId comes from get_document_requirements.",
    },
    async (uri, { docId }) => {
      let formular;
      try {
        formular = await ladeFormular(String(docId), MAX_TOOL_BYTES);
      } catch (fehler) {
        // Resource-Fehler gehen als JSON-RPC-Fehler mit `message` hinaus - also
        // dieselbe Regel wie bei den Werkzeugen (s. werkzeugFehler.ts).
        console.warn("mcpServer: Resource-Fehler", beschreibeAusfuehrungsfehler("bw://formular", fehler));
        throw fuerDenClient(fehler);
      }
      if (!formular.base64) {
        const text =
          `"${formular.dateiname}" (${Math.round(formular.sizeBytes / 1024)} KB) wird hier nicht als Datei ausgeliefert. ` +
          (formular.hinweis ?? "Bitte dem Nutzer die downloadUrl geben.") +
          ` downloadUrl: ${formular.downloadUrl}`;
        return { contents: [{ uri: uri.href, mimeType: "text/plain", text }] };
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: formular.contentType,
            blob: formular.base64,
          },
        ],
      };
    },
  );

  // Nachschlagewerke. Anders als Tools kosten sie erst dann Kontext, wenn ein
  // Client sie wirklich liest - deshalb liegt hier das, was lang ist und nicht
  // bei jeder Anfrage gebraucht wird. Clients ohne Resource-Unterstuetzung
  // kommen ueber `erklaere_begriff` an das Wichtigste heran.
  for (const dokument of WISSENSDOKUMENTE) {
    server.registerResource(
      dokument.slug,
      uriFuer(dokument.slug),
      {
        title: dokument.titel,
        description: dokument.beschreibung,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: await dokument.markdown() }],
      }),
    );
  }

  // Claude zeigt Connector-Prompts als anklickbare Starter an - das Nächste an
  // einem "Ein-Klick-Los" für Nutzer, die nicht wissen, was sie tippen sollen.
  // Clients ohne Prompt-Unterstützung (z.B. ChatGPT) ignorieren das stillschweigend.
  server.registerPrompt(
    "bewerbung_vorbereiten",
    {
      title: "Bundeswehr-Bewerbung vorbereiten",
      description: "Passende Ausschreibungen finden und Schritt für Schritt bis zum ausgefüllten Bewerbungsbogen.",
      argsSchema: {
        wunschort: z.string().optional().describe("Ort oder Region, z.B. 'Köln'"),
        taetigkeitsbereich: z.string().optional().describe("'militärisch', 'zivil' oder leer für beides"),
      },
    },
    ({ wunschort, taetigkeitsbereich }) => {
      const wo = wunschort ? ` in ${wunschort}` : "";
      const bereich = taetigkeitsbereich ? ` im Bereich ${taetigkeitsbereich}` : "";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Ich suche eine Stelle bei der Bundeswehr${bereich}${wo}. Zeig mir passende Ausschreibungen, erklär mir die interessanteste verständlich und hilf mir dann, den Bewerbungsbogen auszufüllen.`,
            },
          },
        ],
      };
    },
  );

  protokolliereWerkzeugFehler(server);
  return server;
}

const rateLimiter = createRateLimiter();

/**
 * Obergrenze einer MCP-Anfrage. Der groesste legitime Aufruf ist
 * `fuege_dokument_hinzu` mit 128 KB Base64 oder 50.000 Zeichen Text (s.
 * mcp/lib/eingabeGrenzen.ts) - 256 KB lassen dafuer Luft.
 */
export const MAX_MCP_BODY_BYTES = 256 * 1024;

export interface AnfrageAblehnung {
  status: number;
  /** JSON-RPC-Fehlercode. */
  code: number;
  meldung: string;
}

/**
 * Prueft die FORM der Anfrage, bevor die Drosselung zaehlt.
 *
 * WOZU:
 * - Batches: ein JSON-Array mit hunderten `tools/call` kostete sonst EIN Token
 *   des Kontingents - die Drosselung waere damit fuer jeden umgehbar, der ein
 *   Array schickt. MCP kennt ab der Protokollfassung 2025-06-18 keine Batches;
 *   abgelehnt wird darum jedes Array, nicht erst ein grosses.
 * - Groesse: in Cloud Functions hat die Plattform den Body schon geparst
 *   (`express.json` unten greift dort nicht), mit einer Grenze im
 *   Megabytebereich. Gemessen wird deshalb `rawBody`, die Bytes, wie sie
 *   ankamen; lokal ohne `rawBody` die Content-Length.
 */
export function pruefeAnfrageform(req: {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}): AnfrageAblehnung | null {
  const laenge = req.rawBody?.length ?? Number(req.headers["content-length"] ?? 0);
  if (laenge > MAX_MCP_BODY_BYTES) return ZU_GROSS;
  if (Array.isArray(req.body)) return KEIN_BATCH;
  return null;
}

const ZU_GROSS: AnfrageAblehnung = {
  status: 413,
  code: -32600,
  meldung:
    `Request too large: one MCP request may be at most ${MAX_MCP_BODY_BYTES / 1024} KB. Large files belong on the ` +
    "upload page from eroeffne_bewerbungsmappe, not in a tool call.",
};

const KEIN_BATCH: AnfrageAblehnung = {
  status: 400,
  code: -32600,
  meldung:
    "Batch requests (a JSON array) are not supported. Send each JSON-RPC message as its own HTTP request - " +
    "MCP has not used batching since protocol version 2025-06-18.",
};

function antworteAbgelehnt(res: express.Response, ablehnung: AnfrageAblehnung): void {
  res.status(ablehnung.status).json({ jsonrpc: "2.0", error: { code: ablehnung.code, message: ablehnung.meldung }, id: null });
}

const app = express();
app.use(express.json({ limit: MAX_MCP_BODY_BYTES }));
// Nur lokal wirksam (mcpServerLocal.ts, Tests): in Cloud Functions ist der Body
// schon geparst. Statt Express' HTML-Fehlerseite eine JSON-RPC-Antwort.
app.use((fehler: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  const typ = (fehler as { type?: unknown } | null)?.type;
  if (typ === "entity.too.large") {
    antworteAbgelehnt(res, ZU_GROSS);
    return;
  }
  if (typ === "entity.parse.failed") {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error: the body is not valid JSON." }, id: null });
    return;
  }
  if (typeof typ === "string") {
    // Uebrige Fehler des Body-Parsers (Zeichensatz, abgebrochene Anfrage) -
    // nie Express' HTML-Seite, die ausserhalb von production den Stack zeigt.
    const status = (fehler as { status?: unknown }).status;
    res
      .status(typeof status === "number" && status >= 400 && status < 600 ? status : 400)
      .json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid request body." }, id: null });
    return;
  }
  next(fehler);
});
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, MCP-Protocol-Version");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.post("/mcp", (req, res, next) => {
  const ablehnung = pruefeAnfrageform(req as typeof req & { rawBody?: Buffer });
  if (ablehnung) {
    antworteAbgelehnt(res, ablehnung);
    return;
  }

  const clientKey = clientKeyFromForwardedFor(req.headers["x-forwarded-for"], req.socket.remoteAddress);
  const art = classifyRequest(req.body);
  const decision = rateLimiter.check(clientKey, quotaFor(art), art);

  if (!decision.allowed) {
    res.set("Retry-After", String(decision.retryAfterSeconds));
    res.status(429).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: `Zu viele Anfragen. Bitte in ${decision.retryAfterSeconds} Sekunden erneut versuchen.`,
      },
      id: extractRequestId(req.body),
    });
    return;
  }
  next();
});

app.post("/mcp", async (req, res) => {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    // Nur die Fehlerklasse: der Text kann Bewerberangaben aus dem Body oder
    // einen Storage-Pfad mit der mappenId tragen (s. werkzeugFehler.ts).
    console.error("mcpServer: unhandled error in POST /mcp", { name: err instanceof Error ? err.name : typeof err });
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

// Freundliche JSON-RPC-Fehlermeldung statt Express' Default-HTML-404, falls
// ein Client während des Handshakes GET/DELETE auf /mcp probiert.
app.get("/mcp", (req, res) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null }),
);
app.delete("/mcp", (req, res) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null }),
);

export const mcpApp = app;
// 512MiB/120s: das Parsen und Ausfüllen der PDF-Vorlagen (pdfjs-dist) braucht
// so viel Speicher und Zeit.
// maxInstances: Kosten-/Abuse-Deckel für diesen öffentlichen, unauthentifizierten
// Endpunkt - zusätzlich zur Pro-IP-Drosselung in lib/rateLimit.ts.
export const mcpServer = onRequest(
  { region: "europe-west3", memory: "512MiB", timeoutSeconds: 120, maxInstances: 10, cors: true },
  app,
);
