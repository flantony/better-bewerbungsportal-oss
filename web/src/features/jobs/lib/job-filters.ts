import {
  BESCHAEFTIGUNGSUMFANG_OPTIONS,
  VERTRAGSART_OPTIONS,
  VERTRAGSART_VALUES_COVERED_ELSEWHERE
} from './vertragsart-optionen';
import type { Job } from '../api/types';
import { getTaetigkeitsbereich, TAETIGKEITSBEREICH_LABEL } from './taetigkeitsbereich';
import { kompiliereSuche } from './titel-suche';

/** Sentinel-Wert für Facetten, bei denen ein Job keinen Wert hat (z.B. `contractTypeLabel: null`). */
export const NONE_BUCKET = '__ohne_angabe__';

export type Beschaeftigungsumfang = 'vollzeit' | 'teilzeit';

/**
 * "Art der Stelle"-Gruppen aus dem `reqType`-Code (Bundeswehr-API) abgeleitet.
 * `reqType` hat keinen offiziellen Wertehilfen-Label-Endpunkt (s.
 * `$metadata`) - diese Zuordnung ist aus der Korrelation mit
 * `contractTypeLabel`/`reqIndustry`/Stellentiteln empirisch abgeleitet,
 * nicht amtlich. Mehrere Codes können auf dieselbe Gruppe fallen.
 */
export const ART_DER_STELLE_GROUPS = [
  { id: 'ausbildung', label: 'Ausbildungsplätze', reqTypes: ['K20'] },
  { id: 'zivil', label: 'Zivile Stellenangebote', reqTypes: ['K29', 'K60', 'K10'] },
  { id: 'reserve', label: 'Reservedienst', reqTypes: ['K80'] },
  { id: 'militaerisch', label: 'Militärische Laufbahnen', reqTypes: ['K50', 'K55'] },
  { id: 'wehrdienst', label: 'Freiwilliger Wehrdienst', reqTypes: ['L10'] },
  { id: 'praktikum', label: 'Praktikum / Stipendium', reqTypes: ['K25'] }
] as const;

export type ArtDerStelleGroupId = (typeof ART_DER_STELLE_GROUPS)[number]['id'];

const REQ_TYPE_TO_GROUP = new Map<string, ArtDerStelleGroupId>(
  ART_DER_STELLE_GROUPS.flatMap((group) => group.reqTypes.map((reqType) => [reqType, group.id] as const))
);

export function getArtDerStelleGroup(reqType: string): ArtDerStelleGroupId | typeof NONE_BUCKET {
  return REQ_TYPE_TO_GROUP.get(reqType) ?? NONE_BUCKET;
}

/** `arbeitszeit` ist ein Prozent-String ("100.00"); >=100% zählt als Vollzeit (gleiche Schwelle wie functions/src/matchJobs.ts). */
export function getBeschaeftigungsumfang(job: Job): Beschaeftigungsumfang {
  return parseFloat(job.arbeitszeit) >= 100 ? 'vollzeit' : 'teilzeit';
}

/**
 * Werte der Besoldungs-Facette. Untere und obere Grenze werden als eigene
 * Optionen angeboten, damit ein Nutzer, der "A9" auswählt, auch eine Stelle
 * findet, die "A7 bis A9" ausschreibt. Bei einer einzelnen Gruppe (von = bis)
 * bleibt es bei einem Wert.
 */
export function besoldungsWerte(job: Job): string[] {
  if (!job.besoldung) return [];
  const von = job.besoldung.von.trim();
  const bis = job.besoldung.bis.trim();
  return [...new Set([von, bis])].filter(Boolean);
}

