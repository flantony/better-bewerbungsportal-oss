import { describe, it, expect } from "vitest";
import { listJobsFilterAus } from "./suchfilter";
import { toBundeslandCodes, toLaufbahngruppeCodes, toOrganisationsbereichCodes } from "./filterOptions";
import type { Suchprofil } from "../../konto/kontoTypen";

describe("listJobsFilterAus", () => {
  it("uebersetzt die lesbaren Facettennamen in dieselben Codes wie die Einzelfunktionen", () => {
    const input = {
      organisationsbereich: ["Marine"],
      bundesland: ["Bayern"],
      laufbahngruppe: ["Offiziere"],
    };
    const filter = listJobsFilterAus(input);
    expect(filter.organisationsbereich).toEqual(toOrganisationsbereichCodes(input.organisationsbereich));
    expect(filter.bundesland).toEqual(toBundeslandCodes(input.bundesland));
    expect(filter.laufbahngruppe).toEqual(toLaufbahngruppeCodes(input.laufbahngruppe));
  });

  it("nimmt ein Suchprofil ohne Cast entgegen", () => {
    const suchprofil: Suchprofil = {
      suchbegriff: "Cyber",
      organisationsbereich: ["Marine"],
    };
    const filter = listJobsFilterAus(suchprofil);
    expect(filter.suchbegriff).toBe("Cyber");
  });

  it("reicht alter, limit, sortierung und cursor unveraendert durch, wenn gesetzt", () => {
    const filter = listJobsFilterAus({
      alter: 25,
      limit: 5,
      sortierung: "neueste",
      cursor: "abc",
    });
    expect(filter.alter).toBe(25);
    expect(filter.limit).toBe(5);
    expect(filter.sortierung).toBe("neueste");
    expect(filter.cursor).toBe("abc");
  });

  it("laesst Felder weg, die nicht gesetzt sind", () => {
    const filter = listJobsFilterAus({});
    expect(filter.alter).toBeUndefined();
    expect(filter.limit).toBeUndefined();
    expect(filter.sortierung).toBeUndefined();
    expect(filter.cursor).toBeUndefined();
    expect(filter.organisationsbereich).toEqual([]);
    expect(filter.bundesland).toEqual([]);
    expect(filter.laufbahngruppe).toEqual([]);
  });
});
