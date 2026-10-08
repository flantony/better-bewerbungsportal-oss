// Was die Merkliste zeigt: nur
// Stellen, auf die man sich noch bewerben kann. Geschlossene blendet die Seite
// sofort aus; der naechtliche Lauf (functions/src/konto/merklisteAufraeumen.ts)
// nimmt sie danach auch aus dem Konto, sobald der Sync sie archiviert hat.

import { bewerbungMoeglich } from '@/features/jobs/lib/stellen-status';
import type { GemerkteStelle } from '../api/types';

interface OffeneStelle {
  /** Fehlt das Feld, gilt die Stelle als nicht aktiv - wie `toJob` (features/jobs/api/service.ts). */
  active?: boolean;
  applicationEnd: string;
}

export interface MerklistenAnzeige<J extends OffeneStelle> {
  sichtbar: { eintrag: GemerkteStelle; job: J }[];
  /** Gemerkt, aber nicht mehr ausgeschrieben (oder nicht mehr im Bestand). */
  ausgeblendet: number;
  /** Deren Kennungen - zum sofortigen Entfernen, sie belegen sonst Plaetze der Liste. */
  ausgeblendeteIds: string[];
}

/**
 * Teilt die Merkliste in offene und geschlossene Stellen. Geschlossen ist,
 * was `bewerbungMoeglich` verneint (archiviert oder Frist vorbei) - und eine
 * Stelle, die es im Bestand gar nicht mehr gibt.
 */
export function teileMerkliste<J extends OffeneStelle>(
  merkliste: GemerkteStelle[],
  jobsNachId: ReadonlyMap<string, J>,
  jetzt: Date = new Date()
): MerklistenAnzeige<J> {
  const sichtbar: { eintrag: GemerkteStelle; job: J }[] = [];
  const ausgeblendeteIds: string[] = [];
  for (const eintrag of merkliste) {
    const job = jobsNachId.get(eintrag.pinstGuid);
    if (job && bewerbungMoeglich({ active: job.active === true, applicationEnd: job.applicationEnd }, jetzt)) {
      sichtbar.push({ eintrag, job });
    } else {
      ausgeblendeteIds.push(eintrag.pinstGuid);
    }
  }
  return { sichtbar, ausgeblendet: ausgeblendeteIds.length, ausgeblendeteIds };
}

const TAG_MONAT = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit'
});

/** "Gemerkt aus der Mail vom 12.10." - der deutsche Kalendertag, auch wenn der Lauf nachts um 04:00 schreibt. */
export function ausMailText(ausMail: string | undefined): string | null {
  if (!ausMail) return null;
  const datum = new Date(ausMail);
  if (Number.isNaN(datum.getTime())) return null;
  return `Gemerkt aus der Mail vom ${TAG_MONAT.format(datum)}`;
}

/** Der Hinweis auf ausgeblendete Stellen, oder `null`, wenn keine ausgeblendet ist. */
export function ausgeblendetText(anzahl: number): string | null {
  if (anzahl <= 0) return null;
  return anzahl === 1
    ? 'Eine gemerkte Stelle ist nicht mehr ausgeschrieben. Sie ist hier ausgeblendet und wird in den nächsten Tagen automatisch entfernt; bis dahin zählt sie noch zu deiner Merkliste.'
    : `${anzahl} gemerkte Stellen sind nicht mehr ausgeschrieben. Sie sind hier ausgeblendet und werden in den nächsten Tagen automatisch entfernt; bis dahin zählen sie noch zu deiner Merkliste.`;
}
