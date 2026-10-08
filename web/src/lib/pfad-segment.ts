const ID_MUSTER = /^[a-z0-9]{16,}$/i;

/** Direkte Eltern-Segmente, unter denen eine ID-artige `pinstGuid` steht (s. unten). */
const PINST_GUID_ELTERN = new Set(['jobs', 'bewerben']);

/** Deutsche Namen der Bereiche - dieselben wie in der Seitenleiste (config/nav-config.ts). */
const BEREICH_LABEL: Record<string, string> = {
  dashboard: 'Übersicht',
  overview: 'Übersicht',
  jobs: 'Stellenangebote',
  ki: 'Mit KI bewerben',
  konto: 'Mein Konto',
  merkliste: 'Merkliste',
  bewerben: 'Bewerben'
};

/**
 * Beschriftung fuer ein Breadcrumb-Pfadsegment. Segmente, die wie eine
 * technische ID aussehen (>=16 alphanumerische Zeichen) und direkt unter
 * `jobs` ODER `bewerben` liegen - z.B. der `pinstGuid` in
 * `/dashboard/jobs/FA163EC863931FE1AE8110DB12AB9279` oder
 * `/dashboard/bewerben/FA163EC863931FE1AE8110DB12AB9279` - zeigen
 * 'Stellenangebot' statt der rohen ID, die Bewerbern nichts sagt.
 */
export function beschrifteBreadcrumbSegment(segment: string, vorherigesSegment: string | undefined): string {
  if (vorherigesSegment && PINST_GUID_ELTERN.has(vorherigesSegment) && ID_MUSTER.test(segment)) {
    return 'Stellenangebot';
  }
  return BEREICH_LABEL[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}
