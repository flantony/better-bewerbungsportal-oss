import type { Bewerbungsplan } from '../api/types';

export interface BewerbungAuswahl {
  formulare: string[];
  unterlagen: string[];
  anschreiben: string;
  lebenslauf: string;
}

export interface BewerbungZusammenfassung {
  stelleTitel: string;
  /** Ausgewaehlte Formulare (docId + Titel), in Plan-Reihenfolge - docId als eindeutiger Listenschluessel. */
  formulare: { docId: string; name: string }[];
  /** Ausgewaehlte Ablage-Unterlagen (docId + Dateiname), in Plan-Reihenfolge. */
  unterlagen: { docId: string; name: string }[];
  anschreiben: boolean;
  lebenslauf: boolean;
  /** Wie viele Dateien das Paket haben wird - Formulare + Unterlagen + Texte. */
  dateianzahl: number;
}

/**
 * Reine Zusammenfassung fuer Schritt 5 (Paket) - kein Netzwerk-/Server-
 * Zugriff. Nimmt bewusst nur docIds/Texte entgegen (dieselbe Auswahl, die
 * auch an `baueBewerbungspaket` geht) und holt sich Titel/Dateiname selbst aus
 * dem Plan, statt sie doppelt vom Aufrufer zu verlangen. Ein reiner
 * Leerzeichen-Text zaehlt als "kein Text" (derselbe Massstab, den der Server
 * mit `.trim()` anlegen wuerde - hier nur fuer die Anzeige, nicht als
 * Ersatz fuer die Server-Pruefung).
 */
export function baueZusammenfassung(plan: Bewerbungsplan, auswahl: BewerbungAuswahl): BewerbungZusammenfassung {
  const formulare = plan.formulare
    .filter((f) => auswahl.formulare.includes(f.docId))
    .map((f) => ({ docId: f.docId, name: f.titel }));
  const unterlagen = plan.ablage
    .filter((u) => auswahl.unterlagen.includes(u.docId))
    .map((u) => ({ docId: u.docId, name: u.dateiname }));
  const anschreiben = auswahl.anschreiben.trim().length > 0;
  const lebenslauf = auswahl.lebenslauf.trim().length > 0;
  return {
    stelleTitel: plan.stelle.titel,
    formulare,
    unterlagen,
    anschreiben,
    lebenslauf,
    dateianzahl: formulare.length + unterlagen.length + (anschreiben ? 1 : 0) + (lebenslauf ? 1 : 0)
  };
}
