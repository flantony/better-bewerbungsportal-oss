/**
 * Die Form von `jobsV2` - an EINER Stelle, weil zwei Schreiber sie brauchen.
 *
 * WOZU: Der naechtliche Sync schreibt in beide Collections (`jobs` und
 * `jobsV2`), und ein Einmal-Skript baut denselben Datensatz aus `jobs`. Zwei
 * Kopien derselben Zuordnung wuerden auseinanderlaufen, und
 * zwar unbemerkt: Ein Feld, das der Sync anders ablegt als die Migration, faellt
 * erst auf, wenn jemand die Bestaende vergleicht.
 *
 * DAS SCHEMA trennt Herkunft:
 *   `api.*` - ausschliesslich Werte der Bundeswehr-API, unter deren eigenen
 *             Feldnamen. Ein Netzwerkmitschnitt laesst sich damit ohne
 *             Uebersetzung danebenlegen.
 *   Rest    - unsere Ableitungen in Domaenensprache.
 */

export const JOBS_V2_COLLECTION = "jobsV2";
export const JOBS_V2_SCHEMA_VERSION = "jobs-v2";

/**
 * API-Feldname -> Feld im `jobs`-Schema. `null` heisst: die API liefert es,
 * `jobs` fuehrt es nicht.
 */
export const API_AUS_ALT: Record<string, string | null> = {
  PinstGuid: "pinstGuid",
  RefCode: "refCode",
  Title: "title",
  BesOrt: "besOrt",
  ApplicationEnd: "applicationEnd",
  Arbeitszeit: "arbeitszeit",
  ContractType: "contractType",
  ReqType: "reqType",
  ReqIndustry: "reqIndustry",
  HotJob: "hotJob",
  Latitude: "latitude",
  Longitude: "longitude",
  StartDate: "startDate",
  EndDate: "endDate",
  Region: "region",
  Country: "country",
  Tarifgruppe1: "tarifgruppe1",
  Tarifgruppe2: "tarifgruppe2",
  // ACHTUNG, kein Wortlaut der API: diese beiden Werte gibt die API beim Lesen
  // nie heraus. Wir kennen sie nur, weil `deriveJobFacets` sie per
  // Filter-Inversion ermittelt und unter Domaenennamen ablegt.
  HierarchyLevel: "laufbahngruppe",
  FunctionalArea: "organisationsbereich",
  PostingTxt: null,
};

/**
 * Filterbar (gegen das Portal belegt), aber nie abgefragt.
 * Ausdruecklich als "" angelegt: "noch nicht gefegt" ist ein sichtbarer
 * Zustand und darf nicht mit "gibt es nicht" verwechselt werden.
 */
export const NOCH_NICHT_GEFEGT = [
  "BesGruppe",
  "BesTabelle",
  "ArtResStelle",
  "InterestGroup",
  "Ausbi",
  "Laufbahn",
  "EmployeeFract",
  "Industry",
] as const;

/** Unsere Ableitungen und die Verwaltungsfelder - unveraendert uebernommen. */
export const UEBERNEHMEN = [
  "contractTypeLabel",
  "organisationsbereich",
  "laufbahngruppe",
  "einstiegsweg",
  "besoldung",
  "vollzeit",
  "suchTokens",
  "ortTokens",
  "applicationEndSortKey",
  "jobAttributes",
  "dokumente",
  "active",
  "firstSeenAt",
  "lastSeenAt",
  "lastDetailFetchAt",
  "removedAt",
] as const;

/** Umkehrung von `API_AUS_ALT` - fuer Teilaktualisierungen des Syncs. */
const ALT_ZU_API = new Map(
  Object.entries(API_AUS_ALT)
    .filter(([, alt]) => alt !== null)
    .map(([api, alt]) => [alt as string, api]),
);

function leer(wert: unknown): boolean {
  return wert === undefined || wert === null || wert === "" || (Array.isArray(wert) && wert.length === 0);
}

/** Leerwert im richtigen Typ - sonst wird aus einem `false` ein "". */
function standard(apiFeld: string): unknown {
  if (apiFeld === "HotJob") return false;
  if (apiFeld === "ReqIndustry") return 0;
  return "";
}

