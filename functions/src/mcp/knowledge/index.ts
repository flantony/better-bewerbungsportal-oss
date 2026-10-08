/**
 * Register aller Wissensdokumente.
 *
 * EINE Quelle, zwei Abnehmer: `server.ts` meldet sie als MCP-Resources an, und
 * das Skill-Bundle fuer /ki wird aus demselben Register erzeugt. Wer hier etwas
 * ergaenzt, muss es nirgends ein zweites Mal pflegen.
 */
import { besoldungMarkdown } from "./besoldung";
import { bewerbungsablaufMarkdown } from "./bewerbungsablauf";
import { glossarMarkdown } from "./glossar";
import { laufbahnenMarkdown } from "./laufbahnen";

export interface Wissensdokument {
  /** Dateiname im Skill-Bundle und letzter Teil der Resource-URI. */
  slug: string;
  titel: string;
  /** Wofuer ein Client das Dokument liest - steht so im Resource-Listing. */
  beschreibung: string;
  markdown: () => string | Promise<string>;
}

export const WISSEN_URI_PREFIX = "bw://wissen/";

export const WISSENSDOKUMENTE: Wissensdokument[] = [
  {
    slug: "laufbahnen",
    titel: "Laufbahngruppen und ihre Voraussetzungen",
    beschreibung:
      "Which school qualification, citizenship and age rules apply to each career group (Mannschaften, Unteroffiziere, Feldwebel, Offiziere, and the civilian service tiers). Read this before telling an applicant whether a posting's career group fits them.",
    markdown: laufbahnenMarkdown,
  },
  {
    slug: "besoldung",
    titel: "Dienstgrade und Besoldungsgruppen",
    beschreibung:
      "Official rank-to-pay-grade mapping (Anlage I BBesG), how the A and E pay tables differ, and why the mapping is a range rather than a single value. Read this instead of answering pay questions from memory.",
    markdown: besoldungMarkdown,
  },
  {
    slug: "bewerbungsablauf",
    titel: "Ablauf einer Bewerbung",
    beschreibung:
      "What happens after the application form is filled in: submission, Karriereberatung, the multi-day aptitude assessment, and the decision. Read this when the applicant asks what comes next.",
    markdown: bewerbungsablaufMarkdown,
  },
  {
    slug: "glossar",
    titel: "Glossar der Bundeswehr-Sprache",
    beschreibung:
      "Every piece of Bundeswehr and public-service jargon that appears in the postings, explained in plain German. Read this before summarising a posting for an applicant.",
    markdown: glossarMarkdown,
  },
];

export function uriFuer(slug: string): string {
  return `${WISSEN_URI_PREFIX}${slug}`;
}
