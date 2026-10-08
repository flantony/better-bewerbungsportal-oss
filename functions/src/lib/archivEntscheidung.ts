/**
 * Wann darf der Sync eine Stelle archivieren, die im Listing fehlt?
 *
 * WARUM NICHT EINFACH "FEHLT IM LISTING -> WEG": Das Listing der
 * Bundeswehr-API liefert hoechstens 1000 Stellen, `$skip=1000` ist leer -
 * auch nach Kategorien aufgeteilt. Eine Stelle kann also im Listing fehlen und
 * per Detailabruf weiter da sein. Archivieren nimmt eine Stelle aus jeder
 * Suche; passiert das einer offenen Stelle, merkt es niemand.
 *
 * Deshalb: Eine im Listing fehlende Stelle wird nur archiviert, wenn ihr
 * Detailabruf bestaetigt, dass sie zurueckgezogen ist. Abgelaufene Stellen
 * (Frist vorbei) werden ohne Abruf archiviert.
 */
import type { BatchResult } from "../types";

export type Veroeffentlichung = "veroeffentlicht" | "zurueckgezogen" | "unklar";

/**
 * Wortlaut der API fuer eine zurueckgezogene Ausschreibung (HTTP 400, Code
 * HRRCF0002/800). Ein HTTP 400 OHNE diesen Zusatz kommt auch bei einer
 * kaputten Anfrage (z.B. einer erfundenen PinstGuid) und gilt deshalb als
 * unklar, nicht als "weg".
 */
const ZURUECKGEZOGEN_WORTLAUT = "nicht mehr veröffentlicht";

export function klassifiziereDetailAntwort(antwort: BatchResult | undefined, pinstGuid: string): Veroeffentlichung {
  if (!antwort) return "unklar";
  if (antwort.status === 404) return "zurueckgezogen";
  if (antwort.status === 400 && antwort.rawText.includes(ZURUECKGEZOGEN_WORTLAUT)) return "zurueckgezogen";
  if (antwort.ok) {
    const guid = (antwort.body as { d?: { PinstGuid?: string } } | null)?.d?.PinstGuid;
    return guid === pinstGuid ? "veroeffentlicht" : "unklar";
  }
  return "unklar";
}

export interface ArchivZaehlung {
  /** Bekannte aktive Stellen, die im Listing fehlen. */
  nichtGelistet: number;
  /** Bekannte aktive Stellen mit abgelaufener Frist (gelistet oder nicht). */
  abgelaufen: number;
  /** Davon per Detailabruf geprueft (nicht gelistet und nicht abgelaufen). */
  geprueft: number;
  bestaetigtZurueckgezogen: number;
  nochVeroeffentlicht: number;
  unklar: number;
}

export interface ArchivEntscheidung {
  archivieren: string[];
  /** Fehlt im Listing, ist aber noch da - bleibt aktiv, bekommt `lastSeenAt`. */
  nochVeroeffentlicht: string[];
  /** Nicht entscheidbar - bleibt in diesem Lauf unangetastet. */
  unklar: string[];
  zaehlung: ArchivZaehlung;
}

/**
 * @param nichtGelistet bekannte aktive Stellen, die im Listing fehlen
 * @param abgelaufen bekannte aktive Stellen mit abgelaufener Frist
 * @param pruefe Detailabruf (s. `pruefeVeroeffentlichung`); wird nur fuer
 *   nicht gelistete, nicht abgelaufene Stellen aufgerufen. Wirft er, bleibt
 *   jede dieser Stellen aktiv.
 */
export async function entscheideArchivierung(
  nichtGelistet: string[],
  abgelaufen: Set<string>,
  pruefe: (pinstGuids: string[]) => Promise<Map<string, Veroeffentlichung>>,
): Promise<ArchivEntscheidung> {
  const zuPruefen = nichtGelistet.filter((guid) => !abgelaufen.has(guid));
  let befund = new Map<string, Veroeffentlichung>();
  if (zuPruefen.length > 0) {
    try {
      befund = await pruefe(zuPruefen);
    } catch {
      befund = new Map();
    }
  }

  const zurueckgezogen = zuPruefen.filter((guid) => befund.get(guid) === "zurueckgezogen");
  const nochVeroeffentlicht = zuPruefen.filter((guid) => befund.get(guid) === "veroeffentlicht");
  const unklar = zuPruefen.filter((guid) => {
    const wert = befund.get(guid);
    return wert !== "zurueckgezogen" && wert !== "veroeffentlicht";
  });

  return {
    archivieren: [...new Set([...abgelaufen, ...zurueckgezogen])],
    nochVeroeffentlicht,
    unklar,
    zaehlung: {
      nichtGelistet: nichtGelistet.length,
      abgelaufen: abgelaufen.size,
      geprueft: zuPruefen.length,
      bestaetigtZurueckgezogen: zurueckgezogen.length,
      nochVeroeffentlicht: nochVeroeffentlicht.length,
      unklar: unklar.length,
    },
  };
}
