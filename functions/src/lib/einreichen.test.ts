import { describe, it, expect } from "vitest";
import { BEWERBUNGSPORTAL_URL, einreichenSchritte } from "./einreichen";

/**
 * WOZU: Merkzettel, KI-Seite und Paketseite sollen nicht nur "offizielles
 * Portal ... Kennung suchen" sagen, sondern die Adresse nennen und was mit den
 * PDFs geschehen soll.
 */
describe("einreichenSchritte", () => {
  it("nennt die Portaladresse, die die Ausschreibungen selbst nennen", () => {
    // Die meisten contactDesc-Texte mit Link nennen genau diese Adresse.
    expect(BEWERBUNGSPORTAL_URL).toBe("https://bewerbung.bundeswehr-karriere.de");
    expect(einreichenSchritte("2026-1-CIR-Fw-IT-E").join(" ")).toContain(BEWERBUNGSPORTAL_URL);
  });

  it("sagt, was mit den PDFs geschieht und was danach passiert", () => {
    const text = einreichenSchritte("2026-1-CIR-Fw-IT-E").join(" ");
    expect(text).toMatch(/Karriere starten/);
    expect(text).toMatch(/Profil/);
    expect(text).toContain("2026-1-CIR-Fw-IT-E");
    expect(text).toMatch(/hochladen/);
    expect(text).toMatch(/persönlichen Angaben.*noch einmal/);
    expect(text).toMatch(/In der Regel meldet sich danach die Karriereberatung zur Terminvereinbarung/);
  });

  it("laesst den Weg der Ausschreibung vorgehen", () => {
    expect(einreichenSchritte("X").join(" ")).toMatch(/anderen Weg.*gilt dieser/);
  });

  it("kommt ohne Kennung aus (Wissensseite ohne konkrete Stelle)", () => {
    const text = einreichenSchritte().join(" ");
    expect(text).toMatch(/über ihre Kennung/);
    expect(text).not.toMatch(/undefined/);
  });
});
