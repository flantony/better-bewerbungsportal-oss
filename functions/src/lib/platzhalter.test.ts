import { describe, it, expect } from "vitest";
import { ersetzePlatzhalter, findePlatzhalter } from "./platzhalter";

/**
 * WOZU: Eine fremde KI, die Adresse, Telefon und E-Mail nicht kennt, schreibt
 * "[Adresse]", "[PLZ Ort]", "[Telefon]", "[E-Mail]" in den Briefkopf.
 * Unbehandelt landen sie im Anschreiben-PDF, obwohl das Konto alle Werte hat -
 * ein Bewerber, der nicht genau hinsieht, schickt "[Adresse]" an
 * die Bundeswehr.
 *
 * WICHTIG: existiert absichtlich zweimal (hier und
 * web/src/features/bewerben/lib/platzhalter.ts) mit denselben Testfaellen.
 */
const ANSCHREIBEN = ["Max Beispiel", "[Adresse]", "[PLZ Ort]", "[Telefon]", "[E-Mail]", "", "Köln, [Datum]"].join("\n");

const ANGABEN = {
  vorname: "Max",
  nachname: "Beispiel",
  geburtsdatum: "1990-01-31",
  telefon: "0221 123456",
  email: "max@example.com",
  strasse: "Musterweg 1",
  plz: "50667",
  ort: "Köln",
};

describe("findePlatzhalter", () => {
  it("findet typische Platzhalter eines KI-Entwurfs, in Reihenfolge und ohne Doppelte", () => {
    expect(findePlatzhalter(`${ANSCHREIBEN}\n[Telefon]`)).toEqual([
      "[Adresse]",
      "[PLZ Ort]",
      "[Telefon]",
      "[E-Mail]",
      "[Datum]",
    ]);
  });

  it("haelt Fussnoten, Aufzaehlungszeichen und Auslassungen nicht fuer Platzhalter", () => {
    expect(findePlatzhalter("Siehe [1] und [2a], erledigt [x], offen [ ], gekürzt […] und [...]")).toEqual([]);
  });

  it("haelt einen Markdown-Link nicht fuer einen Platzhalter", () => {
    expect(findePlatzhalter("Mehr dazu [hier](https://example.com).")).toEqual([]);
  });

  it("ignoriert [sic]", () => {
    expect(findePlatzhalter("Er schrieb \"Bewerbunk\" [sic] und [sic!].")).toEqual([]);
  });

  it("findet nichts ueber Zeilenumbrueche hinweg und nichts Ueberlanges", () => {
    expect(findePlatzhalter("[Adresse\nPLZ]")).toEqual([]);
    expect(findePlatzhalter(`[${"a".repeat(41)}]`)).toEqual([]);
    expect(findePlatzhalter(`[${"a".repeat(40)}]`)).toHaveLength(1);
  });

  it("findet auch laengere, unbekannte Platzhalter", () => {
    expect(findePlatzhalter("Sehr geehrte/r [Name der Ansprechperson],")).toEqual(["[Name der Ansprechperson]"]);
  });
});

describe("ersetzePlatzhalter", () => {
  it("setzt die bekannten Platzhalter aus den Angaben ein und laesst unbekannte stehen", () => {
    const ergebnis = ersetzePlatzhalter(ANSCHREIBEN, ANGABEN);
    expect(ergebnis.text).toBe(
      ["Max Beispiel", "Musterweg 1", "50667 Köln", "0221 123456", "max@example.com", "", "Köln, [Datum]"].join("\n"),
    );
    expect(ergebnis.ersetzt).toEqual(["[Adresse]", "[PLZ Ort]", "[Telefon]", "[E-Mail]"]);
    expect(ergebnis.offen).toEqual(["[Datum]"]);
  });

  it("kennt die gaengigen Schreibweisen", () => {
    const text =
      "[Straße] [Straße und Hausnummer] [PLZ und Ort] [PLZ] [Ort] [Telefonnummer] [E-Mail-Adresse] " +
      "[Name] [Vor- und Nachname] [Geburtsdatum]";
    expect(ersetzePlatzhalter(text, ANGABEN).text).toBe(
      "Musterweg 1 Musterweg 1 50667 Köln 50667 Köln 0221 123456 max@example.com Max Beispiel Max Beispiel 31.01.1990",
    );
  });

  it("ist unempfindlich gegen Gross-/Kleinschreibung und Leerraum in der Klammer", () => {
    expect(ersetzePlatzhalter("[ telefon ] [e-mail] [plz ort]", ANGABEN).text).toBe(
      "0221 123456 max@example.com 50667 Köln",
    );
  });

  it("laesst einen bekannten Platzhalter ohne gespeicherten Wert stehen und meldet ihn als offen", () => {
    const ergebnis = ersetzePlatzhalter("[Telefon]\n[Adresse]", { ...ANGABEN, telefon: "" });
    expect(ergebnis.text).toBe("[Telefon]\nMusterweg 1");
    expect(ergebnis.offen).toEqual(["[Telefon]"]);
  });

  it("setzt zusammengesetzte Platzhalter nur ein, wenn alle Teile da sind", () => {
    const ohneOrt = ersetzePlatzhalter("[PLZ Ort] [Name]", { plz: "50667", vorname: "Max" });
    expect(ohneOrt.text).toBe("[PLZ Ort] [Name]");
    expect(ohneOrt.offen).toEqual(["[PLZ Ort]", "[Name]"]);
  });

  // Sonst stuende der Name des Bewerbers in der Anrede.
  it("setzt einen Namen nach einer Anrede nicht ein - dort ist die Ansprechperson gemeint", () => {
    const ergebnis = ersetzePlatzhalter("Sehr geehrte Frau [Name],\nSehr geehrter Herr [Nachname],\n\n[Name]", ANGABEN);
    expect(ergebnis.text).toBe("Sehr geehrte Frau [Name],\nSehr geehrter Herr [Nachname],\n\nMax Beispiel");
    expect(ergebnis.offen).toEqual(["[Name]", "[Nachname]"]);
    expect(ergebnis.ersetzt).toEqual(["[Name]"]);
  });

  it("setzt Name und Ort nicht ein, wo die Ansprechperson oder der Dienstort gemeint ist", () => {
    const text = "Ansprechperson: [Name]\nEinsatzort: [Ort]\n[Ort], den [Datum]";
    expect(ersetzePlatzhalter(text, ANGABEN).text).toBe("Ansprechperson: [Name]\nEinsatzort: [Ort]\nKöln, den [Datum]");
  });

  it("stolpert nicht ueber Namen aus dem Objekt-Prototyp", () => {
    expect(ersetzePlatzhalter("[constructor] [toString]", ANGABEN).text).toBe("[constructor] [toString]");
  });

  it("ersetzt jedes Vorkommen", () => {
    expect(ersetzePlatzhalter("[Ort], den [Datum] - [Ort]", ANGABEN).text).toBe("Köln, den [Datum] - Köln");
  });

  it("aendert nichts ohne Angaben", () => {
    const ergebnis = ersetzePlatzhalter(ANSCHREIBEN, {});
    expect(ergebnis.text).toBe(ANSCHREIBEN);
    expect(ergebnis.ersetzt).toEqual([]);
    expect(ergebnis.offen).toHaveLength(5);
  });
});
