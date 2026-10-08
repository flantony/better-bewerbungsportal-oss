import { detectBewerbungsbogenVariant, type BewerbungsbogenVariant } from "../../fillBewerbungsbogen";
import type { JobDocument } from "../../types";

/**
 * Vorlagen-Familien, die in den echten Anhaengen vorkommen.
 *
 * Die Bundeswehr tauscht die Vordrucke aus, und die Dateinamen sagen es ("ab
 * GEWET 2027 Stand 17.07.2026"). Eine Familie kann deshalb zeitweise aus dem
 * Bestand verschwinden. Ihre Variante bleibt trotzdem stehen, solange die
 * Feldzuordnung dafuer stimmt: sie greift wieder, sobald der Bogen zurueckkommt.
 *
 * Nach jedem Austausch der Vordrucke gegen die gespeicherten PDFs pruefen, ob
 * alle zugeordneten AcroForm-Feldnamen noch existieren:
 * `get_document_requirements` verspricht mit `benoetigteAngaben` Felder, die aus
 * UNSERER Zuordnung stammen, nicht aus dem PDF.
 *
 * WICHTIG - Familie ist nicht gleich Ausfuellbarkeit: eine Familie zu *erkennen*
 * ist billig, sie *auszufuellen* braucht eine Feldzuordnung fuer genau dieses
 * PDF (s. `fillBewerbungsbogen.ts`). Fuer die drei Familien mit Feldzuordnung
 * geben wir eine `variant` zurueck; fuer die uebrigen erkennen wir die Vorlage
 * korrekt, liefern aber nur das Blankoformular - so bittet die KI den Nutzer
 * nicht um den Upload eines Formulars, das wir selbst haben.
 */
export type TemplateFamily =
  | "seiteneinstieg-rob" // ausfuellbar
  | "militaerisch" // ausfuellbar
  | "karrierebogen-mannschaften" // Feldzuordnung vorhanden
  | "wiedereinstellung" // nur Blankoformular
  | "a2"
  | "zivil"
  | "karrierebogen-zivil";

export interface BewerbungsbogenMatch {
  document: JobDocument;
  family: TemplateFamily;
  /**
   * Gesetzt, wenn fuer diese Vorlage eine Feldzuordnung existiert und
   * `fill_bewerbungsbogen` sie automatisch ausfuellen kann. `null` = nur als
   * Blankoformular verfuegbar.
   */
  variant: BewerbungsbogenVariant | null;
}

/**
 * Erkennt die Vorlagen-Familie am Klartextnamen des Anhangs.
 *
 * Reihenfolge ist bedeutsam: "Karrierebogen Zivil" muss vor der allgemeinen
 * Zivil-Regel greifen, und die spezifischen Familien vor "militärisch",
 * damit z.B. "Bewerbungsbogen Wiedereinstellung" nicht faelschlich als
 * ausfuellbare Militaerisch-Variante gilt.
 */
/**
 * "zivil" auch dann, wenn es abgekuerzt und mit Unterstrich angeklebt ist.
 *
 * WOZU: `ziv_Bewerbungsbogen_Bundeswehr_25_07` traegt das Wort Bewerbungsbogen
 * im Namen, eine Pruefung auf "zivil" erkennt ihn aber nicht - da steht
 * "ziv_". Ein nicht erkannter Bogen ist die schlimmste Sorte Fehler, die dieser
 * Server machen kann: "kein Bogen erkannt" heisst gegenueber dem Bewerber "es
 * wird keiner verlangt".
 *
 * Segmentweise geprueft, nicht als bloszer Teilstring: `includes("ziv")` wuerde
 * irgendwann in einem harmlosen Wort zuschlagen.
 */
function istZivil(normalized: string): boolean {
  return /(^|[^a-zäöüß])ziv(il)?([^a-zäöüß]|$)/.test(normalized);
}

export function detectTemplateFamily(attHeader: string): TemplateFamily | null {
  const normalized = attHeader.toLowerCase();

  // Kein Bewerbungs-/Karrierebogen -> gar nicht erst weiterpruefen. Haelt
  // Info-Anlagen wie "Anlage 1 zum Bewerbungsbogen" oder "Anlage 1 OA-
  // Führungskraft Reserve" draussen, die kein Formular sind.
  //
  // `bewerbungsformular` und `bewerbungsunterlagen` gehoeren dazu:
  // "Bewerbungsformular_ziv_25_07", "Bewerbungsunterlagen_Bundeswehr_ziv_10_23",
  // "ziv_Bewerbungsbogen_Bundeswehr_25_07" und "Bewerbungsbogen Zivil AC 07/25"
  // sind DIESELBE Datei - 269 AcroForm-Felder, identische Feldliste, vier Namen.
  // Ohne diese beiden Woerter fielen Stellen hier heraus, und der Server sagte
  // dann "es wird kein Formular verlangt".
  const istBogen = /(bewerbungsbogen|karrierebogen|bewerbungsformular|bewerbungsunterlagen)/.test(normalized);
  if (!istBogen) return null;
  if (normalized.startsWith("anlage")) return null;

  if (normalized.includes("karrierebogen") && normalized.includes("mannschaften")) {
    return "karrierebogen-mannschaften";
  }
  if (normalized.includes("karrierebogen") && istZivil(normalized)) return "karrierebogen-zivil";
  if (normalized.includes("wiedereinstellung")) return "wiedereinstellung";
  if (normalized.includes("seiteneinstieg")) return "seiteneinstieg-rob";
  if (normalized.includes("militärisch") || normalized.includes("militaerisch")) return "militaerisch";
  if (istZivil(normalized)) return "zivil";
  if (/\ba2\b/.test(normalized)) return "a2";
  return null;
}

/**
 * Alle Bewerbungsbogen-Anhaenge einer Stelle - ALLE, nicht nur der erste.
 *
 * Grund: viele Stellen mit "Bewerbungsbogen_Militärisch" fuehren zusaetzlich
 * den Mannschaften-Karrierebogen. "Erster Treffer gewinnt" zeigte einem
 * Offizier-Bewerber dann das Mannschaften-Formular. Welche Vorlage die richtige ist, haengt an der
 * Laufbahn des Bewerbers - das entscheidet der Nutzer bzw. seine KI, nicht wir.
 *
 * Sortiert: ausfuellbare Vorlagen zuerst, damit ein Aufrufer, der nur eine
 * braucht, die brauchbarste bekommt.
 */
export function identifyBewerbungsbogen(documents: JobDocument[]): BewerbungsbogenMatch[] {
  const matches: BewerbungsbogenMatch[] = [];

  for (const document of documents) {
    const family = detectTemplateFamily(document.attHeader);
    if (!family) continue;
    matches.push({
      document,
      family,
      variant: detectBewerbungsbogenVariant(document.attHeader),
    });
  }

  return matches.sort((a, b) => Number(b.variant !== null) - Number(a.variant !== null));
}

/** Erste automatisch ausfuellbare Vorlage, falls es eine gibt. */
export function firstFillable(matches: BewerbungsbogenMatch[]): BewerbungsbogenMatch | null {
  return matches.find((match) => match.variant !== null) ?? null;
}
