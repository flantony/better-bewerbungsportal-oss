import { describe, expect, it } from "vitest";
import {
  ANGABEN_SCHLUESSEL,
  angabenFuerVariante,
  buildFieldMapForVariant,
  detectBewerbungsbogenVariant,
  vonHandZuErgaenzen,
  type BewerbungsbogenFillValues,
  type BewerbungsbogenVariant,
} from "./fillBewerbungsbogen";

function values(overrides: Partial<BewerbungsbogenFillValues> = {}): BewerbungsbogenFillValues {
  return {
    nachname: "Musterfrau",
    vorname: "Erika",
    telefon: "+49 151 12345678",
    email: "erika@example.com",
    geburtsdatumLabel: "12.03.1998",
    geburtsort: "Berlin",
    strasse: "Musterstraße 12",
    plz: "10115",
    ort: "Berlin",
    ausschreibungId: "SE_GEO_Offz_2026-01-E",
    ausschreibungTitel: "Testausschreibung",
    ...overrides,
  };
}

/** Nur die drei Angaben, die jede Vorlage kennt - der Rest ist vorlagenabhängig. */
function nurKernangaben(): BewerbungsbogenFillValues {
  return {
    nachname: "Musterfrau",
    vorname: "Erika",
    geburtsdatumLabel: "12.03.1998",
    ausschreibungId: "SE_GEO_Offz_2026-01-E",
    ausschreibungTitel: "Testausschreibung",
  };
}

const ALLE_VARIANTEN: BewerbungsbogenVariant[] = ["seiteneinstieg-rob", "militaerisch", "karrierebogen-mannschaften"];

describe("detectBewerbungsbogenVariant", () => {
  it("recognizes the Seiteneinstieg/ROB variant", () => {
    expect(detectBewerbungsbogenVariant("Bewerbungsbogen Seiteneinstieg und ROB ab GEWET 2027 17.07.2026")).toBe(
      "seiteneinstieg-rob",
    );
  });

  it("recognizes the militärisch variant", () => {
    expect(detectBewerbungsbogenVariant("Bewerbungsbogen_Militärisch")).toBe("militaerisch");
  });

  it("recognizes the Karrierebogen Mannschaften variant", () => {
    expect(detectBewerbungsbogenVariant("Karrierebogen für die Laufbahnen der Mannschaften bis Feldwebel")).toBe(
      "karrierebogen-mannschaften",
    );
  });

  it("is case-insensitive", () => {
    expect(detectBewerbungsbogenVariant("BEWERBUNGSBOGEN_MILITÄRISCH")).toBe("militaerisch");
  });

  it("returns null for an unrecognized attHeader instead of guessing", () => {
    expect(detectBewerbungsbogenVariant("Irgendein anderes Formular")).toBeNull();
  });
});

describe("buildFieldMapForVariant - seiteneinstieg-rob", () => {
  it("maps every core field to its known AcroForm field name", () => {
    const map = buildFieldMapForVariant("seiteneinstieg-rob", values());
    expect(map.Nachname).toBe("Musterfrau");
    expect(map.Vorname).toBe("Erika");
    expect(map.Handy).toBe("+49 151 12345678");
    expect(map.Mail).toBe("erika@example.com");
    expect(map["Geb-Datum"]).toBe("12.03.1998");
    expect(map.Hauptwohnsitz).toBe("Musterstraße 12, 10115 Berlin");
    expect(map.Plz).toBe("10115");
    expect(map["ID 1"]).toBe("SE_GEO_Offz_2026-01-E");
    expect(map["Titel/Überschrift"]).toBe("Testausschreibung");
  });

  it("omits Staatsa when staatsangehoerigkeit is not provided", () => {
    expect(buildFieldMapForVariant("seiteneinstieg-rob", values())).not.toHaveProperty("Staatsa");
  });

  it("includes Staatsa only when staatsangehoerigkeit is explicitly provided", () => {
    const map = buildFieldMapForVariant("seiteneinstieg-rob", values({ staatsangehoerigkeit: "Deutsch" }));
    expect(map.Staatsa).toBe("Deutsch");
  });
});

