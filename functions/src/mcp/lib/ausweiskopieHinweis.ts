import { verlangtAusweiskopie } from "../../mappe/ausweiskopie";
import { geteilterHinweis, type GeteilterHinweis } from "./geteilterHinweis";

/**
 * Wir nehmen keine Ausweiskopien entgegen (s. mappe/ausweiskopie.ts). Verlangt die Ausschreibung
 * eine, legt der Bewerber sie selbst bei.
 *
 * WOZU im Rueckgabewert und nicht in der Werkzeugbeschreibung: die Regel greift
 * nur, wenn die Unterlagenliste eine Ausweiskopie nennt - und genau dann liest
 * eine KI "Kopie des Personalausweises" als Auftrag, sie hochladen zu lassen.
 * Verhaltensregeln fuer einen Sonderfall gehoeren in den Rueckgabewert.
 */
export function ausweiskopieHinweis(geforderteUnterlagen: readonly string[]): GeteilterHinweis | null {
  if (!verlangtAusweiskopie(geforderteUnterlagen)) return null;
  return geteilterHinweis(
    "Die Ausschreibung verlangt eine Ausweiskopie (s. `selbstBeilegen` bzw. die Unterlagenliste). Dieser Server " +
      "nimmt keine an - weder die Upload-Seite noch fuege_dokument_hinzu. Sag dem Bewerber, dass er sie seiner " +
      "Bewerbung selbst beilegt. Bitte ihn NICHT, sie hochzuladen oder dir zu schicken.",
    "Diese Ausschreibung verlangt eine Kopie deines Personalausweises. Die nehmen wir nicht entgegen. Lege sie " +
      "deiner Bewerbung selbst bei.",
  );
}
