/**
 * Ausweiskopien nehmen wir nicht entgegen - weder im Konto noch in der
 * transienten Mappe noch ueber ein MCP-Werkzeug. Verlangt eine Ausschreibung eine, legt der Bewerber
 * sie selbst bei; das sagen ihm Merkzettel, Paketseite und `mappe_status`.
 *
 * Hier liegen nur die Texte und die Erkennung in der (oeffentlichen)
 * Unterlagenliste der Ausschreibung - nie eine Bewerberangabe.
 */

/** Ablehnung eines Uploads, der als Ausweiskopie angefragt wird. */
export const KEINE_AUSWEISKOPIE =
  "Ausweiskopien nehmen wir nicht entgegen. Verlangt die Ausschreibung eine Kopie deines Personalausweises, " +
  "lege sie deiner Bewerbung selbst bei.";

/** Die Zeile im Merkzettel und auf der Paketseite - nur, wenn die Ausschreibung eine Ausweiskopie verlangt. */
export const AUSWEISKOPIE_HINWEIS =
  "Ausweiskopie: Verlangt die Ausschreibung eine Kopie deines Personalausweises, lege sie selbst bei. Wir nehmen keine Ausweiskopien entgegen.";

/**
 * Am WORTANFANG geprueft, wie in mappeSicht.ts und aus demselben Grund:
 * "Kopie des Schwerbehindertenausweises" steht in vielen Unterlagenlisten
 * und ist keine Ausweiskopie. "pass" fehlt, weil es das Passbild traefe.
 */
const AUSWEIS_STAEMME = ["ausweis", "personalausweis", "reisepass", "identitätsnachweis", "identitaetsnachweis"];

export function istAusweisUnterlage(eintrag: string): boolean {
  return AUSWEIS_STAEMME.some((stamm) => new RegExp(`(^|[^a-zäöüß])${stamm}`, "i").test(eintrag));
}

export function verlangtAusweiskopie(geforderteUnterlagen: readonly string[]): boolean {
  return geforderteUnterlagen.some(istAusweisUnterlage);
}
