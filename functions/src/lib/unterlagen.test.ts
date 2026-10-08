import { describe, it, expect } from "vitest";
import { normalisiereUnterlagen } from "./unterlagen";

describe("normalisiereUnterlagen", () => {
  /**
   * WOZU: Dasselbe Dokument steht in mehreren Schreibweisen da -
   * "formloses Bewerbungsschreiben", "ein formloses Bewerbungsschreiben" und
   * weitere Varianten. Fuer einen Client sind das verschiedene Anforderungen.
   */
  it("entfernt den unbestimmten Artikel am Anfang", () => {
    expect(normalisiereUnterlagen(["ein formloses Bewerbungsschreiben"])).toEqual(["formloses Bewerbungsschreiben"]);
    expect(normalisiereUnterlagen(["einen tabellarischen Lebenslauf"])).toEqual(["tabellarischen Lebenslauf"]);
    expect(normalisiereUnterlagen(["eine Kopie des Zeugnisses"])).toEqual(["Kopie des Zeugnisses"]);
  });

  it("laesst einen Eintrag ohne Artikel unangetastet", () => {
    expect(normalisiereUnterlagen(["Lebenslauf"])).toEqual(["Lebenslauf"]);
  });

  // "Einsatzbereitschaft" faengt mit "ein" an und ist kein Artikel.
  it("schneidet nicht in ein Wort hinein", () => {
    expect(normalisiereUnterlagen(["Einverständniserklärung"])).toEqual(["Einverständniserklärung"]);
    expect(normalisiereUnterlagen(["eines Nachweises"])).toEqual(["eines Nachweises"]);
  });

  it("raeumt Leerraum und doppelte Eintraege auf", () => {
    expect(normalisiereUnterlagen(["  Lebenslauf ", "ein Lebenslauf", "Zeugnis"])).toEqual(["Lebenslauf", "Zeugnis"]);
  });

  /**
   * DER FEHLGRIFF: Manche extrahierte Listen enthalten ["Antwortbogen",
   * "Datenschutzblatt"]. Diese beiden stammen aus einem BEDINGTEN Satz - "Bei
   * keiner passenden Stelle fuer die persoenlichen Qualifikationen bitten wir um
   * Uebersendung des 'Antwortbogen' und des 'Datenschutzblatt' an
   * Reservistenanfragen@bundeswehr.org". Das ist die Anleitung fuer eine
   * INITIATIVBEWERBUNG von jemandem, der nichts Passendes gefunden hat - keine
   * Anforderung dieser Ausschreibung. Ein Bewerber, dem eine KI das als
   * Unterlage nennt, reicht etwas ein, das niemand von ihm verlangt hat.
   */
  it("wirft die Unterlagen der Initiativbewerbung heraus", () => {
    expect(normalisiereUnterlagen(["Antwortbogen", "Datenschutzblatt"])).toEqual([]);
    expect(normalisiereUnterlagen(["Lebenslauf", "Antwortbogen"])).toEqual(["Lebenslauf"]);
  });

  it("behaelt einen Fragebogen, der wirklich zur Stelle gehoert", () => {
    expect(normalisiereUnterlagen(["Fragebogen zur Verfassungstreueprüfung"])).toEqual([
      "Fragebogen zur Verfassungstreueprüfung",
    ]);
  });

  it("kommt mit leerer Eingabe klar", () => {
    expect(normalisiereUnterlagen([])).toEqual([]);
    expect(normalisiereUnterlagen(["   "])).toEqual([]);
  });
});
