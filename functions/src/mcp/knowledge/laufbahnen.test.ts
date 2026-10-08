import { describe, it, expect } from "vitest";
import { laufbahnenMarkdown } from "./laufbahnen";

// Beispiel: "Ich moechte Panzerkommandant werden". Die
// Ausschreibungsdaten kennen nur Einstiegsstellen, und niemand sagt der
// anfragenden KI, dass die Laufbahngruppe beim Einstieg kein Endzustand ist -
// also erklaert sie es aus ihrem Trainingswissen oder gar nicht.
describe("laufbahnen — Aufstieg", () => {
  it("hat einen eigenen Abschnitt zum Aufstieg", () => {
    expect(laufbahnenMarkdown()).toMatch(/## Aufstieg/);
  });

  it("belegt ihn mit den Fundstellen der SLV", () => {
    const markdown = laufbahnenMarkdown();
    expect(markdown).toMatch(/§ 21/);
    expect(markdown).toMatch(/§ 27/);
  });

  // Ein Aufstieg ist ein eigenes Auswahlverfahren. Wer ihn als Selbstlaeufer
  // beschreibt, verspricht einem Bewerber etwas, das niemand zugesagt hat.
  it("stellt den Aufstieg nicht als Automatismus dar", () => {
    expect(laufbahnenMarkdown()).toMatch(/kein Automatismus/);
  });

  // Der Abschnitt benutzt die Begriffe der SLV. "Stabsunteroffizier" und
  // "Truppendienst" sind nachschlagbar, "Fachunteroffizier" nicht - das gehoert
  // gesagt, statt eine Erklaerung dafuer zu erfinden.
  it("verweist fuer die Rangbezeichnungen auf erklaere_begriff", () => {
    expect(laufbahnenMarkdown()).toMatch(/erklaere_begriff/);
  });

  it("sagt, dass die Ausschreibungsdaten selbst nichts ueber den Aufstieg hergeben", () => {
    expect(laufbahnenMarkdown()).toMatch(/Ausschreibungsdaten|steht in keiner Ausschreibung/);
  });
});
