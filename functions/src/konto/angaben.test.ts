import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  ANGABEN_TEXT_VERSION,
  KONTO_ANGABEN_SCHEMA_VERSION,
  angabenExportSicht,
  angabenSchema,
  angabenSicht,
  geburtsdatumLabel,
  naechsterAngabenStand,
  pruefeAngabenAnfrage,
  widerrufeStaatsangehoerigkeit,
  type AngabenRecord,
} from "./angaben";

const JETZT = Date.UTC(2026, 8, 26); // 2026-09-26

describe("angabenSchema", () => {
  it("nimmt gueltige Angaben", () => {
    expect(
      angabenSchema.safeParse({
        nachname: "Mustermann",
        vorname: "Max",
        geburtsdatum: "1998-03-12",
        telefon: "0123 456789",
        email: "max@example.com",
        geburtsort: "Köln",
        strasse: "Musterweg 1",
        plz: "12345",
        ort: "Köln",
        staatsangehoerigkeit: "deutsch",
        studienabschluss: "Bachelor",
        fuehrerschein: "B",
      }).success,
    ).toBe(true);
  });

  it("lehnt eine PLZ mit vier Ziffern ab", () => {
    expect(angabenSchema.safeParse({ plz: "1234" }).success).toBe(false);
  });

  it("lehnt ein unbekanntes Feld ab (strict)", () => {
    expect(angabenSchema.safeParse({ irgendwas: "x" }).success).toBe(false);
  });

  it("nimmt ein leeres Objekt (alle Felder optional)", () => {
    expect(angabenSchema.safeParse({}).success).toBe(true);
  });

  it("nimmt einen leeren String je Feld (Entfernen-Signal)", () => {
    expect(angabenSchema.safeParse({ plz: "", email: "", geburtsdatum: "" }).success).toBe(true);
  });

  it("lehnt ein unmoegliches Kalenderdatum ab", () => {
    expect(angabenSchema.safeParse({ geburtsdatum: "2024-02-30" }).success).toBe(false);
  });
});

describe("pruefeAngabenAnfrage", () => {
  it("nimmt gueltige Angaben ohne Staatsangehoerigkeit an", () => {
    const ergebnis = pruefeAngabenAnfrage({ nachname: "Mustermann" }, null, JETZT);
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) expect(ergebnis.wert).toEqual({ angaben: { nachname: "Mustermann" }, einwilligungNeu: false });
  });

  it("lehnt eine PLZ mit vier Ziffern ab", () => {
    expect(pruefeAngabenAnfrage({ plz: "1234" }, null, JETZT).ok).toBe(false);
  });

  it("lehnt ein Geburtsdatum in der Zukunft ab", () => {
    const ergebnis = pruefeAngabenAnfrage({ geburtsdatum: "2099-01-01" }, null, JETZT);
    expect(ergebnis.ok).toBe(false);
  });

  it("nimmt ein Geburtsdatum in der Vergangenheit an", () => {
    expect(pruefeAngabenAnfrage({ geburtsdatum: "1998-03-12" }, null, JETZT).ok).toBe(true);
  });

  it("lehnt ein unbekanntes Feld ab (strict)", () => {
    expect(pruefeAngabenAnfrage({ irgendwas: "x" }, null, JETZT).ok).toBe(false);
  });

  it("lehnt Staatsangehoerigkeit ohne Einwilligung ab", () => {
    const ergebnis = pruefeAngabenAnfrage({ staatsangehoerigkeit: "deutsch" }, null, JETZT);
    expect(ergebnis.ok).toBe(false);
  });

  it("nimmt Staatsangehoerigkeit mit Einwilligung in der Anfrage an und setzt einwilligungNeu", () => {
    const ergebnis = pruefeAngabenAnfrage(
      { staatsangehoerigkeit: "deutsch", einwilligung: { textVersion: ANGABEN_TEXT_VERSION } },
      null,
      JETZT,
    );
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) expect(ergebnis.wert.einwilligungNeu).toBe(true);
  });

  it("nimmt Staatsangehoerigkeit mit bestehender Einwilligung ohne neue Einwilligung an", () => {
    const bestehend: AngabenRecord = {
      schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
      angaben: {},
      einwilligungStaatsangehoerigkeit: { erteiltAm: Timestamp.fromMillis(0), textVersion: ANGABEN_TEXT_VERSION },
      geaendertAm: Timestamp.fromMillis(0),
    };
    const ergebnis = pruefeAngabenAnfrage({ staatsangehoerigkeit: "deutsch" }, bestehend, JETZT);
    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) expect(ergebnis.wert.einwilligungNeu).toBe(false);
  });

  it("lehnt eine falsche textVersion ab", () => {
    const ergebnis = pruefeAngabenAnfrage(
      { staatsangehoerigkeit: "deutsch", einwilligung: { textVersion: "irgendeine-andere" } },
      null,
      JETZT,
    );
    expect(ergebnis.ok).toBe(false);
  });

  it("erlaubt das Entfernen der Staatsangehoerigkeit ohne Einwilligung", () => {
    const ergebnis = pruefeAngabenAnfrage({ staatsangehoerigkeit: "" }, null, JETZT);
    expect(ergebnis.ok).toBe(true);
  });
});

