import { describe, it, expect } from "vitest";
import { altAusV2, baueV2, v2Teilaktualisierung } from "./jobsV2Shape";

describe("baueV2", () => {
  it("sortiert Rohwerte nach api und Ableitungen nach oben", () => {
    const neu = baueV2({ pinstGuid: "abc", besOrt: "Munster", region: "12", vollzeit: true });
    expect((neu.api as Record<string, unknown>).BesOrt).toBe("Munster");
    expect((neu.api as Record<string, unknown>).Region).toBe("12");
    expect(neu.vollzeit).toBe(true);
  });

  it("legt nie gefegte Felder ausdruecklich als leer an", () => {
    const api = baueV2({ pinstGuid: "abc" }).api as Record<string, unknown>;
    expect(api.BesGruppe).toBe("");
    expect(api.ArtResStelle).toBe("");
  });

  it("haelt Typen auseinander - aus false wird kein Leerstring", () => {
    const api = baueV2({ pinstGuid: "abc" }).api as Record<string, unknown>;
    expect(api.HotJob).toBe(false);
    expect(api.ReqIndustry).toBe(0);
  });

  // Ein spaeterer Lauf darf einen per
  // Sweep ermittelten Wert nicht mit Leere ueberbuegeln.
  it("laesst einen vorhandenen Wert stehen, wenn die Quelle nichts hergibt", () => {
    const vorhanden = { api: { BesGruppe: "9", Region: "12" }, jobAttributes: { dienstgrad: "Major" } };
    const neu = baueV2({ pinstGuid: "abc" }, vorhanden);
    expect((neu.api as Record<string, unknown>).BesGruppe).toBe("9");
    expect((neu.api as Record<string, unknown>).Region).toBe("12");
    expect(neu.jobAttributes).toEqual({ dienstgrad: "Major" });
  });
});

describe("v2Teilaktualisierung", () => {
  // DER FEHLER, DEN DAS HIER VERHINDERT: `set(..., {merge:true})` deutet
  // Punktnotation NICHT als Feldpfad - nur `update()` tut das. Ein Schluessel
  // "api.Region" landet dann woertlich als Feldname auf oberster Ebene, und in
  // `api` bleibt der alte Wert stehen - unbemerkt, bis ein Abgleich es findet.
  it("liefert ein verschachteltes api-Objekt, keine Punktnotation", () => {
    const neu = v2Teilaktualisierung({ region: "12", country: "DE" });
    expect(Object.keys(neu)).not.toContain("api.Region");
    expect(neu.api).toEqual({ Region: "12", Country: "DE" });
  });

  it("laesst Ableitungen auf der oberen Ebene", () => {
    const neu = v2Teilaktualisierung({ einstiegsweg: "seiteneinstieg" });
    expect(neu.einstiegsweg).toBe("seiteneinstieg");
    expect(neu.api).toBeUndefined();
  });

  // Laufbahngruppe und Organisationsbereich stehen bewusst in BEIDEN Ebenen.
  it("schreibt Laufbahngruppe zugleich als api-Feld und als Ableitung", () => {
    const neu = v2Teilaktualisierung({ laufbahngruppe: "0007" });
    expect(neu.api).toEqual({ HierarchyLevel: "0007" });
    expect(neu.laufbahngruppe).toBe("0007");
  });
});

describe("altAusV2", () => {
  it("packt api.* zurueck in die Domaenenfelder", () => {
    const alt = altAusV2({ api: { BesOrt: "Munster", Title: "Kraftfahrer", Region: "12" }, vollzeit: true });
    expect(alt.besOrt).toBe("Munster");
    expect(alt.title).toBe("Kraftfahrer");
    expect(alt.region).toBe("12");
    expect(alt.vollzeit).toBe(true);
  });

  // Hin und zurueck muss dasselbe ergeben - sonst gehen beim Lesen aus jobsV2 Daten verloren.
  it("ist die Umkehrung von baueV2", () => {
    const original = {
      pinstGuid: "abc", refCode: "REF-1", title: "Titel", besOrt: "Kiel", region: "01",
      country: "DE", vollzeit: true, laufbahngruppe: "0007", organisationsbereich: "0004",
      einstiegsweg: "seiteneinstieg", suchTokens: ["a"], active: true,
    };
    const zurueck = altAusV2(baueV2(original));
    for (const [feld, wert] of Object.entries(original)) {
      expect(zurueck[feld], `Feld ${feld}`).toEqual(wert);
    }
  });
});