describe("buildFieldMapForVariant - militaerisch", () => {
  it("maps core fields to the real field names of this variant (not the seiteneinstieg-rob names)", () => {
    const map = buildFieldMapForVariant("militaerisch", values());
    expect(map.Nachname).toBe("Musterfrau");
    expect(map.Vorname).toBe("Erika");
    // Ins Feld "Telefon", nicht "Mobiltelefon": eine allgemeine Rufnummer ist im
    // Telefonfeld immer richtig, eine Festnetznummer im Mobilfeld nicht
    // (Feldnamen des Vordrucks Bw-2053).
    expect(map.Telefon).toBe("+49 151 12345678");
    expect(map).not.toHaveProperty("Mobiltelefon");
    expect(map.EMail).toBe("erika@example.com");
    expect(map.Geburtsdatum).toBe("12.03.1998");
    expect(map.Geburtsort).toBe("Berlin");
    expect(map.Straße_Hausnummer).toBe("Musterstraße 12");
    expect(map.PLZ).toBe("10115");
    expect(map.Ort).toBe("Berlin");
    // This variant has no job-reference field at all.
    expect(map).not.toHaveProperty("ID 1");
    expect(map).not.toHaveProperty("Titel/Überschrift");
  });

  it("includes the current nationality field only when provided, never the 'frühere' variants", () => {
    const map = buildFieldMapForVariant("militaerisch", values({ staatsangehoerigkeit: "Deutsch" }));
    expect(map["Staatsangehörigkeit_1"]).toBe("Deutsch");
    expect(map).not.toHaveProperty("Staatsangehörigkeit_2");
    expect(map).not.toHaveProperty("Staatsangehörigkeit_3");
  });

  it("maps studienabschluss and fuehrerschein only when provided", () => {
    expect(buildFieldMapForVariant("militaerisch", values())).not.toHaveProperty("Akademischer Grad");
    const map = buildFieldMapForVariant(
      "militaerisch",
      values({ studienabschluss: "Bachelor of Arts", fuehrerschein: "Klasse B" }),
    );
    expect(map["Akademischer Grad"]).toBe("Bachelor of Arts");
    expect(map["Führerschein Klassen zivil freiwillig"]).toBe("Klasse B");
  });
});

/**
 * WOZU: Wer stur alle zwölf Eingaben von `fill_bewerbungsbogen` abfragt, lässt
 * den Bewerber beim Karrierebogen sechs Angaben heraussuchen, die in keinem Feld
 * landen. Diese Auskunft geht über `get_document_requirements` an den Client,
 * BEVOR er fragt - sie muss deshalb pro Variante stimmen.
 */
describe("angabenFuerVariante", () => {
  it("nennt beim Karrierebogen nur Name und Geburtsdatum - Telefon und Adresse hat er nicht", () => {
    const angaben = angabenFuerVariante("karrierebogen-mannschaften");
    expect(angaben.benoetigt).toEqual(["nachname", "vorname", "geburtsdatumLabel"]);
    expect(angaben.optional).toEqual(["studienabschluss"]);
    expect(angaben.nichtVerwendet).toContain("telefon");
    expect(angaben.nichtVerwendet).toContain("strasse");
    expect(angaben.nichtVerwendet).toContain("email");
  });

  it("nennt beim militärischen Bogen alle Kernangaben inklusive Geburtsort", () => {
    const angaben = angabenFuerVariante("militaerisch");
    expect(angaben.benoetigt).toContain("geburtsort");
    expect(angaben.benoetigt).toContain("ort");
    // Staatsangehoerigkeit steht unter den normalen Angaben: der Vordruck hat
    // ein Feld dafuer, und ohne die Frage danach bliebe es leer.
    expect(angaben.benoetigt).toContain("staatsangehoerigkeit");
    expect(angaben.optional).toEqual(["studienabschluss", "fuehrerschein"]);
    expect(angaben.nichtVerwendet).toEqual([]);
  });

  it("erkennt die zusammengesetzte Adresse des Seiteneinstieg-Bogens als verwendet", () => {
    // Strasse/PLZ/Ort landen dort in EINEM Feld (Hauptwohnsitz) - die Ableitung
    // muss sie trotzdem einzeln als verwendet ausweisen.
    const angaben = angabenFuerVariante("seiteneinstieg-rob");
    expect(angaben.optional).toEqual([]);
    expect(angaben.benoetigt).toContain("strasse");
    expect(angaben.benoetigt).toContain("plz");
    expect(angaben.benoetigt).toContain("ort");
    // Ein Geburtsortfeld hat diese Vorlage dagegen nicht.
    expect(angaben.nichtVerwendet).toContain("geburtsort");
  });

  it("ordnet jede Angabe jeder Variante genau einer Gruppe zu", () => {
    for (const variant of ALLE_VARIANTEN) {
      const { benoetigt, optional, nichtVerwendet } = angabenFuerVariante(variant);
      expect([...benoetigt, ...optional, ...nichtVerwendet].sort()).toEqual([...ANGABEN_SCHLUESSEL].sort());
    }
  });

  it("nennt staatsangehoerigkeit genau dort, wo die Vorlage ein Feld dafuer hat", () => {
    expect(angabenFuerVariante("militaerisch").benoetigt).toContain("staatsangehoerigkeit");
    expect(angabenFuerVariante("seiteneinstieg-rob").benoetigt).toContain("staatsangehoerigkeit");
    // Der Karrierebogen hat keines - dort bleibt die Frage zu Recht aus.
    expect(angabenFuerVariante("karrierebogen-mannschaften").nichtVerwendet).toContain("staatsangehoerigkeit");
  });
});

