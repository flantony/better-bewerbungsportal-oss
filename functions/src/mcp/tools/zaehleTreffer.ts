// zod/v3 (nicht "zod") - s. Kommentar in listJobs.ts.
import { z } from "zod/v3";
import { VERTRAGSART_OPTIONS, LAUFBAHNGRUPPE_OPTIONS, ORGANISATIONSBEREICH_OPTIONS } from "../../lib/onboardingOptions";
import {
  BUNDESLAND_NAMES,
  erlaubteWerte,
  EINSTIEGSWEG_RESERVE_HINWEIS,
  VERTRAGSART_RESERVE_HINWEIS,
  laufbahngruppeBedeutung,
  LAUFBAHNGRUPPE_NAMES,
  ORGANISATIONSBEREICH_NAMES,
  toBundeslandCodes,
  toLaufbahngruppeCodes,
  toOrganisationsbereichCodes,
} from "../lib/filterOptions";
import { countFacets, type FacetDimension, type FacetZaehlung } from "../lib/countFacets";
import { planOrt, planSuche } from "../../lib/suchTokens";
import { EINSTIEGSWEG_WERTE, einstiegswegBedeutung } from "../../lib/einstiegsweg";
import { hinweisFuerLeereSuche } from "../knowledge/berufswuensche";
import { fasseHinweiseZusammen, geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";
import { NEUE_STELLEN_PER_MAIL } from "../lib/neueStellenPerMail";
import { HinweisFehler } from "../../lib/hinweisFehler";

const VERTRAGSART_VALUES = VERTRAGSART_OPTIONS.map((option) => option.value) as [string, ...string[]];

export const zaehleTrefferInputSchema = {
  suchbegriff: z
    .string()
    .optional()
    .describe(
      "Single keyword from the job TITLE, e.g. 'IT'. Only ONE word is allowed here (unlike list_jobs): counting several words would require filtering in memory, which would make the numbers wrong rather than slow. Cannot be combined with `wunschort`.",
    ),
  organisationsbereich: z
    .array(z.enum(ORGANISATIONSBEREICH_NAMES))
    .optional()
    .describe(
      `Restrict the overview to these branches. Allowed (each value in quotes — two of them contain a comma themselves): ${erlaubteWerte(ORGANISATIONSBEREICH_NAMES)}. Leave it out to get the counts BY branch — that is the usual reason to call this tool.`,
    ),
  laufbahngruppe: z
    .array(z.enum(LAUFBAHNGRUPPE_NAMES))
    .optional()
    .describe(
      `Restrict the overview to these career groups. Allowed: ${erlaubteWerte(LAUFBAHNGRUPPE_NAMES)}. Leave it out to get the counts BY career group.`,
    ),
  taetigkeitsbereich: z.enum(["militaerisch", "zivil", "beide"]).optional().describe("military, civilian, or both. Omit for both."),
  vertragsarten: z
    .array(z.enum(VERTRAGSART_VALUES))
    .optional()
    .describe(`Restrict to these contract types. Allowed: ${erlaubteWerte(VERTRAGSART_VALUES)}. ${VERTRAGSART_RESERVE_HINWEIS}`),
  beschaeftigungsumfang: z.enum(["vollzeit", "teilzeit", "beide"]).optional().describe("full-time, part-time, or both. Omit for both."),
  bundesland: z
    .array(z.enum(BUNDESLAND_NAMES))
    .optional()
    .describe(
      `Restrict the overview to these federal states, e.g. ["Brandenburg"]. Allowed: ${erlaubteWerte(BUNDESLAND_NAMES)}. USE THIS when the applicant names a region rather than a town — "in Brandenburg", "im Norden", "in der Eifel". Unlike \`wunschort\` it may be combined with \`suchbegriff\`.`,
    ),
  wunschort: z
    .string()
    .optional()
    .describe(
      "Single city name, e.g. 'Köln'. Only ONE word is allowed here — see `suchbegriff`. Cannot be combined with `suchbegriff`.",
    ),
  einstiegswege: z
    .array(z.enum(EINSTIEGSWEG_WERTE))
    .optional()
    .describe(
      `Restrict the overview to these entry routes: "reserveoffizier", "seiteneinstieg", "wiedereinstellung". Taken from the posting's reference code, so reliable. Leave it out to get the counts BY entry route — every answer carries them, because this is the dimension career changers ask about and it is small enough to be missed. ${EINSTIEGSWEG_RESERVE_HINWEIS}`,
    ),
  seiteneinstieg: z
    .boolean()
    .optional()
    .describe(
      "If true, restrict to postings whose TEXT mentions a lateral entry (including where it stays unclear). Weak signal — prefer `einstiegswege`.",
    ),
};

const zaehleTrefferInput = z.object(zaehleTrefferInputSchema);
export type ZaehleTrefferInput = z.infer<typeof zaehleTrefferInput>;

export interface FacetAusgabe {
  /** Sprechender Name, nicht der interne Code. */
  wert: string;
  anzahl: number;
  /**
   * Ein Satz Klartext - nur bei Laufbahngruppen gesetzt, weil nur die ohne
   * Erklaerung unverstaendlich sind. Damit muss die anfragende KI die Begriffe
   * nicht aus ihrem Trainingswissen erklaeren (s. filterOptions.ts).
   */
  bedeutung?: string;
}

export interface ZaehleTrefferResult {
  gesamt: number;
  /** Fehlt eine Dimension, konnte sie nicht gezaehlt werden - s. `hinweis`. */
  facetten: Partial<
    Record<
      "organisationsbereich" | "laufbahngruppe" | "taetigkeitsbereich" | "vertragsart" | "einstiegsweg",
      FacetAusgabe[]
    >
  >;
  hinweis?: GeteilterHinweis;
  /** Nur bei Treffern: der Weg zur E-Mail-Benachrichtigung (s. lib/neueStellenPerMail.ts). */
  neueStellenPerMail?: GeteilterHinweis;
}

/** Nur ein einzelnes Token ist zaehlbar - mehrere braeuchten einen Nachfilter. */
function einzelToken(eingabe: string | undefined): { token: string | null; mehrteilig: boolean } {
  if (!eingabe) return { token: null, mehrteilig: false };
  const { queryToken, restTokens } = planSuche(eingabe);
  return { token: queryToken, mehrteilig: restTokens.length > 0 };
}

const NAME_BY_ORGANISATIONSBEREICH = new Map(ORGANISATIONSBEREICH_NAMES.map((name) => [toOrganisationsbereichCodes([name])[0], name]));
const NAME_BY_LAUFBAHNGRUPPE = new Map(LAUFBAHNGRUPPE_NAMES.map((name) => [toLaufbahngruppeCodes([name])[0], name]));

function benenne(
  zaehlungen: FacetZaehlung[] | null | undefined,
  namen: Map<string, string> | null,
  mitBedeutung = false,
): FacetAusgabe[] | undefined {
  if (!zaehlungen) return undefined;
  return zaehlungen.map((z) => {
    const wert = namen?.get(z.code) ?? z.code;
    const bedeutung = mitBedeutung ? laufbahngruppeBedeutung(wert) : "";
    return { wert, anzahl: z.anzahl, ...(bedeutung ? { bedeutung } : {}) };
  });
}

/** Alles ausser dem Suchbegriff selbst - s. hinweisFuerLeereSuche. */
function eingrenzendeFilter(input: ZaehleTrefferInput): boolean {
  const { suchbegriff: _s, ...eingrenzend } = input;
  return Object.values(eingrenzend).some((wert) => (Array.isArray(wert) ? wert.length > 0 : wert !== undefined));
}

export async function zaehleTreffer(input: ZaehleTrefferInput): Promise<ZaehleTrefferResult> {
  const such = einzelToken(input.suchbegriff);
  const ort = input.wunschort ? planOrt(input.wunschort) : null;
  const ortMehrteilig = (ort?.restTokens.length ?? 0) > 0;

  if (such.mehrteilig || ortMehrteilig) {
    throw new HinweisFehler(
      "Fuer den Ueberblick ist nur EIN Wort je Feld moeglich, damit die Zahlen stimmen. Bitte den Suchbegriff bzw. den Ort auf ein Wort kuerzen - oder direkt list_jobs verwenden, das mehrere Woerter beherrscht.",
    );
  }
  if (input.suchbegriff && input.wunschort) {
    throw new HinweisFehler(
      "Suchbegriff und Ort lassen sich hier nicht gleichzeitig zaehlen. Bitte eines von beiden waehlen - oder direkt list_jobs verwenden, das beides zusammen kann.",
    );
  }

  // Dimensionen, die der Filter schon festlegt, werden nicht gezaehlt: das Ergebnis
  // waere der gefilterte Wert plus lauter Nullen.
  const dimensionen: Partial<Record<FacetDimension, (string | number)[]>> = {};
  if (!input.organisationsbereich?.length) {
    dimensionen.organisationsbereich = ORGANISATIONSBEREICH_OPTIONS.map((o) => o.value);
  }
  // Laufbahngruppen werden AUCH gezaehlt, wenn der Filter sie schon festlegt -
  // dann eben nur die gewaehlten. Grund ist nicht die Zahl, sondern `bedeutung`:
  // liesse man die Dimension hier weg, faellt die Erklaerung genau in dem Fall
  // aus, in dem die KI ueber diese Laufbahngruppe schreibt - und sie erfindet
  // eine Erklaerung, etwa zu "Andere" (s. filterOptions.ts).
  dimensionen.laufbahngruppe = input.laufbahngruppe?.length
    ? toLaufbahngruppeCodes(input.laufbahngruppe)
    : LAUFBAHNGRUPPE_OPTIONS.map((o) => o.value);
  if (!input.vertragsarten?.length) {
    dimensionen.contractTypeLabel = VERTRAGSART_VALUES;
  }
  if (!input.taetigkeitsbereich || input.taetigkeitsbereich === "beide") {
    dimensionen.reqIndustry = [1, 2];
  }
  // Immer mitzaehlen: das ist die Dimension, nach der Berufserfahrene fragen
  // ("kann ich seitlich einsteigen, als Reservist dienen?"), und sie ist so
  // klein, dass sie ohne Zaehlung leicht untergeht.
  // Anders als bei den uebrigen Dimensionen wird auch im gefilterten Fall
  // gezaehlt, dann nur die gewaehlten Wege - gleiche Begruendung wie bei den
  // Laufbahngruppen: die Bedeutung soll dort stehen, wo darueber geschrieben wird.
  dimensionen.einstiegsweg = input.einstiegswege?.length
    ? [...input.einstiegswege]
    : [...EINSTIEGSWEG_WERTE];

  const { gesamt, zaehlungen } = await countFacets({
    filter: {
      taetigkeitsbereich: input.taetigkeitsbereich,
      organisationsbereich: toOrganisationsbereichCodes(input.organisationsbereich),
      laufbahngruppe: toLaufbahngruppeCodes(input.laufbahngruppe),
      vertragsarten: input.vertragsarten,
      beschaeftigungsumfang: input.beschaeftigungsumfang,
      bundesland: toBundeslandCodes(input.bundesland),
      wunschort: input.wunschort,
      suchbegriff: input.suchbegriff,
      seiteneinstieg: input.seiteneinstieg,
      einstiegswege: input.einstiegswege,
    },
    dimensionen,
  });

  const facetten: ZaehleTrefferResult["facetten"] = {};
  const organisationsbereich = benenne(zaehlungen.organisationsbereich, NAME_BY_ORGANISATIONSBEREICH);
  if (organisationsbereich) facetten.organisationsbereich = organisationsbereich;
  const laufbahngruppe = benenne(zaehlungen.laufbahngruppe, NAME_BY_LAUFBAHNGRUPPE, true);
  if (laufbahngruppe) facetten.laufbahngruppe = laufbahngruppe;
  const vertragsart = benenne(zaehlungen.contractTypeLabel, null);
  if (vertragsart) facetten.vertragsart = vertragsart;
  const taetigkeit = benenne(zaehlungen.reqIndustry, new Map([["1", "militaerisch"], ["2", "zivil"]]));
  if (taetigkeit) facetten.taetigkeitsbereich = taetigkeit;
  const einstiegsweg = zaehlungen.einstiegsweg?.map((z) => ({
    wert: z.code,
    anzahl: z.anzahl,
    bedeutung: einstiegswegBedeutung(z.code),
  }));
  if (einstiegsweg) facetten.einstiegsweg = einstiegsweg;

  const fehlend = Object.entries(zaehlungen)
    .filter(([, wert]) => wert === null)
    .map(([feld]) => feld);

  // Beide Hinweise koennen zugleich zutreffen - dann muessen sie zusammen
  // ankommen, sonst faellt genau der weg, der aus der Sackgasse fuehrt.
  const hinweis = fasseHinweiseZusammen([
    gesamt === 0 ? hinweisFuerLeereSuche(input.suchbegriff, eingrenzendeFilter(input)) : null,
    fehlend.length > 0
      ? geteilterHinweis(
          `Fuer ${fehlend.join(", ")} konnten keine Zahlen ermittelt werden. Die uebrigen Zahlen stimmen; fuer die fehlende Aufteilung bitte list_jobs mit dem entsprechenden Filter verwenden.`,
        )
      : null,
  ]);

  return {
    gesamt,
    facetten,
    ...(hinweis ? { hinweis } : {}),
    ...(gesamt > 0 ? { neueStellenPerMail: NEUE_STELLEN_PER_MAIL } : {}),
  };
}
