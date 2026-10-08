// Codes und Labels der Such-Facetten (Vertragsart, Organisationsbereich,
// Laufbahngruppe). Die Weboberflaeche fuehrt eine eigene Kopie
// (web/src/features/jobs/lib/vertragsart-optionen.ts) - kein Shared-Package
// zwischen web/ und functions/, daher dupliziert.

export type Taetigkeitsbereich = "militaerisch" | "zivil" | "beide";

/** Gleiche Logik wie web/.../onboarding-options.ts filterByTaetigkeitsbereich. */
export function filterByTaetigkeitsbereich<T extends { category?: "militaerisch" | "zivil" }>(
  options: T[],
  taetigkeitsbereich: Taetigkeitsbereich,
): T[] {
  if (taetigkeitsbereich === "beide") return options;
  return options.filter((opt) => !opt.category || opt.category === taetigkeitsbereich);
}

export const VERTRAGSART_OPTIONS = [
  { value: "unbefristet", label: "Unbefristet" },
  { value: "befristet", label: "Befristet" },
  { value: "Ausbildungsvertrag", label: "Ausbildungsvertrag" },
  { value: "Einstellung Beamtenverhältnis", label: "Einstellung Beamtenverhältnis", category: "zivil" as const },
  { value: "Ausbildung Beamtenverhältnis", label: "Ausbildung Beamtenverhältnis", category: "zivil" as const },
  { value: "Soldatin / Soldat auf Zeit", label: "Soldatin / Soldat auf Zeit", category: "militaerisch" as const },
  { value: "Reservedienst", label: "Reservedienst", category: "militaerisch" as const },
  { value: "Stipendium", label: "Stipendium" },
];

/**
 * Werte, die 1:1 mit einer "Art der Stelle"-Gruppe auf der Stellenliste
 * übereinstimmen (s. web/.../job-filters.ts ART_DER_STELLE_GROUPS) und daher
 * NICHT als eigene Vertragsart angeboten werden (s.
 * web/.../vertragsart-optionen.ts VERTRAGSART_VALUES_COVERED_ELSEWHERE).
 */
export const VERTRAGSART_VALUES_COVERED_ELSEWHERE = new Set(["Ausbildungsvertrag", "Reservedienst", "Stipendium"]);

export const SELECTABLE_VERTRAGSART_OPTIONS = VERTRAGSART_OPTIONS.filter(
  (opt) => !VERTRAGSART_VALUES_COVERED_ELSEWHERE.has(opt.value),
);

export const ORGANISATIONSBEREICH_OPTIONS = [
  { value: "0001", label: "Bundesministerium der Verteidigung" },
  { value: "0002", label: "Heer" },
  { value: "0003", label: "Luftwaffe" },
  { value: "0004", label: "Marine" },
  { value: "0005", label: "Zentraler Sanitätsdienst der Bundeswehr" },
  { value: "0006", label: "Streitkräftebasis" },
  { value: "0007", label: "Bundeswehrverwaltung" },
  { value: "0008", label: "Ausrüstung, Informationstechnik und Nutzung" },
  { value: "0009", label: "Personal" },
  { value: "0010", label: "Infrastruktur, Umweltschutz und Dienstleistungen" },
  { value: "0011", label: "Militärseelsorge" },
  { value: "0012", label: "Rechtspflege" },
  { value: "0013", label: "Rüstung" },
  { value: "0014", label: "Dienststelle ohne Organisationsbereich" },
  { value: "0015", label: "Cyber- und Informationsraum" },
  { value: "0016", label: "Unterstützungsbereich" },
  { value: "0099", label: "ohne" },
];

export const LAUFBAHNGRUPPE_OPTIONS = [
  { value: "0001", label: "Einfacher Dienst", category: "zivil" as const },
  { value: "0002", label: "Mittlerer Dienst", category: "zivil" as const },
  { value: "0003", label: "Gehobener Dienst", category: "zivil" as const },
  { value: "0004", label: "Höherer Dienst", category: "zivil" as const },
  { value: "0005", label: "Mannschaften (m/w/d)", category: "militaerisch" as const },
  { value: "0007", label: "Unteroffizierin / Unteroffizier (m/w/d)", category: "militaerisch" as const },
  { value: "0008", label: "Feldwebel (m/w/d)", category: "militaerisch" as const },
  { value: "0009", label: "Offizierin / Offizier (m/w/d)", category: "militaerisch" as const },
  { value: "0010", label: "Andere" },
];