describe("naechsterAngabenStand", () => {
  it("legt einen neuen Stand an, wenn noch keiner existiert", () => {
    const stand = naechsterAngabenStand(null, { angaben: { nachname: "Mustermann" }, einwilligungNeu: false }, JETZT);
    expect(stand.angaben).toEqual({ nachname: "Mustermann" });
    expect(stand.einwilligungStaatsangehoerigkeit).toBeNull();
    expect(stand.geaendertAm.toMillis()).toBe(JETZT);
  });

  it("ersetzt ein Feld und laesst nicht gesendete Felder stehen", () => {
    const alt: AngabenRecord = {
      schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
      angaben: { nachname: "Alt", vorname: "Bleibt" },
      einwilligungStaatsangehoerigkeit: null,
      geaendertAm: Timestamp.fromMillis(0),
    };
    const stand = naechsterAngabenStand(alt, { angaben: { nachname: "Neu" }, einwilligungNeu: false }, JETZT);
    expect(stand.angaben).toEqual({ nachname: "Neu", vorname: "Bleibt" });
  });

  it("entfernt ein Feld, wenn ein leerer String gesendet wird", () => {
    const alt: AngabenRecord = {
      schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
      angaben: { nachname: "Alt", vorname: "Bleibt" },
      einwilligungStaatsangehoerigkeit: null,
      geaendertAm: Timestamp.fromMillis(0),
    };
    const stand = naechsterAngabenStand(alt, { angaben: { nachname: "" }, einwilligungNeu: false }, JETZT);
    expect(stand.angaben).toEqual({ vorname: "Bleibt" });
  });

  it("setzt einen frischen Einwilligungsvermerk bei einwilligungNeu", () => {
    const stand = naechsterAngabenStand(
      null,
      { angaben: { staatsangehoerigkeit: "deutsch" }, einwilligungNeu: true },
      JETZT,
    );
    expect(stand.einwilligungStaatsangehoerigkeit).toEqual({
      erteiltAm: Timestamp.fromMillis(JETZT),
      textVersion: ANGABEN_TEXT_VERSION,
    });
  });

  it("laesst einen bestehenden Vermerk stehen, wenn der Wert entfernt wird (kein Widerruf)", () => {
    const alt: AngabenRecord = {
      schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
      angaben: { staatsangehoerigkeit: "deutsch" },
      einwilligungStaatsangehoerigkeit: { erteiltAm: Timestamp.fromMillis(0), textVersion: ANGABEN_TEXT_VERSION },
      geaendertAm: Timestamp.fromMillis(0),
    };
    const stand = naechsterAngabenStand(
      alt,
      { angaben: { staatsangehoerigkeit: "" }, einwilligungNeu: false },
      JETZT,
    );
    expect(stand.angaben).toEqual({});
    expect(stand.einwilligungStaatsangehoerigkeit).toEqual({
      erteiltAm: Timestamp.fromMillis(0),
      textVersion: ANGABEN_TEXT_VERSION,
    });
  });
});

