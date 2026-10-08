/**
 * Raeumt die aus dem Ausschreibungstext extrahierte Unterlagenliste auf.
 *
 * WOZU: Die Liste ist die Grundlage dafuer, dass eine fremde KI dem Bewerber
 * sagen kann, WAS er einreichen muss. Sie ist inhaltlich gut, hat aber zwei
 * Macken, die beide beim Leser ankommen.
 */

/**
 * Unterlagen, die NICHT zu dieser Ausschreibung gehoeren.
 *
 * Herkunft: ein bedingter Textbaustein, der in vielen Reservedienst-Anzeigen
 * steht - "Bei keiner passenden Stelle fuer die persoenlichen Qualifikationen
 * bitten wir um Uebersendung des 'Antwortbogen' und des 'Datenschutzblatt' an
 * Reservistenanfragen@bundeswehr.org". Das ist die Anleitung fuer eine
 * INITIATIVBEWERBUNG von jemandem, der gerade NICHTS Passendes gefunden hat.
 * Die Extraktion liest den Satz gelegentlich als Anforderung.
 *
 * Warum das schlimmer ist als eine Luecke: Eine KI, die dem Bewerber diese
 * beiden Dokumente nennt, schickt ihn los, etwas einzureichen, das fuer diese
 * Stelle niemand verlangt hat - und er merkt es nicht.
 *
 * Bewusst nur diese beiden, wortgenau: "Fragebogen" allgemein bleibt drin, denn
 * "Fragebogen zur Verfassungstreuepruefung" ist eine echte Anforderung.
 */
const NICHT_FUER_DIESE_STELLE = new Set(["antwortbogen", "datenschutzblatt"]);

/**
 * Unbestimmte Artikel am Zeilenanfang. Die Extraktion uebernimmt den Wortlaut
 * des Textes, und der schreibt mal "einen tabellarischen Lebenslauf", mal
 * "tabellarischer Lebenslauf" - dieselbe Anforderung, fuer einen Client zwei.
 *
 * "eines"/"einer" fehlen absichtlich: sie stehen im Genitiv mitten in der
 * Anforderung ("Vorlage eines Nachweises"), ein Abschneiden waere dort falsch.
 */
const ARTIKEL = /^(ein|eine|einen|einem)\s+/i;

export function normalisiereUnterlagen(unterlagen: string[]): string[] {
  const gesehen = new Set<string>();
  const ergebnis: string[] = [];

  for (const eintrag of unterlagen) {
    const ohneArtikel = eintrag.trim().replace(ARTIKEL, "").trim();
    if (!ohneArtikel) continue;
    if (NICHT_FUER_DIESE_STELLE.has(ohneArtikel.toLowerCase())) continue;

    const schluessel = ohneArtikel.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    ergebnis.push(ohneArtikel);
  }

  return ergebnis;
}
