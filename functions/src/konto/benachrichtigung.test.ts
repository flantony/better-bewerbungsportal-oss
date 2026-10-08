import { describe, it, expect } from "vitest";
import {
  MAX_GEMELDET,
  MAX_STELLEN_JE_MAIL,
  fortschreiben,
  hatSuchprofil,
  naechsterBenachrichtigungsStand,
  neueTreffer,
  tokenPasst,
} from "./benachrichtigung";
import type { BenachrichtigungsZustand, Kandidat } from "./benachrichtigung";

describe("neueTreffer", () => {
  it("nimmt nur Stellen, deren firstSeenAt STRIKT nach seitMs liegt", () => {
    const seitMs = 1000;
    const kandidaten: Kandidat[] = [
      { pinstGuid: "genau-seitMs", firstSeenAtMs: 1000 },
      { pinstGuid: "danach", firstSeenAtMs: 1001 },
      { pinstGuid: "davor", firstSeenAtMs: 999 },
    ];
    const treffer = neueTreffer(kandidaten, seitMs, []);
    expect(treffer.map((t) => t.pinstGuid)).toEqual(["danach"]);
  });

  it("laesst eine schon gemeldete Stelle draussen, auch wenn firstSeenAt neuer ist (Wiederausschreibung gleicher ID)", () => {
    const kandidaten: Kandidat[] = [{ pinstGuid: "schon-gemeldet", firstSeenAtMs: 5000 }];
    const treffer = neueTreffer(kandidaten, 1000, ["schon-gemeldet"]);
    expect(treffer).toEqual([]);
  });

  it("sortiert neueste zuerst", () => {
    const kandidaten: Kandidat[] = [
      { pinstGuid: "aelter", firstSeenAtMs: 2000 },
      { pinstGuid: "neuer", firstSeenAtMs: 3000 },
    ];
    const treffer = neueTreffer(kandidaten, 1000, []);
    expect(treffer.map((t) => t.pinstGuid)).toEqual(["neuer", "aelter"]);
  });

  it("gibt eine leere Liste, wenn nichts neu ist", () => {
    expect(neueTreffer([], 1000, [])).toEqual([]);
  });
});

describe("fortschreiben", () => {
  it("haengt Neues vorne an", () => {
    expect(fortschreiben(["b", "a"], ["c"])).toEqual(["c", "b", "a"]);
  });

  it("entfernt Duplikate - eine bereits gemeldete Stelle steht danach nur einmal, vorne", () => {
    expect(fortschreiben(["a", "b"], ["b"])).toEqual(["b", "a"]);
  });

  it("MAX_GEMELDET ist 4000 - genug fuer Wochen eines breiten Profils, ~160 KB je Dokument", () => {
    expect(MAX_GEMELDET).toBe(4000);
  });

  it("kuerzt bei Ueberlaenge auf MAX_GEMELDET und behaelt die neuesten", () => {
    const alt = Array.from({ length: 4000 }, (_, i) => `alt-${i}`);
    const neu = ["frisch"];
    const ergebnis = fortschreiben(alt, neu);
    expect(ergebnis.length).toBe(MAX_GEMELDET);
    expect(ergebnis[0]).toBe("frisch");
    // Das aelteste Element (alt-3999, ganz hinten in `alt`) faellt heraus.
    expect(ergebnis).not.toContain("alt-3999");
    expect(ergebnis).toContain("alt-3998");
    expect(ergebnis).toContain("alt-0");
  });
});

describe("tokenPasst", () => {
  it("ist false, wenn der erwartete Wert fehlt", () => {
    expect(tokenPasst(undefined, "x")).toBe(false);
  });

  it("ist false, wenn der erhaltene Wert fehlt", () => {
    expect(tokenPasst("abc", undefined)).toBe(false);
  });

  it("ist false bei unterschiedlicher Laenge", () => {
    expect(tokenPasst("abc", "ab")).toBe(false);
  });

  it("ist false bei gleicher Laenge, aber unterschiedlichem Inhalt", () => {
    expect(tokenPasst("abc", "abd")).toBe(false);
  });

  it("ist true bei gleichem Wert", () => {
    expect(tokenPasst("geheimestoken", "geheimestoken")).toBe(true);
  });

  it("ist false, wenn beide leer sind", () => {
    expect(tokenPasst("", "")).toBe(false);
  });
});

describe("MAX_STELLEN_JE_MAIL", () => {
  it("ist 10", () => {
    expect(MAX_STELLEN_JE_MAIL).toBe(10);
  });
});

