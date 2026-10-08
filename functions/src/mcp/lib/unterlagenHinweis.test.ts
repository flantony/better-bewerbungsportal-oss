import { describe, it, expect } from "vitest";
import { hinweisZuBewerbungsboegen, hinweisZuUnterlagen } from "./unterlagenHinweis";

/**
 * WOZU: Haengt eine Ausschreibung keinen Bogen an, wird laut Domaenenregel
 * keiner verlangt. Diese Tests halten fest, dass die Leere gedeutet und nicht
 * mit dem Bogen einer FREMDEN Ausschreibung gefuellt wird.
 */
describe("hinweisZuBewerbungsboegen - kein Bogen dabei", () => {
  it("deutet den fehlenden Anhang als 'wird keiner verlangt'", () => {
    const hinweis = hinweisZuBewerbungsboegen(0, 0);
    expect(hinweis?.nurFuerDich).toMatch(/wird keiner verlangt/);
    expect(hinweis?.nurFuerDich).toMatch(/liegen der Ausschreibung bei/);
  });

  it("verbietet ausdruecklich die fremde Vorlage und den Upload-Wunsch", () => {
    const hinweis = hinweisZuBewerbungsboegen(0, 0);
    expect(hinweis?.nurFuerDich).toMatch(/KEINEN Bogen aus einer anderen Ausschreibung/);
    expect(hinweis?.nurFuerDich).toMatch(/hochzuladen/);
  });

  it("nennt den Ausweg fuer den Fall, dass der Text doch einen Bogen fordert", () => {
    expect(hinweisZuBewerbungsboegen(0, 0)?.nurFuerDich).toMatch(/Karriereberatungsbüro|Ansprechperson/);
  });

  it("schweigt, wenn ein ausfuellbarer Bogen anhaengt - dann traegt die Feldliste", () => {
    expect(hinweisZuBewerbungsboegen(1, 1)).toBeNull();
  });
});

/**
 * WOZU: Trotz `ausfuellbar: false` sammelt ein Client sonst Angaben ein, raet
 * Felder aus eigenem Wissen ("Standardfeld eines Bewerbungsbogens") und
 * verspricht, das Formular auszufuellen. Eine Regel in den Instructions kommt
 * dafuer nicht an - deshalb steht sie im Rueckgabewert.
 */
describe("hinweisZuBewerbungsboegen - Bogen dabei, aber nicht ausfuellbar", () => {
  it("untersagt das Sammeln von Personendaten", () => {
    const hinweis = hinweisZuBewerbungsboegen(1, 0);
    expect(hinweis?.nurFuerDich).toMatch(/KEINE Personendaten/);
    expect(hinweis?.nurFuerDich).toMatch(/versprich kein ausgefülltes PDF/);
  });

  it("untersagt ausdruecklich das Zusammenraten der Felder", () => {
    expect(hinweisZuBewerbungsboegen(1, 0)?.nurFuerDich).toMatch(/aus eigenem Wissen/);
  });

  it("sagt dem Bewerber, dass er selbst ausfuellt und wie er das Formular bekommt", () => {
    const satz = hinweisZuBewerbungsboegen(2, 0)?.fuerDenBewerber;
    expect(satz).toMatch(/Ausfüllen musst du es selbst/);
    expect(satz).toMatch(/leer/);
  });
});

/**
 * WOZU: Viele aktive Ausschreibungen tragen keine extrahierte
 * Unterlagenliste. Ein leeres Array sagt einer fremden KI
 * nicht, WARUM es leer ist - sie kann daraus "nichts einzureichen" lesen, was
 * fuer eine Bewerbung immer falsch ist. Die Regel: was erst im
 * Leerfall greift, gehoert in den Rueckgabewert, nicht in die Beschreibung.
 */
