// Vertragsart- und Beschäftigungsumfang-Werte für die Facetten der
// Stellenliste.
//
// Gespiegelt zu functions/src/lib/onboardingOptions.ts - es gibt kein
// Shared-Package zwischen web/ und functions/, daher bewusst dupliziert.

/**
 * Werte entsprechen exakt `contractTypeLabel` (Wertehilfen_Vertragsart).
 * `slug` ist ein reines DOM-id-taugliches Kürzel - `value` enthält Leer- und
 * Schrägstriche, die in HTML-`id`/`htmlFor` unzulässig sind - und hat keine
 * fachliche Bedeutung.
 */
export const VERTRAGSART_OPTIONS = [
  { value: 'unbefristet', label: 'Unbefristet', slug: 'unbefristet' },
  { value: 'befristet', label: 'Befristet', slug: 'befristet' },
  { value: 'Ausbildungsvertrag', label: 'Ausbildungsvertrag', slug: 'ausbildungsvertrag' },
  {
    value: 'Einstellung Beamtenverhältnis',
    label: 'Einstellung Beamtenverhältnis',
    slug: 'einstellung-beamtenverhaeltnis'
  },
  {
    value: 'Ausbildung Beamtenverhältnis',
    label: 'Ausbildung Beamtenverhältnis',
    slug: 'ausbildung-beamtenverhaeltnis'
  },
  { value: 'Soldatin / Soldat auf Zeit', label: 'Soldatin / Soldat auf Zeit', slug: 'soldat-auf-zeit' },
  { value: 'Reservedienst', label: 'Reservedienst', slug: 'reservedienst' },
  { value: 'Stipendium', label: 'Stipendium', slug: 'stipendium' }
];

/**
 * Vertragsarten, die inhaltlich mit einer "Art der Stelle"-Gruppe
 * übereinstimmen (s. job-filters.ts ART_DER_STELLE_GROUPS; empirisch
 * verifiziert: Ausbildungsvertrag=K20, Reservedienst=K80, Stipendium=K25) und
 * deshalb NICHT nochmal als eigene Vertragsart-Checkbox erscheinen - sonst
 * stünde dieselbe Information zweimal unter verschiedenen Namen in der
 * Filterleiste.
 */
export const VERTRAGSART_VALUES_COVERED_ELSEWHERE = new Set([
  'Ausbildungsvertrag',
  'Reservedienst',
  'Stipendium'
]);

export const BESCHAEFTIGUNGSUMFANG_OPTIONS = [
  { value: 'vollzeit', label: 'Vollzeit' },
  { value: 'teilzeit', label: 'Teilzeit' },
  { value: 'beide', label: 'Beides' }
];
