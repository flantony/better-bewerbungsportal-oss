/**
 * Leitet Organisationsbereich und Laufbahngruppe pro Stelle her.
 *
 * HINTERGRUND: Beide Felder (`FunctionalArea`, `HierarchyLevel`) sind beim
 * Lesen der Ausschreibung IMMER leer - die API gibt sie schlicht nicht heraus.
 * Im `$filter` funktionieren sie aber. Wir fragen deshalb pro moeglichem Wert
 * einmal die Trefferliste ab (nur PinstGuids) und drehen das Ergebnis um:
 * aus "welche Stellen haben Wert X" wird "welchen Wert hat Stelle Y".
 *
 * Eigenschaften der Daten:
 *   - Laufbahngruppe: jede Stelle hat einen Wert (vollstaendige Partition)
 *   - Organisationsbereich: viele Stellen haben schlicht keinen Wert
 *   - keine Stelle hat MEHRERE Werte -> Einzelfeld genuegt, kein Array
 *   - Kosten: eine zusaetzliche Filterabfrage je moeglichem Wert und Sync-Lauf
 *
 * Damit werden aus zwei "nicht verfuegbaren" Feldern normale, gespeicherte und
 * abfragbare Felder - nutzbar fuer die Stellensuche, das Ranking und den
 * MCP-Server, ohne pro Anfrage die Bundeswehr-API zu belasten.
 */
import { logger } from "firebase-functions/v2";
import { fetchFilteredPinstGuids } from "./bundeswehrClient";
import { LAUFBAHNGRUPPE_OPTIONS, ORGANISATIONSBEREICH_OPTIONS } from "./lib/onboardingOptions";

/** Pause zwischen den Filterabfragen - gleiche Ruecksichtnahme wie beim Sync. */
const PAUSE_MS = 1_200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface JobFacets {
  /** Code aus ORGANISATIONSBEREICH_OPTIONS, "" wenn die API keinen liefert. */
  organisationsbereich: string;
  /** Code aus LAUFBAHNGRUPPE_OPTIONS, "" wenn die API keinen liefert. */
  laufbahngruppe: string;
}

export interface FacetIndex {
  organisationsbereichByGuid: Map<string, string>;
  laufbahngruppeByGuid: Map<string, string>;
}

/**
 * Reine Umkehrfunktion - getrennt testbar, ohne Netzwerk.
 * Bei (in den Daten nicht vorkommenden) Mehrfachtreffern gewinnt der erste
 * Wert; das ist deterministisch, weil die Codes in fester Reihenfolge
 * abgefragt werden.
 */
export function invertGuidLists(guidsByCode: Map<string, string[]>): Map<string, string> {
  const byGuid = new Map<string, string>();
  for (const [code, guids] of guidsByCode) {
    for (const guid of guids) {
      if (!byGuid.has(guid)) byGuid.set(guid, code);
    }
  }
  return byGuid;
}

async function collectDimension(
  label: string,
  options: { value: string; label: string }[],
  toFilter: (code: string) => [string[], string[]],
): Promise<Map<string, string>> {
  const guidsByCode = new Map<string, string[]>();

  for (const option of options) {
    const [organisationsbereich, laufbahngruppe] = toFilter(option.value);
    try {
      const guids = await fetchFilteredPinstGuids(organisationsbereich, laufbahngruppe);
      guidsByCode.set(option.value, guids);
    } catch (err) {
      // Einzelne Werte duerfen scheitern, ohne den ganzen Sync zu kippen -
      // die betroffenen Stellen behalten dann einfach ihren alten Facettenwert.
      logger.warn("deriveJobFacets: Filterabfrage fehlgeschlagen", {
        dimension: label,
        code: option.value,
        error: (err as Error).message,
      });
    }
    await sleep(PAUSE_MS);
  }

  return invertGuidLists(guidsByCode);
}

/**
 * Baut den vollstaendigen Facetten-Index. Ein Aufruf pro Sync-Lauf, nicht pro
 * Stelle.
 */
export async function buildFacetIndex(): Promise<FacetIndex> {
  const organisationsbereichByGuid = await collectDimension(
    "organisationsbereich",
    ORGANISATIONSBEREICH_OPTIONS,
    (code) => [[code], []],
  );
  const laufbahngruppeByGuid = await collectDimension(
    "laufbahngruppe",
    LAUFBAHNGRUPPE_OPTIONS,
    (code) => [[], [code]],
  );

  logger.info("deriveJobFacets: Index gebaut", {
    organisationsbereichCount: organisationsbereichByGuid.size,
    laufbahngruppeCount: laufbahngruppeByGuid.size,
  });

  return { organisationsbereichByGuid, laufbahngruppeByGuid };
}

export function facetsFor(index: FacetIndex, pinstGuid: string): JobFacets {
  return {
    organisationsbereich: index.organisationsbereichByGuid.get(pinstGuid) ?? "",
    laufbahngruppe: index.laufbahngruppeByGuid.get(pinstGuid) ?? "",
  };
}
