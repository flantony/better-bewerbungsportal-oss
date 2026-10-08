import { describe, it, expect } from "vitest";
import type { GlossaryTerm } from "../../types";
import { aehnlicheBegriffe, findeBegriff, mitKorrekturen } from "./glossar";

/** Ausschnitt aus dem echten Bestand - die Slugs stimmen mit Firestore ueberein. */
const BESTAND: GlossaryTerm[] = [
  { term: "Soldat auf Zeit", slug: "soldat-auf-zeit", aliases: ["SaZ"], definition: "Auf eine bestimmte Zeit verpflichtet." },
  { term: "Reservedienst", slug: "reservedienst", aliases: [], definition: "Dienst ausserhalb des aktiven Wehrdienstes." },
  { term: "Unteroffizier mit Portepee", slug: "unteroffizier-mit-portepee", aliases: [], definition: "Feldwebeldienstgrade." },
] as GlossaryTerm[];

describe("findeBegriff — Laienbegriffe", () => {
  /**
   * Ein Bewerber schreibt "Zeitsoldat"; der Begriff steht aber unter "Soldat
   * auf Zeit" im Bestand, und kein Eintrag beginnt mit "Zei".
   *
   * WARUM IM CODE UND NICHT IN DEN DATEN: das Glossar wird per Skript aus den
   * Ausschreibungstexten erzeugt und mit `batch.set()` ohne Merge geschrieben -
   * ein von Hand ergaenzter Alias waere beim naechsten Lauf weg.
   * Und "Zeitsoldat" kommt in keinem Ausschreibungstext vor: die Bundeswehr
   * schreibt "Soldatin / Soldat auf Zeit". Der Begriff kann also gar nicht aus
   * den Daten entstehen - er ist das Wort, das der BEWERBER benutzt.
   */
  it.each([
    ["Zeitsoldat", "soldat-auf-zeit"],
    ["Zeitsoldatin", "soldat-auf-zeit"],
    ["Reservist", "reservedienst"],
    ["Reservistin", "reservedienst"],
  ])("findet %s ueber den Laienbegriff", (eingabe, slug) => {
    expect(findeBegriff(BESTAND, eingabe)?.slug).toBe(slug);
  });

  it("achtet nicht auf Gross-/Kleinschreibung", () => {
    expect(findeBegriff(BESTAND, "zeitsoldat")?.slug).toBe("soldat-auf-zeit");
  });

  it("laesst die echten Eintraege unangetastet vorgehen", () => {
    expect(findeBegriff(BESTAND, "SaZ")?.slug).toBe("soldat-auf-zeit");
    expect(findeBegriff(BESTAND, "Portepee")?.slug).toBe("unteroffizier-mit-portepee");
  });

  // Ein Laienbegriff, dessen Ziel gar nicht im Bestand liegt, darf nicht zu
  // einem Treffer auf Verdacht fuehren - lieber nichts als das Falsche.
  it("erfindet keinen Treffer, wenn der Zielbegriff fehlt", () => {
    expect(findeBegriff([BESTAND[2]], "Zeitsoldat")).toBeNull();
  });
});

describe("aehnlicheBegriffe — keine stille Sackgasse", () => {
  /**
   * Ueber die ersten drei Buchstaben allein findet "Zeitsoldat" nichts, obwohl "Soldat auf Zeit" im Bestand steht: kein Eintrag
   * beginnt mit "Zei". Ein leeres Ergebnis ohne Hinweis ist ein Fehler, kein
   * Ergebnis - deshalb zaehlt auch ein gemeinsames Wort.
   */
  it("schlaegt ueber ein gemeinsames Wort vor, nicht nur ueber den Wortanfang", () => {
    expect(aehnlicheBegriffe(BESTAND, "Truppensoldat")).toContain("Soldat auf Zeit");
  });

  it("behaelt den Vorschlag ueber den Wortanfang", () => {
    expect(aehnlicheBegriffe(BESTAND, "Reserveoffizier")).toContain("Reservedienst");
  });

  it("schlaegt bei voelliger Fremdheit nichts vor, statt zu raten", () => {
    expect(aehnlicheBegriffe(BESTAND, "Quantenphysik")).toEqual([]);
  });
});

/**
 * Das erzeugte Glossar nennt Feldwebel
 * "einen Dienstgrad der Unteroffizierslaufbahn". Der militaerische Bogen hat
 * getrennte Kaestchen fuer Unteroffiziere und Feldwebel.
 */
describe("mitKorrekturen", () => {
  const erzeugt: GlossaryTerm[] = [
    {
      term: "Feldwebel",
      slug: "feldwebel",
      aliases: [],
      definition: "Ein militärischer Dienstgrad der Unteroffizierslaufbahn mit Führungs- und Fachaufgaben.",
    },
    ...BESTAND,
  ] as GlossaryTerm[];

  it("ersetzt die Feldwebel-Definition durch die eigene Laufbahngruppe", () => {
    const feldwebel = mitKorrekturen(erzeugt).find((eintrag) => eintrag.slug === "feldwebel");
    expect(feldwebel?.definition).toMatch(/^Eigene Laufbahngruppe der Feldwebel \(Unteroffiziere mit Portepee\)/);
    expect(feldwebel?.definition).toMatch(/eigenes Kästchen, getrennt von den Unteroffizieren/);
    expect(feldwebel?.definition).not.toMatch(/Unteroffizierslaufbahn/);
    expect(feldwebel?.term).toBe("Feldwebel");
  });

  it("laesst alle anderen Eintraege unveraendert", () => {
    expect(mitKorrekturen(BESTAND)).toEqual(BESTAND);
  });
});
