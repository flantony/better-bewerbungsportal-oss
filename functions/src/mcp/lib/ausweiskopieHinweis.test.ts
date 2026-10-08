import { describe, expect, it } from "vitest";
import { ausweiskopieHinweis } from "./ausweiskopieHinweis";

/**
 * WOZU: Wir nehmen keine Ausweiskopien entgegen. Steht eine in der
 * Unterlagenliste, liest jede KI das als "lass sie hochladen" - die
 * Verhaltensregel gehoert darum in den Rueckgabewert, genau in dem Fall, in dem
 * sie greift.
 */
describe("ausweiskopieHinweis", () => {
  it("sagt der KI, dass der Bewerber die Kopie selbst beilegt und sie nicht hochladen soll", () => {
    const hinweis = ausweiskopieHinweis(["Lebenslauf", "Kopie des Personalausweises"]);
    expect(hinweis?.nurFuerDich).toMatch(/selbst bei/);
    expect(hinweis?.nurFuerDich).toMatch(/NICHT/);
    expect(hinweis?.nurFuerDich).toMatch(/fuege_dokument_hinzu/);
    expect(hinweis?.fuerDenBewerber).toMatch(/Lege sie deiner Bewerbung selbst bei/);
  });

  it("gibt null, wenn keine Ausweiskopie verlangt ist", () => {
    expect(ausweiskopieHinweis(["Lebenslauf", "Kopie des Schwerbehindertenausweises"])).toBeNull();
    expect(ausweiskopieHinweis([])).toBeNull();
  });
});