describe("hinweisZuUnterlagen", () => {
  it("sagt beim Leerfall, dass die LISTE fehlt - nicht, dass nichts noetig ist", () => {
    const hinweis = hinweisZuUnterlagen([], 0);
    // Der tragende Satz: die KI darf aus der Leere nicht "du brauchst nichts"
    // machen. Das ist der Schaden, den dieser Hinweis verhindert.
    expect(hinweis?.nurFuerDich).toMatch(/heißt NICHT, dass keine nötig sind/);
    expect(hinweis?.nurFuerDich).toMatch(/brauche nichts/);
    expect(hinweis?.nurFuerDich).toMatch(/Anschreiben|Lebenslauf/);
  });

  /**
   * WOZU: `contactDesc` listet die Unterlagen oft ausdruecklich auf ("Ihre
   * Bewerbung umfasst ..."), die Extraktion liest `contactDesc` aber NICHT mit,
   * weil dort Namen von Ansprechpersonen stehen (s. DSFA.md). Unsere Leere ist
   * also keine Leere im Text - der Hinweis muss dorthin schicken, statt zu
   * behaupten, der Text nenne nichts.
   */
  it("schickt die KI in den Fliesstext, statt zu behaupten, der Text nenne nichts", () => {
    const hinweis = hinweisZuUnterlagen([], 0);
    expect(hinweis?.nurFuerDich).toMatch(/contactDesc/);
    expect(hinweis?.nurFuerDich).not.toMatch(/geht aus ihrem Text nicht hervor/);
    // Die Bewerberhaelfte sagt, dass UNS die Liste fehlt - nicht der Ausschreibung.
    expect(hinweis?.fuerDenBewerber).toMatch(/konnten wir aus dieser Ausschreibung nicht herauslesen/);
  });

  it("verweist im Leerfall auf die Anhaenge, wenn es welche gibt", () => {
    expect(hinweisZuUnterlagen([], 2)?.nurFuerDich).toMatch(/Anh(ä|ae)nge|documents/i);
  });

  it("schweigt, wenn eine Liste vorliegt - dann ist alles gesagt", () => {
    expect(hinweisZuUnterlagen(["Lebenslauf"], 1)).toBeNull();
  });
});

/**
 * WOZU: Diese Hinweise werden von schwachen Clients woertlich durchgereicht. Die
 * Bewerberhaelfte muss deshalb fuer sich stehen: kein Imperativ an die KI, keine
 * Feldnamen aus unserem Rueckgabewert, und der Bewerber nicht in der dritten
 * Person - ein Satz wie "bitte den Bewerber nicht, einen hochzuladen" gehoert
 * nur in die Haelfte fuer die KI.
 */
describe("Bewerberhaelfte steht fuer sich", () => {
  const bewerberhaelften = [
    ["ohne Bewerbungsbogen", hinweisZuBewerbungsboegen(0, 0)?.fuerDenBewerber],
    ["ohne Unterlagenliste", hinweisZuUnterlagen([], 0)?.fuerDenBewerber],
    ["ohne Unterlagenliste, mit Anhaengen", hinweisZuUnterlagen([], 3)?.fuerDenBewerber],
  ] as const;

  it.each(bewerberhaelften)("%s: nennt kein Feld unseres Rueckgabewerts", (_fall, satz) => {
    expect(satz).toBeTruthy();
    expect(satz).not.toMatch(/`/);
    expect(satz).not.toMatch(/geforderteUnterlagen|documents|bewerbungsboegen|downloadUrl/);
  });

  it.each(bewerberhaelften)("%s: spricht nicht ueber den Bewerber in dritter Person", (_fall, satz) => {
    expect(satz).not.toMatch(/\bBewerber\b/);
  });

  it.each(bewerberhaelften)("%s: weist die KI nicht an", (_fall, satz) => {
    // Imperative aus den Regieanweisungen dieses Servers.
    expect(satz).not.toMatch(/\b(Suche|Sag|Nenne|Rufe|Frage|Verweise|sieh)\b/);
  });

  it("sagt zum fehlenden Bogen das Gegenteil von 'da fehlt etwas'", () => {
    expect(hinweisZuBewerbungsboegen(0, 0)?.fuerDenBewerber).toMatch(/du für sie auch keinen ausfüllen musst/);
  });

  it("nennt beim fehlenden Unterlagenverzeichnis das Uebliche als das Uebliche", () => {
    const satz = hinweisZuUnterlagen([], 0)?.fuerDenBewerber;
    expect(satz).toMatch(/Unterlagen brauchst du trotzdem/);
    expect(satz).toMatch(/Ansprechperson/);
  });
});