/**
 * Baut den vollstaendigen v2-Datensatz aus einem Datensatz im `jobs`-Schema.
 *
 * `vorhanden` ist der bereits gespeicherte v2-Stand. Er gewinnt ueberall dort,
 * wo die Quelle nichts beitraegt - sonst wuerde ein spaeterer Lauf einen per
 * Sweep ermittelten Wert (z.B. `api.BesGruppe`) oder ein nachgezogenes
 * `jobAttributes` mit Leere ueberschreiben.
 */
export function baueV2(
  alt: Record<string, unknown>,
  vorhanden?: Record<string, unknown>,
): Record<string, unknown> {
  const vorhandenApi = (vorhanden?.api ?? {}) as Record<string, unknown>;
  const api: Record<string, unknown> = {};

  for (const [apiFeld, altFeld] of Object.entries(API_AUS_ALT)) {
    const ausAlt = altFeld ? alt[altFeld] : undefined;
    api[apiFeld] = leer(ausAlt) ? (vorhandenApi[apiFeld] ?? standard(apiFeld)) : ausAlt;
  }
  for (const feld of NOCH_NICHT_GEFEGT) {
    api[feld] = leer(vorhandenApi[feld]) ? "" : vorhandenApi[feld];
  }

  const neu: Record<string, unknown> = { api, schemaVersion: JOBS_V2_SCHEMA_VERSION };
  for (const feld of UEBERNEHMEN) {
    const wert = alt[feld] !== undefined ? alt[feld] : vorhanden?.[feld];
    if (wert !== undefined) neu[feld] = wert;
  }
  return neu;
}

/**
 * Uebersetzt eine TEILaktualisierung im `jobs`-Schema in eine fuer `jobsV2`.
 *
 * Der Sync aktualisiert bekannte Stellen mit einer Handvoll Felder
 * (`lastSeenAt`, `region`, `einstiegsweg` ...). Diese Funktion bildet sie auf
 * die richtige Ebene ab: was die API liefert, landet unter `api`, unsere
 * Ableitungen bleiben oben.
 *
 * VERSCHACHTELT, NICHT IN PUNKTNOTATION - und das ist kein Geschmacksfrage:
 * `set(..., {merge:true})` deutet einen Schluessel "api.Region" NICHT als
 * Feldpfad, sondern legt woertlich ein Feld dieses Namens auf oberster Ebene an.
 * Nur `update()` versteht Punktnotation; der Fehler faellt erst beim Abgleich
 * auf. Ein verschachteltes
 * Objekt ist hier richtig, weil `merge` Maps tief zusammenfuehrt und die
 * uebrigen Schluessel in `api` unangetastet laesst.
 */
export function v2Teilaktualisierung(altUpdate: Record<string, unknown>): Record<string, unknown> {
  const neu: Record<string, unknown> = {};
  const api: Record<string, unknown> = {};
  for (const [feld, wert] of Object.entries(altUpdate)) {
    const apiFeld = ALT_ZU_API.get(feld);
    if (apiFeld) api[apiFeld] = wert;
    // `laufbahngruppe`/`organisationsbereich` stehen in BEIDEN Ebenen: als
    // api.HierarchyLevel/api.FunctionalArea und als Ableitung oben. Deshalb
    // kein `else` - das Feld wird bewusst zweimal geschrieben.
    if ((UEBERNEHMEN as readonly string[]).includes(feld)) neu[feld] = wert;
  }
  if (Object.keys(api).length > 0) neu.api = api;
  return neu;
}

/**
 * Rueckweg: ein jobsV2-Dokument in die Form von `jobs`.
 *
 * WOZU EIN RUECKWEG: Die Leser - Query-Schicht, MCP-Ausgabe, Webapp - brauchen
 * Domaenenfelder, nicht `api.BesOrt`. Wuerde jeder von ihnen die v2-Form selbst
 * auspacken, waere die Zuordnung an vier Stellen dupliziert. So bleibt sie an
 * einer Stelle, und jeder Leser kann einzeln auf `api.*` wechseln.
 */
export function altAusV2(v2: Record<string, unknown>): Record<string, unknown> {
  const api = (v2.api ?? {}) as Record<string, unknown>;
  const alt: Record<string, unknown> = {};
  for (const [apiFeld, altFeld] of Object.entries(API_AUS_ALT)) {
    if (altFeld && api[apiFeld] !== undefined) alt[altFeld] = api[apiFeld];
  }
  for (const feld of UEBERNEHMEN) {
    if (v2[feld] !== undefined) alt[feld] = v2[feld];
  }
  return alt;
}
