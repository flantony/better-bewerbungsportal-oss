// zod/v3 (nicht "zod") - s. Kommentar in listJobs.ts.
import { z } from "zod/v3";
import { suchprofilSchema, type Suchprofil } from "../../konto/kontoTypen";
import { hatSuchprofil } from "../../konto/benachrichtigung";
import {
  baueSuchprofilLink,
  LINK_MAX_ZEICHEN,
  NAME_MAX_ZEICHEN,
  SUCHPROFILE_MAX,
  SuchprofilLinkFehler,
} from "../../lib/suchprofilLink";
import { EINSTIEGSWEG_BEDEUTUNG_DE } from "../../lib/einstiegsweg";
import { LAUFBAHNGRUPPE_BEDEUTUNG_DE } from "../lib/filterOptions";
import { geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";
import { HinweisFehler } from "../../lib/hinweisFehler";

/**
 * Macht aus Suchfiltern einen Link, mit dem der Bewerber sie in seinem Konto
 * auf der Website speichert; ein naechtlicher Lauf ohne KI fuehrt sie aus und
 * mailt nur bei neuen Treffern.
 *
 * REINE RECHNUNG: liest nichts, speichert nichts, zaehlt nichts. Die Filter
 * stehen im Fragment des Links (s. lib/suchprofilLink.ts) und erreichen unseren
 * Server erst, wenn der Bewerber sie angemeldet selbst speichert. Eine
 * Trefferzahl je Filter gibt es nicht: zaehle_treffer kann nur einen
 * Teil der Filter zaehlen (ein Wort, kein Besoldungsfilter), und zehn Filter
 * waeren zehn Abfragen auf einem Werkzeug, das sonst nichts kostet.
 */

const SUCHFELDER = Object.keys(suchprofilSchema.shape).join(", ");

/**
 * Exakt die Felder von `suchprofilSchema` - also die list_jobs-Filter ohne
 * alter, limit, sortierung, cursor. Eigene Meldungen statt der von Zod: der
 * naheliegende Fehler ist, den letzten list_jobs-Aufruf samt `alter` oder
 * `cursor` einzusetzen, und die Ablehnung soll sagen, was stattdessen gilt.
 */
const filterEintragSchema = z
  .object(suchprofilSchema.shape)
  .strict(
    `Unknown filter field. A saved filter takes only: ${SUCHFELDER} — the list_jobs filters minus alter, limit, sortierung and cursor, which belong to one search, not to a saved one. Never put the applicant's age into a filter.`,
  )
  .refine(hatSuchprofil, {
    message:
      "This filter narrows nothing down and would report every new posting. `besoldungstabelle` without `mindestbesoldung`, \"beide\" and `seiteneinstieg: false` restrict nothing — set at least one field that does, e.g. suchbegriff, bundesland or laufbahngruppe.",
  });

export const erstelleSuchprofilLinkInputSchema = {
  filter: z
    .array(filterEintragSchema)
    .min(1)
    .max(SUCHPROFILE_MAX)
    .describe(
      `1 to ${SUCHPROFILE_MAX} search filters. Each one takes exactly the list_jobs filter parameters (same names, same allowed values) except alter, limit, sortierung and cursor — so pass the filter you just used in list_jobs or zaehle_treffer unchanged, minus those. Several narrow filters beat one broad one: "IT in Köln" and "IT in Bonn" as two entries, rather than one filter that matches half the country.`,
    ),
  namen: z
    .array(z.string().max(NAME_MAX_ZEICHEN))
    .max(SUCHPROFILE_MAX)
    .optional()
    .describe(
      `Optional short German title per filter, same order as \`filter\` (at most ${NAME_MAX_ZEICHEN} characters), e.g. "IT-Stellen in Köln". It describes the SEARCH, never the person: no health, nationality, CV or personal details.`,
    ),
};

const erstelleSuchprofilLinkInput = z.object(erstelleSuchprofilLinkInputSchema);
export type ErstelleSuchprofilLinkInput = z.infer<typeof erstelleSuchprofilLinkInput>;

export interface SuchprofilBeschreibung {
  nummer: number;
  name?: string;
  /** Eine Zeile Klartext, aus den Feldern abgeleitet. */
  beschreibung: string;
  /**
   * Die vorhandenen Bedeutungstexte zu Laufbahngruppen und Einstiegswegen, die
   * der Filter nennt - damit die KI sie nicht aus dem Gedaechtnis erklaert.
   */
  bedeutungen?: Record<string, string>;
}

export interface ErstelleSuchprofilLinkResult {
  link: string;
  filter: SuchprofilBeschreibung[];
  hinweis: GeteilterHinweis;
}

// ─── Klartext ────────────────────────────────────────────────────────────────

/**
 * Jeder Wert in Anfuehrungszeichen: zwei Organisationsbereiche enthalten selbst
 * ein Komma, kommagetrennt lesen sich daraus mehr Bereiche, als es gibt.
 */
function liste(werte: readonly string[]): string {
  return werte.map((wert) => `„${wert}“`).join(", ");
}

function grossAnfang(wert: string): string {
  return wert.charAt(0).toUpperCase() + wert.slice(1);
}

/** Eine Zeile je Filter. Nur Werte und Feldnamen, keine Erklaerung von Fachbegriffen. */
export function beschreibeSuchprofil(filter: Suchprofil): string {
  const teile: string[] = [];
  if (filter.suchbegriff) teile.push(`Stellentitel enthält „${filter.suchbegriff}“`);
  if (filter.wunschort) teile.push(`Ort: ${filter.wunschort}`);
  if (filter.bundesland?.length) teile.push(`Bundesland: ${liste(filter.bundesland)}`);
  if (filter.organisationsbereich?.length) teile.push(`Bereich: ${liste(filter.organisationsbereich)}`);
  if (filter.laufbahngruppe?.length) teile.push(`Laufbahngruppe: ${liste(filter.laufbahngruppe)}`);
  if (filter.taetigkeitsbereich === "militaerisch") teile.push("nur militärische Stellen");
  if (filter.taetigkeitsbereich === "zivil") teile.push("nur zivile Stellen");
  if (filter.vertragsarten?.length) teile.push(`Vertragsart: ${liste(filter.vertragsarten)}`);
  if (filter.beschaeftigungsumfang === "vollzeit") teile.push("nur Vollzeit");
  if (filter.beschaeftigungsumfang === "teilzeit") teile.push("nur Teilzeit");
  if (filter.einstiegswege?.length) {
    teile.push(`Einstiegsweg: ${liste(filter.einstiegswege.map(grossAnfang))}`);
  }
  if (filter.seiteneinstieg) teile.push("Ausschreibungstext spricht von Seiteneinstieg (oder lässt es offen)");
  if (filter.mindestbesoldung !== undefined) {
    // Die Klammern geben wieder, was die Parameterbeschreibung von list_jobs
    // zu den beiden Tabellen sagt - keine eigene Erklaerung.
    teile.push(
      filter.besoldungstabelle === "E"
        ? `Entgeltgruppe mindestens E${filter.mindestbesoldung} (Tarif für zivile Beschäftigte)`
        : `Besoldungsgruppe mindestens A${filter.mindestbesoldung} (Beamte und Soldaten)`,
    );
  }
  return teile.join("; ");
}

function bedeutungenFuer(filter: Suchprofil): Record<string, string> | undefined {
  const eintraege: [string, string][] = [
    ...(filter.laufbahngruppe ?? []).map((gruppe): [string, string] => [gruppe, LAUFBAHNGRUPPE_BEDEUTUNG_DE[gruppe] ?? ""]),
    ...(filter.einstiegswege ?? []).map((weg): [string, string] => [grossAnfang(weg), EINSTIEGSWEG_BEDEUTUNG_DE[weg] ?? ""]),
  ].filter(([, text]) => text !== "");
  return eintraege.length > 0 ? Object.fromEntries(eintraege) : undefined;
}

// ─── Hinweis ─────────────────────────────────────────────────────────────────

const FUER_DEN_BEWERBER =
  "Öffne den Link, melde dich an (oder registriere dich kostenlos), prüfe die Filter und speichere sie. Du bekommst nur eine Mail, wenn neue passende Stellen erscheinen.";

const NUR_FUER_DICH =
  "Give the applicant the link exactly as it is — it only works complete, and the filters travel in the part after '#', which never reaches any server until they save it. " +
  "Show each filter's `beschreibung` so they know what they are saving; for career groups and entry routes use the `bedeutungen` wording, never your own. " +
  "Put only search filters into a link — never a free-text description of the person's skills, CV, health or nationality, not in `suchbegriff`, `wunschort` or `namen` either (`wunschort` is a town, never a street address). " +
  "Several narrow filters beat one broad one: a broad filter mails postings the person will never apply for, and they stop reading the mails. " +
  "Derive `laufbahngruppe` from the school or vocational qualification the user actually mentioned, using bw://wissen/laufbahnen or the `bedeutung` texts from zaehle_treffer — do not guess it, and leave it out if you do not know. " +
  "Matching runs once a night, so do not promise an immediate mail. You cannot see whether they saved it, and you will not be notified of new postings yourself.";

// ─── Werkzeug ────────────────────────────────────────────────────────────────

export function erstelleSuchprofilLink(input: ErstelleSuchprofilLinkInput): ErstelleSuchprofilLinkResult {
  const filter = input.filter as Suchprofil[];
  const namen = input.namen ?? [];
  if (namen.length > filter.length) {
    throw new HinweisFehler(
      `\`namen\` has ${namen.length} entries but \`filter\` only ${filter.length}. Give at most one name per filter, in the same order — or leave \`namen\` out.`,
    );
  }

  // Das Eingabeschema faengt alles ab, was die Uebernahme ablehnen wuerde -
  // bis auf die Laenge des fertigen Links. Die Meldung nennt den Weg heraus;
  // die Fehlerklasse bleibt, damit das Werkzeugfehler-Protokoll sie fuehrt.
  let link: string;
  try {
    link = baueSuchprofilLink(filter, namen);
  } catch (fehler) {
    if (fehler instanceof SuchprofilLinkFehler && fehler.code === "zu-lang") {
      throw new SuchprofilLinkFehler(
        "zu-lang",
        `The link would be too long (limit ${LINK_MAX_ZEICHEN} characters after '#'). Split the filters across two calls ` +
          "(two links), or shorten suchbegriff/wunschort — lists of allowed values cost almost nothing, long free text is what makes a link long.",
      );
    }
    throw fehler;
  }

  return {
    link,
    filter: filter.map((eintrag, index) => {
      const name = namen[index]?.trim();
      const bedeutungen = bedeutungenFuer(eintrag);
      return {
        nummer: index + 1,
        ...(name ? { name } : {}),
        beschreibung: beschreibeSuchprofil(eintrag),
        ...(bedeutungen ? { bedeutungen } : {}),
      };
    }),
    hinweis: geteilterHinweis(NUR_FUER_DICH, FUER_DEN_BEWERBER),
  };
}
