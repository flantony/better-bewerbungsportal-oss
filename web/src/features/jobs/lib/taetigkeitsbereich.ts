/** `reqIndustry` 1=militärisch/2=zivil, siehe Wertehilfen_Taetigkeitsbereich (s. functions/src/matchJobs.ts). */
export type Taetigkeitsbereich = 'militaerisch' | 'zivil';

export function getTaetigkeitsbereich(reqIndustry: number): Taetigkeitsbereich | null {
  if (reqIndustry === 1) return 'militaerisch';
  if (reqIndustry === 2) return 'zivil';
  return null;
}

export const TAETIGKEITSBEREICH_LABEL: Record<Taetigkeitsbereich, string> = {
  militaerisch: 'Militärisch',
  zivil: 'Zivil'
};
