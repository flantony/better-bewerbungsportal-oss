/**
 * Vereinheitlicht die Besoldungsangabe einer Ausschreibung zu EINER Struktur.
 *
 * Es gibt drei Quellen: das Rohfeld `tarifgruppe1`, eine aus dem Titel
 * abgeleitete Spanne und die KI-Extraktion, jede mit anderer Abdeckung und
 * Verlaesslichkeit. Die Rangfolge steht hier, damit Aufrufer sie nicht kennen
 * muessen.
 *
 * WICHTIGSTE QUELLE ist die Ausschreibung selbst: `tarifgruppe1`/`tarifgruppe2`
 * bilden eine Spanne (immer beide zusammen befuellt - z.B. "E5" -> "E7",
 * "A7" -> "A9 M", "A10" -> "A11"). Diese Angabe
 * ist amtlich und braucht keine KI. Nur wenn sie fehlt, greift die Ableitung
 * ueber den Dienstgrad (s. besoldung.ts).
 */

/** "A" = Beamte/Soldaten (BBesO), "E" = Tarifbeschaeftigte (TVoeD). */
export type Besoldungstabelle = "A" | "E";

export interface Besoldungsspanne {
  /** Anzeigeform der Untergrenze, wie in der Ausschreibung: "A7", "E9A". */
  von: string;
  /** Anzeigeform der Obergrenze. Gleich `von`, wenn die Stelle nur eine Gruppe nennt. */
  bis: string;
  tabelle: Besoldungstabelle;
  /** Numerische Stufe der Untergrenze - fuer Bereichsfilter (z.B. "mindestens A11"). */
  vonStufe: number;
  bisStufe: number;
  /**
   * `ausschreibung` = amtliche Angabe aus tarifgruppe1/2.
   * `dienstgrad` = aus einem im Text/Titel genannten Dienstgrad ueber die
   * BBesO-Tabelle abgeleitet, also eine Schaetzung.
   */
  quelle: "ausschreibung" | "dienstgrad";
}

/**
 * Zerlegt eine Tarif-/Besoldungsgruppe wie "A5 M", "E9A", "A13 H", "E5".
 * Der Buchstabenzusatz wird fuer die Anzeige behalten, aber nicht interpretiert:
 * bei A-Gruppen bezeichnet er die Laufbahn ("M" mittlerer, "H" hoeherer
 * Dienst), bei E-Gruppen eine Unterstufe (E9A/E9B). Fuer den Vergleich zaehlt
 * nur die Zahl.
 */
export function parseTarifgruppe(
  raw: string,
): { tabelle: Besoldungstabelle; stufe: number; anzeige: string } | null {
  const match = /^\s*([AE])\s*(\d{1,2})\s*([A-Z]*)\s*$/i.exec(raw ?? "");
  if (!match) return null;
  const tabelle = match[1].toUpperCase() as Besoldungstabelle;
  const stufe = Number(match[2]);
  if (!Number.isFinite(stufe) || stufe < 1 || stufe > 20) return null;
  return { tabelle, stufe, anzeige: raw.trim() };
}

/**
 * Baut die Spanne aus den beiden Rohfeldern. Gibt `null` zurueck, wenn keine
 * verwertbare Angabe da ist - dann kann der Aufrufer auf die
 * Dienstgrad-Ableitung zurueckfallen.
 *
 * Bei gemischten Tabellen (theoretisch "A7" -> "E9") gewinnt die untere Angabe
 * und die Obergrenze wird verworfen: eine Spanne ueber zwei verschiedene
 * Besoldungssysteme hat keine sinnvolle Bedeutung.
 */
export function spanneAusTarifgruppen(
  tarifgruppe1: string | undefined,
  tarifgruppe2: string | undefined,
): Besoldungsspanne | null {
  const unten = parseTarifgruppe(tarifgruppe1 ?? "");
  if (!unten) return null;
  const oben = parseTarifgruppe(tarifgruppe2 ?? "");
  const obenPasst = oben !== null && oben.tabelle === unten.tabelle && oben.stufe >= unten.stufe;

  return {
    von: unten.anzeige,
    bis: obenPasst ? oben.anzeige : unten.anzeige,
    tabelle: unten.tabelle,
    vonStufe: unten.stufe,
    bisStufe: obenPasst ? oben.stufe : unten.stufe,
    quelle: "ausschreibung",
  };
}

/** Anzeigeform, z.B. "A7-A9 M" oder "E5". */
export function spanneLabel(spanne: Besoldungsspanne): string {
  return spanne.von === spanne.bis ? spanne.von : `${spanne.von}-${spanne.bis}`;
}
