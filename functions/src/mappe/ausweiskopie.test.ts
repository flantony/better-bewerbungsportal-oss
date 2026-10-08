import { describe, expect, it } from "vitest";
import { AUSWEISKOPIE_HINWEIS, KEINE_AUSWEISKOPIE, istAusweisUnterlage, verlangtAusweiskopie } from "./ausweiskopie";

/**
 * WOZU: Wir nehmen keine Ausweiskopien entgegen. Verlangt eine Ausschreibung eine, muss
 * der Bewerber das trotzdem erfahren - sonst fehlt sie in der eingereichten
 * Bewerbung, und niemand hat es ihm gesagt.
 */
describe("istAusweisUnterlage", () => {
  it.each([
    "Kopie des Personalausweises",
    "Personalausweiskopie",
    "Ausweiskopie",
    "Kopie des Ausweises (Vorder- und Rückseite)",
    "Kopie des Reisepasses",
    "Identitätsnachweis",
    "Identitaetsnachweis",
  ])("erkennt %s", (eintrag) => {
    expect(istAusweisUnterlage(eintrag)).toBe(true);
  });

  // Viele Unterlagenlisten nennen den Schwerbehindertenausweis - der ist keine
  // Ausweiskopie und darf den Hinweis nicht ausloesen. Ein Passbild auch nicht.
  it.each(["Kopie des Schwerbehindertenausweises", "Passbild", "Lebenslauf", "Zeugniskopien"])(
    "erkennt %s nicht",
    (eintrag) => {
      expect(istAusweisUnterlage(eintrag)).toBe(false);
    },
  );
});

describe("verlangtAusweiskopie", () => {
  it("ist wahr, wenn ein Eintrag der Unterlagenliste eine Ausweiskopie verlangt", () => {
    expect(verlangtAusweiskopie(["Lebenslauf", "Kopie des Personalausweises"])).toBe(true);
  });

  it("ist falsch ohne Liste oder ohne passenden Eintrag", () => {
    expect(verlangtAusweiskopie([])).toBe(false);
    expect(verlangtAusweiskopie(["Lebenslauf", "Kopie des Schwerbehindertenausweises"])).toBe(false);
  });
});

describe("Texte", () => {
  it("sagt dem Bewerber im Paket, dass er die Kopie selbst beilegt", () => {
    expect(AUSWEISKOPIE_HINWEIS).toBe(
      "Ausweiskopie: Verlangt die Ausschreibung eine Kopie deines Personalausweises, lege sie selbst bei. Wir nehmen keine Ausweiskopien entgegen.",
    );
  });

  it("lehnt einen Upload verstaendlich ab", () => {
    expect(KEINE_AUSWEISKOPIE).toMatch(/nehmen wir nicht entgegen/);
    expect(KEINE_AUSWEISKOPIE).toMatch(/selbst bei/);
  });
});
