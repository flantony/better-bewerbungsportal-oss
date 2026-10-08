import { describe, expect, it } from "vitest";
import { z } from "zod/v3";
import {
  beschreibeSuchprofil,
  erstelleSuchprofilLink,
  erstelleSuchprofilLinkInputSchema,
} from "./erstelleSuchprofilLink";
import { dekodiereSuchprofile, SuchprofilLinkFehler } from "../../lib/suchprofilLink";
import { suchprofilSchema } from "../../konto/kontoTypen";
import { listJobsInputSchema } from "./listJobs";

const eingabe = z.object(erstelleSuchprofilLinkInputSchema).strict();

describe("erstelle_suchprofil_link — Eingabe", () => {
  it("nimmt einen list_jobs-Filter unveraendert an", () => {
    expect(
      eingabe.safeParse({
        filter: [{ suchbegriff: "IT", bundesland: ["Bayern"], laufbahngruppe: ["Feldwebel"], mindestbesoldung: 9 }],
      }).success,
    ).toBe(true);
  });

  it("kennt je Filter genau die Felder des Suchprofils", () => {
    const element = erstelleSuchprofilLinkInputSchema.filter.element;
    const shape = (element._def.schema as z.AnyZodObject).shape;
    expect(Object.keys(shape).sort()).toEqual(Object.keys(suchprofilSchema.shape).sort());
  });

  // Der naheliegende Fehler: den letzten list_jobs-Aufruf samt Alter oder
  // Blaetterposition einsetzen. Das Alter ist eine Bewerberangabe und kommt
  // nie in einen Link.
  it.each([["alter", 35], ["cursor", "abc"], ["limit", 20], ["sortierung", "neueste"]])(
    "lehnt %s im Filter ab und sagt, was stattdessen gilt",
    (feld, wert) => {
      expect(Object.keys(listJobsInputSchema)).toContain(feld);
      const pruefung = eingabe.safeParse({ filter: [{ bundesland: ["Bayern"], [feld]: wert }] });
      expect(pruefung.success).toBe(false);
      expect(pruefung.error?.issues[0].message).toMatch(/minus alter, limit, sortierung and cursor/);
    },
  );

  it("lehnt einen Filter ab, der nichts einschraenkt", () => {
    const pruefung = eingabe.safeParse({ filter: [{ taetigkeitsbereich: "beide" }] });
    expect(pruefung.success).toBe(false);
    expect(pruefung.error?.issues[0].message).toMatch(/narrows nothing/);
  });

  it("lehnt keinen und mehr als zehn Filter ab", () => {
    expect(eingabe.safeParse({ filter: [] }).success).toBe(false);
    const elf = Array.from({ length: 11 }, () => ({ bundesland: ["Bayern"] }));
    expect(eingabe.safeParse({ filter: elf }).success).toBe(false);
  });

  it("lehnt unbekannte Werte und zu lange Namen ab", () => {
    expect(eingabe.safeParse({ filter: [{ bundesland: ["Atlantis"] }] }).success).toBe(false);
    expect(eingabe.safeParse({ filter: [{ bundesland: ["Bayern"] }], namen: ["x".repeat(61)] }).success).toBe(false);
  });

  it("beschreibt jedes Eingabefeld", () => {
    for (const [name, schema] of Object.entries(erstelleSuchprofilLinkInputSchema)) {
      expect(schema.description, name).toBeTruthy();
    }
  });
});

