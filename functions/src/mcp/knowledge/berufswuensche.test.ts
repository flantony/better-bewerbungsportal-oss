import { describe, it, expect } from "vitest";
import { BERUFSWUENSCHE, findeBerufswunsch } from "./berufswuensche";

describe("Berufswunsch-Register", () => {
  it("loest einen Wunsch auf, der kein Ausschreibungstitel ist", () => {
    const treffer = findeBerufswunsch("Panzerkommandant");
    expect(treffer?.suche.suchbegriff).toBe("Panzer");
  });

  it("trifft unabhaengig von Gross- und Kleinschreibung", () => {
    expect(findeBerufswunsch("panzerkommandant")).not.toBeNull();
  });

  it("trifft ueber eine Schreibvariante", () => {
    // "Militaerpolizist" ist der Alltagsname, "Feldjaeger" der Titel.
    expect(findeBerufswunsch("Militärpolizist")?.suche.suchbegriff).toBe("Feldjäger");
  });

  it("trifft die weibliche Form", () => {
    expect(findeBerufswunsch("Panzerkommandantin")?.suche.suchbegriff).toBe("Panzer");
  });

  it("gibt null zurueck, wenn das Wort nicht im Register steht", () => {
    expect(findeBerufswunsch("Zonenschichtbeauftragter")).toBeNull();
  });

  it("gibt null bei leerer Eingabe zurueck", () => {
    expect(findeBerufswunsch("   ")).toBeNull();
  });
});

describe("Registerinhalt", () => {
  // Ein Eintrag, der auf nichts zeigt, ist schlimmer als kein Eintrag: er
  // schickt die KI in eine zweite leere Suche.
  it("hat zu jedem Eintrag entweder eine Suche oder eine Beschreibung des Bestands", () => {
    for (const eintrag of BERUFSWUENSCHE) {
      const hatSuche = Boolean(eintrag.suche.suchbegriff || eintrag.suche.organisationsbereich?.length);
      expect(hatSuche || eintrag.wasEsGibt.length > 0).toBe(true);
    }
  });

  // Das Feld beschreibt den Ausschreibungsbestand, nicht den Beruf. Faengt ein
  // Eintrag mit dem Wunschwort an ("Ein Panzerkommandant ist..."), liest ein
  // Client ihn als Definition - genau der Fehler, den der Server verhindern soll.
  it("beschreibt den Bestand, nicht den Beruf", () => {
    for (const eintrag of BERUFSWUENSCHE) {
      expect(eintrag.wasEsGibt.toLowerCase()).not.toContain(eintrag.wunsch.toLowerCase());
    }
  });

  it("fuehrt kein Wort doppelt", () => {
    const woerter = BERUFSWUENSCHE.flatMap((eintrag) => [eintrag.wunsch, ...(eintrag.auch ?? [])]).map((wort) =>
      wort.toLowerCase(),
    );
    expect(new Set(woerter).size).toBe(woerter.length);
  });
});
