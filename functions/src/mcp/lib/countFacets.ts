/**
 * Trefferzahlen je Facettenwert - der Ueberblick VOR der Feinsuche.
 *
 * WOZU: Ohne Zaehlung muss ein KI-Client Filterkombinationen raten - mehrere
 * Runden `list_jobs`, jede davon bis zu 3.000 Firestore-Reads, nur um
 * herauszufinden, wo ueberhaupt etwas liegt. Eine Zaehlung beantwortet dieselbe
 * Frage in einem Schritt.
 *
 * KOSTEN: Firestore rechnet Aggregationen nach gelesenen Index-Eintraegen ab
 * (ein Read je angefangene 1.000), nicht nach Dokumenten. Ein Aufruf mit ~36
 * Zaehlungen kostet damit rund 40 Reads - gegenueber bis zu 3.000 fuer eine
 * einzige unglueckliche Suche.
 *
 * ROBUSTHEIT: Fehlt fuer eine Facette der zusammengesetzte Index, faellt NUR
 * diese Dimension aus (`null`), nicht der ganze Aufruf. Ein Ueberblick mit drei
 * von vier Dimensionen ist brauchbar; ein Fehler ist es nicht.
 */
import { buildQuery, type JobQueryFilter } from "./queryJobs";

/** Firestore-Fehlercode fuer "zu dieser Query fehlt ein Index". */
const FAILED_PRECONDITION = 9;

export interface FacetZaehlung {
  /** Code, wie er in Firestore steht - die Uebersetzung macht das Tool. */
  code: string;
  anzahl: number;
}

export type FacetDimension =
  | "organisationsbereich"
  | "laufbahngruppe"
  | "contractTypeLabel"
  | "reqIndustry"
  | "einstiegsweg";

export interface FacetErgebnis {
  gesamt: number;
  /** `null`, wenn diese Dimension mangels Index nicht gezaehlt werden konnte. */
  zaehlungen: Partial<Record<FacetDimension, FacetZaehlung[] | null>>;
}

/**
 * Wo die Dimension im Schema `jobsV2` wirklich liegt. Die Namen der Dimensionen
 * bleiben Domaenensprache - nur `reqIndustry` ist ein Rohwert der API
 * und steht deshalb unter `api.*`. Ohne diese Zuordnung zaehlt die Query auf
 * einem Feld, das es nicht gibt: das ergibt kommentarlos 0, keinen Fehler.
 */
const FELDPFAD: Record<FacetDimension, string> = {
  organisationsbereich: "organisationsbereich",
  laufbahngruppe: "laufbahngruppe",
  contractTypeLabel: "contractTypeLabel",
  reqIndustry: "api.ReqIndustry",
  einstiegsweg: "einstiegsweg",
};

async function zaehle(filter: JobQueryFilter, feld: FacetDimension, wert: string | number): Promise<number> {
  const { query } = buildQuery(filter);
  const ergebnis = await query.where(FELDPFAD[feld], "==", wert).count().get();
  return ergebnis.data().count;
}

/**
 * Zaehlt eine Dimension vollstaendig aus. Werte mit 0 bleiben drin: "hier gibt
 * es nichts" ist genau die Auskunft, die dem Client sonst fehlt und die ihn
 * sonst zu weiteren Rateversuchen verleitet.
 */
async function zaehleDimension(
  filter: JobQueryFilter,
  feld: FacetDimension,
  werte: (string | number)[],
): Promise<FacetZaehlung[] | null> {
  try {
    const zahlen = await Promise.all(werte.map((wert) => zaehle(filter, feld, wert)));
    return werte
      .map((wert, i) => ({ code: String(wert), anzahl: zahlen[i] }))
      .sort((a, b) => b.anzahl - a.anzahl);
  } catch (err) {
    if ((err as { code?: number }).code !== FAILED_PRECONDITION) throw err;
    console.warn("countFacets: kein Index fuer Dimension, wird uebersprungen", { feld });
    return null;
  }
}

export interface FacetAnfrage {
  filter: JobQueryFilter;
  /** Codes je Dimension. Dimensionen, die der Filter bereits festlegt, weglassen. */
  dimensionen: Partial<Record<FacetDimension, (string | number)[]>>;
}

export async function countFacets({ filter, dimensionen }: FacetAnfrage): Promise<FacetErgebnis> {
  const { query } = buildQuery(filter);
  const [gesamt, ...ergebnisse] = await Promise.all([
    query.count().get().then((snap) => snap.data().count),
    ...Object.entries(dimensionen).map(([feld, werte]) =>
      zaehleDimension(filter, feld as FacetDimension, werte ?? []).then(
        (zaehlung) => [feld as FacetDimension, zaehlung] as const,
      ),
    ),
  ]);

  return {
    gesamt,
    zaehlungen: Object.fromEntries(ergebnisse as (readonly [FacetDimension, FacetZaehlung[] | null])[]),
  };
}