describe("erstelle_suchprofil_link — Ergebnis", () => {
  const ergebnis = erstelleSuchprofilLink({
    filter: [
      { suchbegriff: "IT", wunschort: "Köln", laufbahngruppe: ["Feldwebel"], taetigkeitsbereich: "militaerisch" },
      { vertragsarten: ["Reservedienst"], einstiegswege: ["reserveoffizier"], mindestbesoldung: 11 },
    ],
    namen: ["IT in Köln"],
  });

  it("liefert einen Link auf die Uebernahmeseite, den die Uebernahme wieder liest", () => {
    const [basis, fragment] = ergebnis.link.split("#");
    expect(basis).toBe("https://better-bewerbungsportal.de/suchprofil/uebernehmen");
    const gelesen = dekodiereSuchprofile(fragment);
    expect(gelesen.ok).toBe(true);
    expect(gelesen.ok && gelesen.filter[1]).toEqual({
      vertragsarten: ["Reservedienst"],
      einstiegswege: ["reserveoffizier"],
      mindestbesoldung: 11,
    });
    expect(gelesen.ok && gelesen.namen).toEqual(["IT in Köln", null]);
  });

  it("beschreibt jeden Filter in einer Zeile Klartext", () => {
    expect(ergebnis.filter).toHaveLength(2);
    expect(ergebnis.filter[0]).toMatchObject({ nummer: 1, name: "IT in Köln" });
    expect(ergebnis.filter[0].beschreibung).toBe(
      "Stellentitel enthält „IT“; Ort: Köln; Laufbahngruppe: „Feldwebel“; nur militärische Stellen",
    );
    expect(ergebnis.filter[1].name).toBeUndefined();
    expect(ergebnis.filter[1].beschreibung).toBe(
      "Vertragsart: „Reservedienst“; Einstiegsweg: „Reserveoffizier“; Besoldungsgruppe mindestens A11 (Beamte und Soldaten)",
    );
  });

  // Keine Erklaerung aus dem Gedaechtnis: die Bedeutungen kommen aus den
  // vorhandenen Texten (filterOptions.ts, einstiegsweg.ts).
  it("gibt die vorhandenen Bedeutungstexte mit", () => {
    expect(ergebnis.filter[0].bedeutungen?.Feldwebel).toMatch(/Hauptschulabschluss/);
    expect(ergebnis.filter[1].bedeutungen?.Reserveoffizier).toMatch(/Reserve/);
  });

  it("traegt einen zweigeteilten Hinweis", () => {
    expect(ergebnis.hinweis.fuerDenBewerber).toBe(
      "Öffne den Link, melde dich an (oder registriere dich kostenlos), prüfe die Filter und speichere sie. Du bekommst nur eine Mail, wenn neue passende Stellen erscheinen.",
    );
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/never a free-text description/);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/nationality/);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/Several narrow filters beat one broad one/);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/bw:\/\/wissen\/laufbahnen/);
    // Bewerberhaelfte zuerst (s. geteilterHinweis).
    expect(Object.keys(ergebnis.hinweis)[0]).toBe("fuerDenBewerber");
  });

  it("lehnt mehr Namen als Filter ab", () => {
    expect(() => erstelleSuchprofilLink({ filter: [{ bundesland: ["Bayern"] }], namen: ["a", "b"] })).toThrow(
      /at most one name per filter/,
    );
  });

  it("meldet einen zu langen Link mit dem Weg heraus und eigener Fehlerklasse", () => {
    const zufall = () =>
      Array.from({ length: 100 }, () => String.fromCharCode(0x4e00 + Math.floor(Math.random() * 20000))).join("");
    const filter = Array.from({ length: 10 }, () => ({ suchbegriff: zufall(), wunschort: zufall() }));
    expect(() => erstelleSuchprofilLink({ filter })).toThrow(SuchprofilLinkFehler);
    expect(() => erstelleSuchprofilLink({ filter })).toThrow(/two calls/);
  });
});

describe("beschreibeSuchprofil", () => {
  it("laesst neutrale Werte weg und nennt die Entgelttabelle", () => {
    expect(
      beschreibeSuchprofil({
        bundesland: ["Bayern", "Hessen"],
        taetigkeitsbereich: "beide",
        beschaeftigungsumfang: "teilzeit",
        mindestbesoldung: 9,
        besoldungstabelle: "E",
        seiteneinstieg: false,
      }),
    ).toBe("Bundesland: „Bayern“, „Hessen“; nur Teilzeit; Entgeltgruppe mindestens E9 (Tarif für zivile Beschäftigte)");
  });

  // Zwei Organisationsbereiche enthalten selbst ein Komma.
  it("setzt Listenwerte in Anfuehrungszeichen", () => {
    expect(beschreibeSuchprofil({ organisationsbereich: ["Ausrüstung, Informationstechnik und Nutzung", "Marine"] })).toBe(
      "Bereich: „Ausrüstung, Informationstechnik und Nutzung“, „Marine“",
    );
  });
});
