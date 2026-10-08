import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GlossaryTerm } from "../../types";

let begriffe: GlossaryTerm[] = [];

vi.mock("../knowledge/glossar", async () => {
  const echt = await vi.importActual<typeof import("../knowledge/glossar")>("../knowledge/glossar");
  return { ...echt, ladeGlossar: async () => begriffe };
});

const { erklaereBegriff } = await import("./erklaereBegriff");

beforeEach(() => {
  begriffe = [
    {
      term: "Unteroffizier mit Portepee",
      slug: "unteroffizier-mit-portepee",
      definition: "Dienstgradgruppe der höheren Unteroffiziere ab dem Dienstgrad Feldwebel.",
      aliases: [],
    },
    { term: "SaZ", slug: "saz", definition: "Soldat auf Zeit.", aliases: ["Soldat auf Zeit"] },
  ];
});

describe("erklaere_begriff — Glossar", () => {
  it("findet einen Eintrag ueber einen Teilbegriff", async () => {
    const result = await erklaereBegriff({ begriff: "Portepee" });
    expect(result.gefunden).toBe(true);
    expect(result.erklaerung).toMatch(/Feldwebel/);
  });

  it("nennt Schreibvarianten mit", async () => {
    const result = await erklaereBegriff({ begriff: "SaZ" });
    expect(result.auchGeschriebenAls).toContain("Soldat auf Zeit");
  });
});

// "Was bedeutet Kapitaenleutnant auf der Besoldungsskala?" - die Antwort steht
// auch in einer Resource, aber Werkzeuge werden benutzt, Resources kaum.
describe("erklaere_begriff — Dienstgrade", () => {
  it("liefert die Besoldungsspanne zu einem Dienstgrad ohne Glossareintrag", async () => {
    const result = await erklaereBegriff({ begriff: "Kapitänleutnant" });
    expect(result.gefunden).toBe(true);
    expect(result.dienstgrad?.besoldung).toBeTruthy();
    expect(result.dienstgrad?.erkannt).toContain("Kapitänleutnant");
  });

  it("erklaert eine Spanne als Gesetzeslage, nicht als Schaetzung", async () => {
    const result = await erklaereBegriff({ begriff: "Hauptmann" });
    // Hauptmann steht in Anlage I in A 11 UND A 12.
    expect(result.dienstgrad?.besoldung).toBe("A11-A12");
    expect(result.dienstgrad?.hinweis).toMatch(/mehreren Besoldungsgruppen/);
  });

  it("nennt die Laufbahngruppe mit Klartext dazu", async () => {
    const result = await erklaereBegriff({ begriff: "Hauptgefreiter" });
    const gruppen = result.dienstgrad?.laufbahngruppen ?? [];
    expect(gruppen.map((g) => g.wert)).toContain("Mannschaften");
    expect(gruppen[0].bedeutung).toBeTruthy();
  });

  it("liefert Glossar UND Besoldung, wenn beides zutrifft", async () => {
    const result = await erklaereBegriff({ begriff: "Unteroffizier mit Portepee" });
    expect(result.erklaerung).toMatch(/Feldwebel/);
    expect(result.dienstgrad?.besoldung).toBe("A7-A9");
  });

  it("sagt bei einem Dienstgrad ohne Glossareintrag, wo die Auskunft steht", async () => {
    const result = await erklaereBegriff({ begriff: "Kapitänleutnant" });
    expect(result.erklaerung).toBe("");
    expect(result.hinweis?.nurFuerDich).toMatch(/dienstgrad/);
  });
});

describe("erklaere_begriff — nichts gefunden", () => {
  it("raet nicht, sondern sagt es", async () => {
    const result = await erklaereBegriff({ begriff: "Zonenschichtbeauftragter" });
    expect(result.gefunden).toBe(false);
    expect(result.hinweis?.nurFuerDich).toMatch(/nicht raten|keine hinterlegte Definition/);
    // Der Bewerber muss hoeren, dass eine Definition FEHLT - nicht eine erfundene.
    expect(result.hinweis?.fuerDenBewerber).toMatch(/keine hinterlegte Erklärung/);
    expect(result.dienstgrad).toBeUndefined();
  });
});

// Ein Bewerber fragt nicht nur nach Fachwoertern, sondern auch nach seinem
// Berufswunsch ("Was ist ein Panzerkommandant?"). Darauf "steht nicht im
// Glossar" zu antworten ist richtig und trotzdem eine Sackgasse.
describe("erklaere_begriff — Berufswunsch", () => {
  it("liefert zu einem Berufswunsch eine Suchhilfe", async () => {
    const result = await erklaereBegriff({ begriff: "Panzerkommandant" });
    expect(result.suchhilfe?.suche.suchbegriff).toBe("Panzer");
  });

  it("erfindet dafuer trotzdem keine Definition", async () => {
    const result = await erklaereBegriff({ begriff: "Panzerkommandant" });
    expect(result.gefunden).toBe(false);
    expect(result.erklaerung).toBe("");
  });

  // Der Text in `suchhilfe` sagt, welche Stellen es gibt. Wird er als Antwort
  // auf "Was ist ein Panzerkommandant?" weitergereicht, behauptet er, ein
  // Kommandant sei ein Kraftfahrer. Der Client muss das ausdruecklich hoeren.
  it("verbietet ausdruecklich, die Suchhilfe als Berufsbeschreibung zu zitieren", async () => {
    const result = await erklaereBegriff({ begriff: "Panzerkommandant" });
    expect(result.hinweis?.nurFuerDich).toMatch(/keine Beschreibung des Berufs/);
    // ...und die Bewerberhaelfte darf genau diese Regieanweisung NICHT enthalten.
    expect(result.hinweis?.fuerDenBewerber).not.toMatch(/suchhilfe|list_jobs/);
  });

  it("haengt keine Suchhilfe an einen Glossartreffer", async () => {
    const result = await erklaereBegriff({ begriff: "SaZ" });
    expect(result.suchhilfe).toBeUndefined();
  });
});