describe("buildFieldMapForVariant - fehlende optionale Kernangaben", () => {
  it("schreibt keine Satzzeichen-Reste ins Adressfeld, wenn die Adresse fehlt", () => {
    const map = buildFieldMapForVariant("seiteneinstieg-rob", nurKernangaben());
    expect(map).not.toHaveProperty("Hauptwohnsitz");
    expect(map).not.toHaveProperty("Plz");
    expect(Object.values(map)).not.toContain(", ");
  });

  it("lässt beim militärischen Bogen genau die fehlenden Felder weg", () => {
    const map = buildFieldMapForVariant("militaerisch", nurKernangaben());
    expect(map).toEqual({ Nachname: "Musterfrau", Vorname: "Erika", Geburtsdatum: "12.03.1998" });
  });

  it("setzt eine teilweise vorhandene Adresse zusammen, ohne die Lücke zu erfinden", () => {
    const map = buildFieldMapForVariant("seiteneinstieg-rob", { ...nurKernangaben(), plz: "10115", ort: "Berlin" });
    expect(map.Hauptwohnsitz).toBe("10115 Berlin");
  });
});

describe("buildFieldMapForVariant - karrierebogen-mannschaften", () => {
  it("fills only the repeated header block, nothing else", () => {
    const map = buildFieldMapForVariant("karrierebogen-mannschaften", values());
    expect(map).toEqual({
      Nachname: "Musterfrau",
      Vorname: "Erika",
      Personenkennziffer: "12.03.1998",
    });
  });

  it("uses the Personenkennziffer field as the form's own documented birthdate fallback", () => {
    const map = buildFieldMapForVariant("karrierebogen-mannschaften", values({ geburtsdatumLabel: "01.01.2000" }));
    expect(map.Personenkennziffer).toBe("01.01.2000");
  });

  it("includes Akademischer Grad only when studienabschluss is provided", () => {
    const map = buildFieldMapForVariant("karrierebogen-mannschaften", values({ studienabschluss: "Master of Science" }));
    expect(map["Akademischer Grad"]).toBe("Master of Science");
  });

  it("never fills career-preference checkboxes or legal declaration fields", () => {
    const map = buildFieldMapForVariant("karrierebogen-mannschaften", values());
    expect(Object.keys(map)).toEqual(["Nachname", "Vorname", "Personenkennziffer"]);
  });
});

/**
 * WOZU: Der militaerische Bogen kommt mit leerer Laufbahn-Auswahl, leerem
 * Geschlecht, leerer Anrede und leeren Staat-Feldern heraus. Sagt der
 * Merkzettel dann nur "unterschreiben", reicht der Bewerber ein
 * unvollstaendiges amtliches Formular ein, ohne es zu merken.
 * Die Feldliste folgt den Vordrucken (Bw-2053, Seiteneinstieg/ROB).
 */
