import { describe, expect, it } from "vitest";
import { suchprofilSchema, SUCHOPTIONEN } from "./kontoTypen";
import { listJobsInputSchema } from "../mcp/tools/listJobs";

/**
 * WOZU: Das Suchprofil wird unveraendert als list_jobs-Filter an
 * queryJobs gegeben. Laeuft es von listJobsInputSchema weg, matcht die Mail
 * andere Stellen als die Suche - ohne dass es jemand merkt.
 */
describe("suchprofilSchema", () => {
  it("nimmt einen typischen Reservisten-Wunsch an", () => {
    const profil = suchprofilSchema.parse({
      vertragsarten: ["Reservedienst"],
      bundesland: ["Nordrhein-Westfalen"],
      beschaeftigungsumfang: "beide",
    });
    expect(profil.vertragsarten).toEqual(["Reservedienst"]);
  });

  it("kennt genau die list_jobs-Felder ohne Paging und Alter", () => {
    const erwartet = Object.keys(listJobsInputSchema)
      .filter((feld) => !["cursor", "limit", "sortierung", "alter"].includes(feld))
      .sort();
    expect(Object.keys(suchprofilSchema.shape).sort()).toEqual(erwartet);
  });

  it("lehnt unbekannte Felder ab, statt sie still zu speichern", () => {
    expect(suchprofilSchema.safeParse({ vorname: "Max" }).success).toBe(false);
  });

  it("lehnt Werte ausserhalb der erlaubten Listen ab", () => {
    expect(suchprofilSchema.safeParse({ bundesland: ["Atlantis"] }).success).toBe(false);
  });

  // WOZU: das Konto ist ein eigener Speicher - ohne Obergrenze liesse sich
  // ueber einen Endpunkt beliebig viel Text je Nutzer ablegen.
  it("lehnt einen Suchbegriff ueber 100 Zeichen ab", () => {
    expect(suchprofilSchema.safeParse({ suchbegriff: "a".repeat(100) }).success).toBe(true);
    expect(suchprofilSchema.safeParse({ suchbegriff: "a".repeat(101) }).success).toBe(false);
  });

  it("lehnt einen Wunschort ueber 100 Zeichen ab", () => {
    expect(suchprofilSchema.safeParse({ wunschort: "a".repeat(101) }).success).toBe(false);
  });

  it("lehnt das Alter ab - das ist eine Bewerberangabe", () => {
    expect(suchprofilSchema.safeParse({ alter: 35 }).success).toBe(false);
  });
});

describe("SUCHOPTIONEN", () => {
  it("bietet nur Werte an, die das Schema auch annimmt", () => {
    const profil = {
      organisationsbereich: SUCHOPTIONEN.organisationsbereich,
      laufbahngruppe: SUCHOPTIONEN.laufbahngruppe,
      bundesland: SUCHOPTIONEN.bundesland,
      vertragsarten: SUCHOPTIONEN.vertragsarten,
      einstiegswege: SUCHOPTIONEN.einstiegswege,
    };
    expect(suchprofilSchema.safeParse(profil).success).toBe(true);
  });

  // WOZU: leer ist erlaubt - fuer "Einfacher/Mittlerer Dienst" steht in
  // mcp/knowledge/laufbahnen.ts nichts, und eine selbst formulierte Erklaerung
  // waere genau der Fehler, den diese Texte verhindern sollen. Fehlen darf der
  // Eintrag aber nicht.
  it("fuehrt fuer jede Laufbahngruppe einen Eintrag (darf leer sein)", () => {
    for (const laufbahngruppe of SUCHOPTIONEN.laufbahngruppe) {
      expect(typeof SUCHOPTIONEN.laufbahngruppeBedeutung[laufbahngruppe], laufbahngruppe).toBe("string");
    }
  });

  it("fuehrt fuer jeden Einstiegsweg einen Eintrag (darf leer sein)", () => {
    for (const einstiegsweg of SUCHOPTIONEN.einstiegswege) {
      expect(typeof SUCHOPTIONEN.einstiegswegBedeutung[einstiegsweg], einstiegsweg).toBe("string");
    }
  });

  // WOZU: zu "Andere" erfindet ein Modell leicht eine Bedeutung - gerade hier
  // muss der Bewerber lesen, dass es keine eigene Laufbahngruppe ist.
  it("erklaert den Sammelposten 'Andere' auf Deutsch", () => {
    expect(SUCHOPTIONEN.laufbahngruppeBedeutung["Andere"]).toMatch(/Sammelposten/);
  });

  // WOZU: die englischen Saetze ("catch-all bucket ... do not describe it")
  // richten sich an KI-Clients und gehoeren nicht ins deutsche Formular.
  it("liefert keine englischen KI-Anweisungen ins Formular", () => {
    const texte = [
      ...Object.values(SUCHOPTIONEN.laufbahngruppeBedeutung),
      ...Object.values(SUCHOPTIONEN.einstiegswegBedeutung),
    ];
    for (const text of texte) {
      expect(text).not.toMatch(/bucket|posting|do not/i);
    }
  });
});
