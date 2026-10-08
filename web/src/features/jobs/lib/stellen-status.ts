// Ob man sich auf eine Stelle noch bewerben kann, und wie ihr Umfang heisst.
// Die Detailseite rendert auf dem Server (UTC) - "heute" muss trotzdem der
// deutsche Kalendertag sein, sonst springt eine Frist um Mitternacht UTC.

const DEUTSCHES_DATUM = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** "30.09.2026" -> "2026-09-30"; alles andere (leer, "laufend") -> null. */
function alsIsoTag(datum: string | undefined): string | null {
  if (typeof datum !== 'string') return null;
  const treffer = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(datum.trim());
  return treffer ? `${treffer[3]}-${treffer[2]}-${treffer[1]}` : null;
}

/**
 * Ist der Bewerbungsschluss (API-Format `DD.MM.YYYY`) vorbei? Der Stichtag
 * selbst zaehlt als offen, wie in `isExpired` (job-filters.ts). Fehlende oder
 * unlesbare Fristen gelten als offen - "jederzeit" ist dort der Normalfall.
 * `isExpired` in der Liste rechnet mit dem SortKey (Mitternacht in Serverzeit)
 * und blendet eine Stelle deshalb bis zu zwei Stunden frueher aus; fuer die
 * Detailseite zaehlt der deutsche Kalendertag.
 */
export function fristAbgelaufen(applicationEnd: string | undefined, jetzt: Date = new Date()): boolean {
  const stichtag = alsIsoTag(applicationEnd);
  if (!stichtag) return false;
  return DEUTSCHES_DATUM.format(jetzt) > stichtag;
}

/**
 * Bewerben-Knoepfe nur, wenn das noch geht. `active === false` heisst
 * archiviert (Frist vorbei oder zurueckgezogen, s. JobDetail.active); die
 * eigene Datumspruefung faengt die Stunden bis zum naechsten Sync ab.
 */
export function bewerbungMoeglich(
  job: { active: boolean; applicationEnd: string },
  jetzt: Date = new Date()
): boolean {
  return job.active && !fristAbgelaufen(job.applicationEnd, jetzt);
}

const PROZENT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/**
 * `arbeitszeit` ist ein Prozent-String ("100.00"). Ab 100 % Vollzeit - gleiche
 * Schwelle wie `getBeschaeftigungsumfang` (job-filters.ts) und
 * functions/src/sync.ts `istVollzeit`, damit Filter und Anzeige dasselbe sagen.
 */
export function beschaeftigungsumfangLabel(arbeitszeit: string): string | null {
  const wert = Number.parseFloat(arbeitszeit);
  if (!Number.isFinite(wert) || wert <= 0) return null;
  return wert >= 100 ? 'Vollzeit' : `Teilzeit (${PROZENT.format(wert)} %)`;
}