/**
 * WOZU: das ist die einzige Stelle, die entscheidet, ob ein Wiedereinschalten
 * alte Treffer nachmeldet oder ein neuer Abbestell-Link noetig wird - ein
 * Fehler hier fuehrt entweder zu einer Mail-Flut oder zu einem toten Link.
 */
describe("naechsterBenachrichtigungsStand", () => {
  it("legt beim ersten Einschalten Token, seit, letzteAm und gemeldet frisch an", () => {
    expect(naechsterBenachrichtigungsStand(undefined, true, 1000, "neues-token")).toEqual({
      aktiv: true,
      abmeldeToken: "neues-token",
      seitMs: 1000,
      letzteAmMs: null,
      gemeldet: [],
    });
  });

  it("legt auch bei aktiv:false ohne Vorzustand ein volles Objekt an", () => {
    expect(naechsterBenachrichtigungsStand(undefined, false, 1000, "neues-token")).toEqual({
      aktiv: false,
      abmeldeToken: "neues-token",
      seitMs: 1000,
      letzteAmMs: null,
      gemeldet: [],
    });
  });

  it("Ausschalten behaelt Token, seit, letzteAm und gemeldet", () => {
    const alt: BenachrichtigungsZustand = {
      aktiv: true,
      abmeldeToken: "t1",
      seitMs: 500,
      letzteAmMs: 800,
      gemeldet: ["a"],
    };
    expect(naechsterBenachrichtigungsStand(alt, false, 2000, "ungenutzt")).toEqual({ ...alt, aktiv: false });
  });

  it("Wiedereinschalten erneuert seit, behaelt Token und gemeldete Stellen (keine Nachmeldung)", () => {
    const alt: BenachrichtigungsZustand = {
      aktiv: false,
      abmeldeToken: "t1",
      seitMs: 500,
      letzteAmMs: 800,
      gemeldet: ["a"],
    };
    expect(naechsterBenachrichtigungsStand(alt, true, 3000, "ungenutzt")).toEqual({
      ...alt,
      aktiv: true,
      seitMs: 3000,
    });
  });
});

// WOZU: ein Profil ohne einschraenkenden Wert ist in queryJobs
// "alle Stellen" - ein solches Konto bekaeme jede Nacht die neuesten Stellen
// des gesamten Bestands. Dieselbe Regel wie schraenktEin im Web.
describe("hatSuchprofil", () => {
  it("ist false fuer null und undefined", () => {
    expect(hatSuchprofil(null)).toBe(false);
    expect(hatSuchprofil(undefined)).toBe(false);
  });

  it("ist false fuer ein leeres Objekt", () => {
    expect(hatSuchprofil({})).toBe(false);
  });

  it("ist false, wenn nur leere Listen, leere Texte oder undefined gesetzt sind", () => {
    expect(hatSuchprofil({ bundesland: [], wunschort: "", suchbegriff: undefined })).toBe(false);
  });

  it("ist true, sobald ein Feld einen nicht-leeren Wert hat", () => {
    expect(hatSuchprofil({ wunschort: "Köln" })).toBe(true);
    expect(hatSuchprofil({ bundesland: ["Bayern"], wunschort: "" })).toBe(true);
    expect(hatSuchprofil({ mindestbesoldung: 9 })).toBe(true);
  });

  // Das Formular setzt taetigkeitsbereich/beschaeftigungsumfang
  // standardmaessig auf 'beide' - "Speichern" ohne Auswahl ergibt ein Profil,
  // das gesetzt aussieht, in queryJobs aber keine Bedingung erzeugt.
  it("ignoriert Werte, die in queryJobs keine Bedingung erzeugen", () => {
    expect(hatSuchprofil({ taetigkeitsbereich: "beide", beschaeftigungsumfang: "beide", seiteneinstieg: false })).toBe(
      false,
    );
    expect(hatSuchprofil({ besoldungstabelle: "E" })).toBe(false);
    expect(hatSuchprofil({ suchbegriff: "   ", wunschort: " " })).toBe(false);
  });

  it("zaehlt einschraenkende Werte dieser Felder als gesetzt", () => {
    expect(hatSuchprofil({ bundesland: ["Bayern"] })).toBe(true);
    expect(hatSuchprofil({ taetigkeitsbereich: "zivil" })).toBe(true);
    expect(hatSuchprofil({ beschaeftigungsumfang: "teilzeit" })).toBe(true);
    expect(hatSuchprofil({ seiteneinstieg: true })).toBe(true);
    expect(hatSuchprofil({ besoldungstabelle: "E", mindestbesoldung: 9 })).toBe(true);
  });
});
