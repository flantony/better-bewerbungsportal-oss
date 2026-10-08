import { isExpired } from './job-filters';
import type { Job } from '../api/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ab so vielen Tagen vor dem Stichtag gilt eine Frist als "bald" und wird hervorgehoben. */
export const FRIST_BALD_TAGE = 14;

export type FristAnzeige =
  | { art: 'abgelaufen' }
  | { art: 'ohne' }
  | { art: 'bald' | 'offen'; datum: string; text: string };

/**
 * Wie die Stellenliste den Bewerbungsschluss zeigt. Rot ist nur für Fristen
 * gedacht, die in den nächsten zwei Wochen enden - und dann steht die
 * Dringlichkeit auch im Text ("noch 4 Tage"), damit sie nicht allein an der
 * Farbe hängt (WCAG 1.4.1).
 */
export function fristAnzeige(
  job: Pick<Job, 'applicationEnd' | 'applicationEndSortKey'>,
  now: number = Date.now()
): FristAnzeige {
  if (isExpired(job, now)) return { art: 'abgelaufen' };
  if (!job.applicationEnd) return { art: 'ohne' };

  // applicationEndSortKey ist Mitternacht zu Beginn des Stichtags; am Stichtag
  // selbst ergibt das 0, am Vortag 1.
  const tage = Math.max(0, Math.ceil((job.applicationEndSortKey - now) / DAY_MS));
  const datum = job.applicationEnd;
  if (tage > FRIST_BALD_TAGE) return { art: 'offen', datum, text: `bis ${datum}` };

  const rest = tage === 0 ? 'endet heute' : tage === 1 ? 'endet morgen' : `noch ${tage} Tage`;
  return { art: 'bald', datum, text: `bis ${datum} · ${rest}` };
}