describe("widerrufeStaatsangehoerigkeit", () => {
  it("entfernt Feld und Vermerk", () => {
    const alt: AngabenRecord = {
      schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
      angaben: { nachname: "Bleibt", staatsangehoerigkeit: "deutsch" },
      einwilligungStaatsangehoerigkeit: { erteiltAm: Timestamp.fromMillis(0), textVersion: ANGABEN_TEXT_VERSION },
      geaendertAm: Timestamp.fromMillis(0),
    };
    const stand = widerrufeStaatsangehoerigkeit(alt);
    expect(stand.angaben).toEqual({ nachname: "Bleibt" });
    expect(stand.einwilligungStaatsangehoerigkeit).toBeNull();
  });
});

describe("geburtsdatumLabel", () => {
  it("wandelt ISO in die Formularschreibweise", () => {
    expect(geburtsdatumLabel("1998-03-12")).toBe("12.03.1998");
  });
});

describe("angabenSicht", () => {
  it("liefert leere Angaben ohne Einwilligungsvermerk, wenn nichts gespeichert ist", () => {
    expect(angabenSicht(null)).toEqual({ angaben: {}, staatsangehoerigkeitEingewilligtAm: null });
  });

  it("uebernimmt gespeicherte Angaben ohne Staatsangehoerigkeit", () => {
    const record: AngabenRecord = {
      schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
      angaben: { nachname: "Mustermann" },
      einwilligungStaatsangehoerigkeit: null,
      geaendertAm: Timestamp.fromMillis(0),
    };
    expect(angabenSicht(record)).toEqual({ angaben: { nachname: "Mustermann" }, staatsangehoerigkeitEingewilligtAm: null });
  });

  it("liefert den Einwilligungszeitpunkt als ISO-String", () => {
    const record: AngabenRecord = {
      schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
      angaben: { staatsangehoerigkeit: "deutsch" },
      einwilligungStaatsangehoerigkeit: { erteiltAm: Timestamp.fromMillis(JETZT), textVersion: ANGABEN_TEXT_VERSION },
      geaendertAm: Timestamp.fromMillis(JETZT),
    };
    expect(angabenSicht(record).staatsangehoerigkeitEingewilligtAm).toBe(new Date(JETZT).toISOString());
  });
});

/**
 * WOZU: der Export braucht zusaetzlich die
 * Versionskennung des Einwilligungstexts neben dem Zeitpunkt - sonst laesst
 * sich spaeter nicht mehr nachvollziehen, welchem Text genau zugestimmt wurde.
 */
describe("angabenExportSicht", () => {
  it("liefert staatsangehoerigkeitTextVersion:null, wenn nichts gespeichert ist", () => {
    expect(angabenExportSicht(null)).toEqual({
      angaben: {},
      staatsangehoerigkeitEingewilligtAm: null,
      staatsangehoerigkeitTextVersion: null,
    });
  });

  it("liefert Zeitpunkt UND Textversion, wenn eine Einwilligung vorliegt", () => {
    const record: AngabenRecord = {
      schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION,
      angaben: { staatsangehoerigkeit: "deutsch" },
      einwilligungStaatsangehoerigkeit: { erteiltAm: Timestamp.fromMillis(JETZT), textVersion: ANGABEN_TEXT_VERSION },
      geaendertAm: Timestamp.fromMillis(JETZT),
    };
    const sicht = angabenExportSicht(record);
    expect(sicht.staatsangehoerigkeitEingewilligtAm).toBe(new Date(JETZT).toISOString());
    expect(sicht.staatsangehoerigkeitTextVersion).toBe(ANGABEN_TEXT_VERSION);
  });
});