describe("vonHandZuErgaenzen", () => {
  const ohneLuecken = { fehlendeAngaben: [], laufbahngruppen: [] };

  it("nennt beim militaerischen Bogen die Laufbahn-Auswahl als EINE Zeile mit allen Kaestchen", () => {
    const felder = vonHandZuErgaenzen("militaerisch", ohneLuecken);
    const laufbahn = felder.filter((zeile) => /Laufbahn/.test(zeile));
    expect(laufbahn).toHaveLength(1);
    const kaestchen = ["Freiwilliger Wehrdienst", "Soldat auf Zeit (Kurz)", "Mannschaften", "Unteroffiziere"];
    for (const name of [...kaestchen, "Feldwebel", "Offiziere"]) {
      expect(laufbahn[0]).toContain(name);
    }
  });

  it("haengt die Laufbahngruppe der Ausschreibung als Hinweis an, nicht als Entscheidung", () => {
    const felder = vonHandZuErgaenzen("militaerisch", { fehlendeAngaben: [], laufbahngruppen: ["Feldwebel"] });
    expect(felder.find((zeile) => /Laufbahn/.test(zeile))).toMatch(/laut Ausschreibung: Feldwebel/);
  });

  it("nennt keine Laufbahngruppe, die der Bogen gar nicht zum Ankreuzen hat", () => {
    const felder = vonHandZuErgaenzen("militaerisch", { fehlendeAngaben: [], laufbahngruppen: ["Gehobener Dienst"] });
    expect(felder.join("\n")).not.toMatch(/laut Ausschreibung/);
  });

  it("nennt beim militaerischen Bogen die Felder, die wir nie fuellen", () => {
    const text = vonHandZuErgaenzen("militaerisch", ohneLuecken).join("\n");
    expect(text).toMatch(/Geschlecht/);
    expect(text).toMatch(/Anrede/);
    expect(text).toMatch(/Staat/);
    expect(text).toMatch(/Teil B/);
    expect(text).toMatch(/Teil C/);
  });

  it("nennt die Angaben, die beim Ausfuellen fehlten, mit dem Feldnamen des Vordrucks", () => {
    const felder = vonHandZuErgaenzen("militaerisch", { fehlendeAngaben: ["telefon", "plz"], laufbahngruppen: [] });
    const text = felder.join("\n");
    expect(text).toMatch(/Telefon/);
    expect(text).toMatch(/PLZ/);
  });

  /**
   * Steht "Staatsangehörigkeit: deutsch" nur im Lebenslauf, bleibt das Feld im
   * Bogen leer (nicht im Konto gespeichert, Art. 9 mit Einwilligung). Aus dem
   * Lebenslauf lesen wir sie bewusst NICHT heraus - also
   * muss die Zeile so deutlich sein, dass sie niemand ueberliest.
   */
  it("stellt eine fehlende Staatsangehoerigkeit als eigene Pflichtzeile an den Anfang", () => {
    const felder = vonHandZuErgaenzen("militaerisch", {
      fehlendeAngaben: ["telefon", "staatsangehoerigkeit"],
      laufbahngruppen: [],
    });
    expect(felder[0]).toBe("Staatsangehörigkeit eintragen (Pflichtangabe auf dem Bogen)");
    const nochLeer = felder.find((zeile) => zeile.startsWith("Noch leer"));
    expect(nochLeer).toMatch(/Telefon/);
    expect(nochLeer).not.toMatch(/Staatsangehörigkeit/);
  });

  it("nennt keine Staatsangehoerigkeits-Zeile, wenn sie eingesetzt wurde", () => {
    const felder = vonHandZuErgaenzen("militaerisch", ohneLuecken);
    expect(felder.join("\n")).not.toMatch(/Staatsangehörigkeit eintragen/);
  });

  // Koeln/Bonn sind bekannt, der Staat nicht sicher - also Handarbeit, aber mit Beispiel.
  it("nennt den Staat bei Wohnsitz und Geburtsort mit Beispiel", () => {
    expect(vonHandZuErgaenzen("militaerisch", ohneLuecken).join("\n")).toMatch(
      /Staat beim Hauptwohnsitz und beim Geburtsort \(z\. B\. Deutschland\)/,
    );
    expect(vonHandZuErgaenzen("seiteneinstieg-rob", ohneLuecken).join("\n")).toMatch(/Staat \(z\. B\. Deutschland\)/);
  });

  it("nennt beim ROB-Bogen die Teile, die nur der Bewerber beantworten kann", () => {
    const text = vonHandZuErgaenzen("seiteneinstieg-rob", ohneLuecken).join("\n");
    expect(text).toMatch(/Soldat auf Zeit|SaZ/);
    expect(text).toMatch(/Verfassungstreue/);
    expect(text).toMatch(/Kriegsdienstverweigerung/);
    expect(text).toMatch(/Geburtsort/);
  });

  it("nennt beim ROB-Bogen eine fehlende Telefonnummer als Mobiltelefon - so heisst das Feld dort", () => {
    const felder = vonHandZuErgaenzen("seiteneinstieg-rob", { fehlendeAngaben: ["telefon"], laufbahngruppen: [] });
    const text = felder.join("\n");
    expect(text).toMatch(/Mobiltelefon/);
  });

  it("nennt beim Karrierebogen die Laufbahnwuensche und die Selbstauskuenfte", () => {
    const kontext = { fehlendeAngaben: [], laufbahngruppen: ["Mannschaften"] };
    const text = vonHandZuErgaenzen("karrierebogen-mannschaften", kontext).join("\n");
    expect(text).toMatch(/Laufbahn/);
    expect(text).toMatch(/laut Ausschreibung: Mannschaften/);
    expect(text).toMatch(/Vorstrafen/);
  });

  it("liefert fuer jede Variante mindestens eine Zeile", () => {
    for (const variante of ALLE_VARIANTEN) expect(vonHandZuErgaenzen(variante, ohneLuecken).length).toBeGreaterThan(0);
  });
});