/** Leere oder nur aus Leerzeichen bestehende Vertragsart zählt wie eine fehlende - sonst entsteht eine Checkbox ohne Beschriftung. */
function vertragsartWert(job: Job): string {
  return job.contractTypeLabel?.trim() || NONE_BUCKET;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `applicationEndSortKey` ist MITTERNACHT ZU BEGINN des Stichtags (s.
 * functions/src/lib/applicationEndSortKey.ts). Ein naives `sortKey < now`
 * markiert eine Ausschreibung, deren Frist heute endet, deshalb schon um 00:01
 * als abgelaufen - einen ganzen Tag zu früh, obwohl man sich noch bewerben kann.
 * Der Stichtag selbst zählt als offen; Spiegelbild von
 * functions/src/lib/abgelaufen.ts, dort mit Tests.
 *
 * Offene/nicht parsbare Fristen tragen einen Sentinel weit in der Zukunft und
 * sind damit nie abgelaufen.
 */
export function isExpired(job: Pick<Job, 'applicationEndSortKey'>, now: number = Date.now()): boolean {
  return now >= job.applicationEndSortKey + DAY_MS;
}

const EARTH_RADIUS_KM = 6371;

export interface Coordinates {
  lat: number;
  lng: number;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function parseCoordinates(job: Job): Coordinates | null {
  const lat = parseFloat(job.latitude);
  const lng = parseFloat(job.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

/**
 * Mittelpunkt für die Umkreissuche: Durchschnitt der Koordinaten aller Jobs,
 * deren `besOrt` den eingegebenen Ort enthält - keine externe Geocoding-API
 * nötig, da die Koordinaten der Ausschreibungen selbst bereits vorliegen.
 */
export function resolveOrtCenter(jobs: Job[], ortQuery: string): Coordinates | null {
  const needle = ortQuery.trim().toLowerCase();
  if (!needle) return null;

  const matches = jobs
    .filter((job) => job.besOrt?.toLowerCase().includes(needle))
    .map(parseCoordinates)
    .filter((c): c is Coordinates => c !== null);

  if (matches.length === 0) return null;

  const sum = matches.reduce((acc, c) => ({ lat: acc.lat + c.lat, lng: acc.lng + c.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / matches.length, lng: sum.lng / matches.length };
}

export interface JobFilterState {
  search: string;
  reqIndustry: Set<string>;
  artDerStelle: Set<string>;
  contractTypeLabel: Set<string>;
  beschaeftigungsumfang: Set<Beschaeftigungsumfang>;
  ort: string;
  radiusKm: number | null;
  tarifgruppe: Set<string>;
  hideExpired: boolean;
  onlyHot: boolean;
}

/** Schaltet einen Wert innerhalb einer Multi-Select-Facette um (OR-Logik innerhalb der Facette) - liefert immer einen neuen State (Immutability für React). */
export function toggleFacetValue(state: JobFilterState, facet: MultiSelectFacet, value: string): JobFilterState {
  const next = new Set(state[facet] as Set<string>);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return { ...state, [facet]: next };
}

export function createEmptyFilterState(): JobFilterState {
  return {
    search: '',
    reqIndustry: new Set(),
    artDerStelle: new Set(),
    contractTypeLabel: new Set(),
    beschaeftigungsumfang: new Set(),
    ort: '',
    radiusKm: null,
    tarifgruppe: new Set(),
    hideExpired: false,
    onlyHot: false
  };
}

/**
 * Ausgangszustand der Stellenliste: abgelaufene Fristen sind ausgeblendet -
 * wer sucht, will in aller Regel nur Stellen sehen, auf die er sich noch
 * bewerben kann. `countActiveFilters` und die Filter-Chips messen gegen
 * diesen Zustand, nicht gegen `createEmptyFilterState`.
 */
export function createDefaultFilterState(): JobFilterState {
  return { ...createEmptyFilterState(), hideExpired: true };
}

export type MultiSelectFacet =
  | 'reqIndustry'
  | 'artDerStelle'
  | 'contractTypeLabel'
  | 'beschaeftigungsumfang'
  | 'tarifgruppe';

export const MULTI_SELECT_FACETS: MultiSelectFacet[] = [
  'reqIndustry',
  'artDerStelle',
  'contractTypeLabel',
  'beschaeftigungsumfang',
  'tarifgruppe'
];

function matchesOrt(job: Job, state: JobFilterState, center: Coordinates | null): boolean {
  const needle = state.ort.trim().toLowerCase();
  if (!needle) return true;

  if (state.radiusKm !== null && center) {
    const jobCoords = parseCoordinates(job);
    if (!jobCoords) return false;
    return haversineDistanceKm(center, jobCoords) <= state.radiusKm;
  }

  return Boolean(job.besOrt?.toLowerCase().includes(needle));
}

function matchesMultiSelect(job: Job, facet: MultiSelectFacet, state: JobFilterState): boolean {
  switch (facet) {
    case 'reqIndustry': {
      const bereich = getTaetigkeitsbereich(job.reqIndustry);
      return state.reqIndustry.size === 0 || (bereich !== null && state.reqIndustry.has(bereich));
    }
    case 'artDerStelle':
      return state.artDerStelle.size === 0 || state.artDerStelle.has(getArtDerStelleGroup(job.reqType));
    case 'contractTypeLabel':
      return state.contractTypeLabel.size === 0 || state.contractTypeLabel.has(vertragsartWert(job));
    case 'beschaeftigungsumfang':
      return state.beschaeftigungsumfang.size === 0 || state.beschaeftigungsumfang.has(getBeschaeftigungsumfang(job));
    case 'tarifgruppe': {
      if (state.tarifgruppe.size === 0) return true;
      const values = besoldungsWerte(job);
      if (values.length === 0) return state.tarifgruppe.has(NONE_BUCKET);
      return values.some((v) => state.tarifgruppe.has(v));
    }
  }
}

/**
 * Wendet alle Filter aus `state` an, außer der in `exceptFacet` genannten
 * Facette (dient dazu, für genau diese Facette die Optionen/Zählungen auf
 * Basis aller ANDEREN aktiven Auswahlen zu berechnen - Standard-Faceting-
 * Technik, s. computeFacetCounts).
 */
function applyAllExcept(jobs: Job[], state: JobFilterState, exceptFacet: MultiSelectFacet | null): Job[] {
  const center = state.radiusKm !== null ? resolveOrtCenter(jobs, state.ort) : null;
  // Wortanfang statt Teilstring - "Sport" trifft nicht "Transport", s. titel-suche.ts.
  const matchesSearch = kompiliereSuche(state.search);

  return jobs.filter((job) => {
    if (!matchesSearch(job.title, job.besOrt)) return false;
    if (!matchesOrt(job, state, center)) return false;
    if (state.hideExpired && isExpired(job)) return false;
    if (state.onlyHot && !job.hotJob) return false;

    return MULTI_SELECT_FACETS.every((facet) => facet === exceptFacet || matchesMultiSelect(job, facet, state));
  });
}

export function applyFilters(jobs: Job[], state: JobFilterState): Job[] {
  return applyAllExcept(jobs, state, null);
}

function getFacetValues(job: Job, facet: MultiSelectFacet): string[] {
  switch (facet) {
    case 'reqIndustry': {
      const bereich = getTaetigkeitsbereich(job.reqIndustry);
      return bereich ? [bereich] : [];
    }
    case 'artDerStelle':
      return [getArtDerStelleGroup(job.reqType)];
    case 'contractTypeLabel':
      return [vertragsartWert(job)];
    case 'beschaeftigungsumfang':
      return [getBeschaeftigungsumfang(job)];
    case 'tarifgruppe': {
      const values = besoldungsWerte(job);
      return values.length > 0 ? values : [NONE_BUCKET];
    }
  }
}

/**
 * Zählt, wie viele Ergebnisse jede Option einer Facette hätte, wenn sie
 * gewählt würde - berechnet aus den Jobs, die bereits alle ANDEREN aktiven
 * Filter erfüllen (nicht diese Facette selbst). Das ist der Kern der
 * gegenseitigen Live-Filterung: jede Auswahl wirkt sofort auf die Zählungen
 * jeder anderen Facette.
 */
export function computeFacetCounts(
  jobs: Job[],
  state: JobFilterState,
  facet: MultiSelectFacet
): Map<string, number> {
  const scoped = applyAllExcept(jobs, state, facet);
  const counts = new Map<string, number>();
  for (const job of scoped) {
    for (const value of getFacetValues(job, facet)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/** Anzahl Jobs mit abgelaufener Bewerbungsfrist unter den aktuell (ohne den Ausblenden-Toggle) gefilterten Ergebnissen. */
export function countExpired(jobs: Job[]): number {
  return jobs.filter((job) => isExpired(job)).length;
}

/**
 * Anzahl aktiver Filter (für die "Filter (n)"-Anzeige auf Mobile) - eine
 * Auswahl pro Facettenwert, Suchtext, Ort und Toggle. Gezählt wird die
 * Abweichung von `createDefaultFilterState`: das voreingestellte Ausblenden
 * abgelaufener Fristen zählt nicht, das Wiedereinblenden schon.
 */
export function countActiveFilters(state: JobFilterState): number {
  let count = 0;
  if (state.search.trim()) count++;
  if (state.ort.trim()) count++;
  for (const facet of MULTI_SELECT_FACETS) count += state[facet].size;
  if (!state.hideExpired) count++;
  if (state.onlyHot) count++;
  return count;
}

/**
 * Alle Werte, die eine Facette im GESAMTEN (ungefilterten) Bestand annimmt,
 * sortiert nach Häufigkeit absteigend. Bewusst aus dem vollen Bestand
 * berechnet (nicht dem aktuell gefilterten) und über die Sitzung stabil, damit
 * Optionen bei einer Auswahl nicht aus der Liste verschwinden, sondern nur
 * ihre Zählung auf 0 fällt (grau/deaktiviert) - vermeidet ein Springen der
 * Filterliste.
 */
export function getAllFacetOptionValues(jobs: Job[], facet: MultiSelectFacet): string[] {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    for (const value of getFacetValues(job, facet)) {
      if (facet === 'contractTypeLabel' && VERTRAGSART_VALUES_COVERED_ELSEWHERE.has(value)) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()].toSorted((a, b) => b[1] - a[1]).map(([value]) => value);
}

const CONTRACT_TYPE_LABEL_BY_VALUE = new Map(VERTRAGSART_OPTIONS.map((opt) => [opt.value, opt.label]));
const BESCHAEFTIGUNGSUMFANG_LABEL_BY_VALUE = new Map(
  BESCHAEFTIGUNGSUMFANG_OPTIONS.filter((opt) => opt.value !== 'beide').map((opt) => [opt.value, opt.label])
);
const ART_DER_STELLE_LABEL_BY_ID = new Map<string, string>(
  ART_DER_STELLE_GROUPS.map((group) => [group.id, group.label])
);

const NONE_BUCKET_LABEL = 'Ohne Angabe';

/** Menschenlesbares Label für einen Facettenwert - `NONE_BUCKET` wird einheitlich als "Ohne Angabe" angezeigt. */
export function getFacetOptionLabel(facet: MultiSelectFacet, value: string): string {
  if (value === NONE_BUCKET) return NONE_BUCKET_LABEL;

  switch (facet) {
    case 'reqIndustry':
      return TAETIGKEITSBEREICH_LABEL[value as keyof typeof TAETIGKEITSBEREICH_LABEL] ?? value;
    case 'artDerStelle':
      return ART_DER_STELLE_LABEL_BY_ID.get(value) ?? value;
    case 'contractTypeLabel':
      return CONTRACT_TYPE_LABEL_BY_VALUE.get(value) ?? value;
    case 'beschaeftigungsumfang':
      return BESCHAEFTIGUNGSUMFANG_LABEL_BY_VALUE.get(value) ?? value;
    case 'tarifgruppe':
      return value;
  }
}
