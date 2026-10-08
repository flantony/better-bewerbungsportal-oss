import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  MAX_PAKET_BYTES,
  MAX_PAKET_DATEIEN,
  MAX_TEXT_ZEICHEN,
  baueBewerbungsplan,
  baueMappenDokumente,
  feldnamenFuer,
  fuellwerteAus,
  merkzettel,
  paketDateiname,
  pruefeFormularLuecken,
  pruefePaketAnfrage,
  pruefePaketGroesse,
  type Bewerbungsplan,
} from "./bewerbung";
import type { AngabenRecord } from "./angaben";
import type { UnterlageEintrag } from "./unterlagen";
import type { DocumentRequirementsResult } from "../mcp/tools/getDocumentRequirements";
import { vonHandFuerFormulare } from "../mappe/merkzettel";
import { BEWERBUNGSPORTAL_URL } from "../lib/einreichen";
import { AUSWEISKOPIE_HINWEIS } from "../mappe/ausweiskopie";

const STELLE = {
  pinstGuid: "abc123",
  refCode: "2026-XYZ-42",
  titel: "IT-Systemelektroniker (m/w/d)",
  bewerbungsschluss: "2026-12-01",
  bewerbungsschlussText: "2026-12-01",
  aktiv: true,
};

function angaben(werte: Partial<AngabenRecord["angaben"]>, einwilligung = false): AngabenRecord {
  return {
    schemaVersion: "konto-angaben-v1",
    angaben: werte as AngabenRecord["angaben"],
    einwilligungStaatsangehoerigkeit: einwilligung
      ? { erteiltAm: Timestamp.fromMillis(0), textVersion: "staatsangehoerigkeit-v1" }
      : null,
    geaendertAm: Timestamp.fromMillis(0),
  };
}

function unterlage(over: Partial<UnterlageEintrag> = {}): UnterlageEintrag {
  return {
    docId: "u1",
    art: "lebenslauf",
    dateiname: "lebenslauf.pdf",
    contentType: "application/pdf",
    sizeBytes: 1000,
    hochgeladenAm: Timestamp.fromMillis(0),
    ...over,
  };
}

function anforderungen(over: Partial<DocumentRequirementsResult> = {}): DocumentRequirementsResult {
  return {
    documents: [],
    bewerbungsboegen: [],
    bewerbungsbogen: null,
    selbstAuszufuellen: [],
    geforderteUnterlagen: [],
    unterlagenHinweise: "",
    ...over,
  };
}

function ausfuellbarerBogen(over: Partial<DocumentRequirementsResult["bewerbungsboegen"][number]> = {}) {
  return {
    attHeader: "Bewerbungsbogen Seiteneinstieg und ROB.pdf",
    docId: "bogen-1",
    downloadUrl: "https://example.invalid/bogen.pdf",
    contentType: "application/pdf",
    sizeBytes: 5000,
    family: "seiteneinstieg-rob" as const,
    ausfuellbar: true,
    benoetigteAngaben: ["nachname", "vorname", "geburtsdatumLabel", "plz"] as const,
    optionaleAngaben: [] as const,
    nichtVerwendeteAngaben: [] as const,
    ...over,
  };
}

describe("baueBewerbungsplan", () => {
  // Die Paketseite muss Anlage 1 nennen
  // (sie liegt nie ausgefuellt im Paket) und den Einreichweg mit Adresse.
  it("traegt selbst auszufuellende Vordrucke, ihren Hinweis und den Einreichweg", () => {
    const plan = baueBewerbungsplan(
      anforderungen({
        selbstAuszufuellen: [
          { attHeader: "Anlage 1 zum Bewerbungsbogen", docId: "a1", downloadUrl: "https://example.org/a1.pdf" },
        ],
        vordruckHinweis: { nurFuerDich: "intern", fuerDenBewerber: "Zu dieser Bewerbung gehört außerdem: Anlage 1." },
      }),
      STELLE,
      null,
      [],
    );
    expect(plan.selbstAuszufuellen).toEqual([
      { titel: "Anlage 1 zum Bewerbungsbogen", downloadUrl: "https://example.org/a1.pdf" },
    ]);
    expect(plan.hinweise).toContain("Zu dieser Bewerbung gehört außerdem: Anlage 1.");
    expect(plan.hinweise.join(" ")).not.toContain("intern");
    expect(plan.einreichen.join(" ")).toContain(BEWERBUNGSPORTAL_URL);
    expect(plan.einreichen.join(" ")).toContain(STELLE.refCode);
  });

  it("meldet fehlende Angaben je Formular (z.B. ohne PLZ)", () => {
    const plan = baueBewerbungsplan(
      anforderungen({ bewerbungsboegen: [ausfuellbarerBogen() as never] }),
      STELLE,
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12" }),
      [],
    );
    expect(plan.formulare).toHaveLength(1);
    expect(plan.formulare[0].fehlendeAngaben).toEqual(["Postleitzahl"]);
  });

  it("zeigt den Formulartitel ohne Dateiendung", () => {
    const plan = baueBewerbungsplan(
      anforderungen({ bewerbungsboegen: [ausfuellbarerBogen({ attHeader: "Bewerbungsbogen Seiteneinstieg und ROB.pdf" }) as never] }),
      STELLE,
      null,
      [],
    );
    expect(plan.formulare[0].titel).toBe("Bewerbungsbogen Seiteneinstieg und ROB");
  });

  it("meldet keine fehlenden Angaben, wenn alles vorhanden ist", () => {
    const plan = baueBewerbungsplan(
      anforderungen({ bewerbungsboegen: [ausfuellbarerBogen() as never] }),
      STELLE,
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12", plz: "12345" }),
      [],
    );
    expect(plan.formulare[0].fehlendeAngaben).toEqual([]);
  });

  it("meldet Staatsangehoerigkeit als fehlend, wenn das Formular sie verlangt, aber keine Einwilligung vorliegt", () => {
    const bogen = ausfuellbarerBogen({ benoetigteAngaben: ["nachname", "vorname", "geburtsdatumLabel", "staatsangehoerigkeit"] as never });
    const plan = baueBewerbungsplan(
      anforderungen({ bewerbungsboegen: [bogen as never] }),
      STELLE,
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12", staatsangehoerigkeit: "deutsch" }, false),
      [],
    );
    expect(plan.formulare[0].fehlendeAngaben).toEqual(["Staatsangehörigkeit"]);
  });

  it("meldet Staatsangehoerigkeit NICHT als fehlend, wenn Wert UND Einwilligung vorliegen", () => {
    const bogen = ausfuellbarerBogen({ benoetigteAngaben: ["nachname", "vorname", "geburtsdatumLabel", "staatsangehoerigkeit"] as never });
    const plan = baueBewerbungsplan(
      anforderungen({ bewerbungsboegen: [bogen as never] }),
      STELLE,
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12", staatsangehoerigkeit: "deutsch" }, true),
      [],
    );
    expect(plan.formulare[0].fehlendeAngaben).toEqual([]);
  });

  it("meldet fuer ein nicht ausfuellbares Formular keine fehlenden Angaben", () => {
    const bogen = ausfuellbarerBogen({ ausfuellbar: false, benoetigteAngaben: undefined, optionaleAngaben: undefined });
    const plan = baueBewerbungsplan(anforderungen({ bewerbungsboegen: [bogen as never] }), STELLE, null, []);
    expect(plan.formulare[0].ausfuellbar).toBe(false);
    expect(plan.formulare[0].fehlendeAngaben).toEqual([]);
  });

  /**
   * WOZU: `fuellwerteAus` setzt die
   * Konto-Auth-E-Mail ein, wenn `angaben.email` selbst leer ist - derselbe
   * Rueckfall muss auch beim Planen gelten, sonst meldet der Plan "E-Mail
   * fehlt" fuer ein Formular, das der Paketbau anschliessend klaglos fuellt.
   */
  it("zaehlt die Konto-Auth-E-Mail als vorhanden, wenn angaben.email selbst leer ist", () => {
    const bogen = ausfuellbarerBogen({ benoetigteAngaben: ["nachname", "vorname", "geburtsdatumLabel", "email"] as never });
    const plan = baueBewerbungsplan(
      anforderungen({ bewerbungsboegen: [bogen as never] }),
      STELLE,
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12" }),
      [],
      "bewerber@example.com",
    );
    expect(plan.formulare[0].fehlendeAngaben).toEqual([]);
  });

  it("meldet E-Mail weiterhin als fehlend, wenn weder angaben.email noch eine Konto-Auth-E-Mail vorliegen", () => {
    const bogen = ausfuellbarerBogen({ benoetigteAngaben: ["nachname", "vorname", "geburtsdatumLabel", "email"] as never });
    const plan = baueBewerbungsplan(
      anforderungen({ bewerbungsboegen: [bogen as never] }),
      STELLE,
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12" }),
      [],
    );
    expect(plan.formulare[0].fehlendeAngaben).toEqual(["E-Mail"]);
  });

  it("bevorzugt ein gespeichertes angaben.email vor der Konto-Auth-E-Mail (dieselbe Reihenfolge wie fuellwerteAus)", () => {
    const bogen = ausfuellbarerBogen({ benoetigteAngaben: ["nachname", "vorname", "geburtsdatumLabel", "email"] as never });
    const plan = baueBewerbungsplan(
      anforderungen({ bewerbungsboegen: [bogen as never] }),
      STELLE,
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12", email: "gespeichert@example.com" }),
      [],
      undefined,
    );
    expect(plan.formulare[0].fehlendeAngaben).toEqual([]);
  });

  it("uebernimmt geforderteUnterlagen, Hinweise (nur fuerDenBewerber) und Ablage", () => {
    const plan = baueBewerbungsplan(
      anforderungen({
        geforderteUnterlagen: ["Lebenslauf", "Zeugniskopien"],
        hinweis: { nurFuerDich: "intern", fuerDenBewerber: "Bitte Lebenslauf und Zeugnisse beilegen." },
      }),
      STELLE,
      null,
      [unterlage()],
    );
    expect(plan.geforderteUnterlagen).toEqual(["Lebenslauf", "Zeugniskopien"]);
    expect(plan.hinweise).toEqual(["Bitte Lebenslauf und Zeugnisse beilegen."]);
    expect(plan.ablage).toEqual([{ docId: "u1", art: "lebenslauf", dateiname: "lebenslauf.pdf" }]);
  });

  it("laesst einen Hinweis ohne fuerDenBewerber-Text weg", () => {
    const plan = baueBewerbungsplan(
      anforderungen({ hinweis: { nurFuerDich: "nur intern" } }),
      STELLE,
      null,
      [],
    );
    expect(plan.hinweise).toEqual([]);
  });

  it("setzt angabenVorhanden auf false ohne gespeicherte Angaben", () => {
    const plan = baueBewerbungsplan(anforderungen(), STELLE, null, []);
    expect(plan.angabenVorhanden).toBe(false);
  });

  it("setzt angabenVorhanden auf true mit mindestens einer gespeicherten Angabe", () => {
    const plan = baueBewerbungsplan(anforderungen(), STELLE, angaben({ nachname: "Mustermann" }), []);
    expect(plan.angabenVorhanden).toBe(true);
  });

  it("uebernimmt die Stelle unveraendert", () => {
    const plan = baueBewerbungsplan(anforderungen(), STELLE, null, []);
    expect(plan.stelle).toEqual(STELLE);
  });
});

describe("fuellwerteAus", () => {
  it("liefert fehlende Pflichtfelder, wenn keine Angaben gespeichert sind", () => {
    const ergebnis = fuellwerteAus(null, { refCode: STELLE.refCode, titel: STELLE.titel }, undefined);
    expect(ergebnis).toEqual({ fehlend: ["Nachname", "Vorname", "Geburtsdatum"] });
  });

  it("liefert genau die fehlenden Pflichtfelder", () => {
    const ergebnis = fuellwerteAus(
      angaben({ nachname: "Mustermann" }),
      { refCode: STELLE.refCode, titel: STELLE.titel },
      undefined,
    );
    expect(ergebnis).toEqual({ fehlend: ["Vorname", "Geburtsdatum"] });
  });

  it("baut die Fuellwerte, wenn alle Pflichtfelder vorhanden sind", () => {
    const ergebnis = fuellwerteAus(
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12" }),
      { refCode: STELLE.refCode, titel: STELLE.titel },
      "max@example.com",
    );
    expect(ergebnis).toEqual({
      werte: {
        nachname: "Mustermann",
        vorname: "Max",
        geburtsdatumLabel: "12.03.1998",
        ausschreibungId: STELLE.refCode,
        ausschreibungTitel: STELLE.titel,
        email: "max@example.com",
      },
    });
  });

  it("nimmt die E-Mail aus den Angaben, wenn dort gesetzt, statt des Kontoparameters", () => {
    const ergebnis = fuellwerteAus(
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12", email: "gespeichert@example.com" }),
      { refCode: STELLE.refCode, titel: STELLE.titel },
      "konto@example.com",
    );
    expect("werte" in ergebnis && ergebnis.werte.email).toBe("gespeichert@example.com");
  });

  it("setzt Staatsangehoerigkeit NICHT ein ohne Einwilligungsvermerk", () => {
    const ergebnis = fuellwerteAus(
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12", staatsangehoerigkeit: "deutsch" }, false),
      { refCode: STELLE.refCode, titel: STELLE.titel },
      undefined,
    );
    expect("werte" in ergebnis && ergebnis.werte.staatsangehoerigkeit).toBeUndefined();
  });

  it("setzt Staatsangehoerigkeit ein MIT Einwilligungsvermerk", () => {
    const ergebnis = fuellwerteAus(
      angaben({ nachname: "Mustermann", vorname: "Max", geburtsdatum: "1998-03-12", staatsangehoerigkeit: "deutsch" }, true),
      { refCode: STELLE.refCode, titel: STELLE.titel },
      undefined,
    );
    expect("werte" in ergebnis && ergebnis.werte.staatsangehoerigkeit).toBe("deutsch");
  });
});

describe("pruefePaketAnfrage", () => {
  const plan: Bewerbungsplan = {
    stelle: STELLE,
    formulare: [
      { docId: "bogen-1", titel: "Bogen", ausfuellbar: true, fehlendeAngaben: [], optionaleAngaben: [] },
      { docId: "bogen-2", titel: "Nicht ausfuellbar", ausfuellbar: false, fehlendeAngaben: [], optionaleAngaben: [] },
    ],
    geforderteUnterlagen: [],
    hinweise: [],
    ablage: [{ docId: "u1", art: "lebenslauf", dateiname: "lebenslauf.pdf" }],
    angabenVorhanden: true,
  };

  it("nimmt eine gueltige Anfrage an", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: ["bogen-1"], unterlagen: ["u1"], anschreiben: "Text" }, plan);
    expect(ergebnis.ok).toBe(true);
  });

  it("lehnt eine fremde Formular-docId ab", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: ["fremd"], unterlagen: [] }, plan);
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt eine fremde Unterlagen-docId ab", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: [], unterlagen: ["fremd"] }, plan);
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt ein nicht ausfuellbares Formular ab", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: ["bogen-2"], unterlagen: [] }, plan);
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt einen zu langen Anschreiben-Text ab", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: [], unterlagen: [], anschreiben: "x".repeat(MAX_TEXT_ZEICHEN + 1) }, plan);
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt einen zu langen Lebenslauf-Text ab", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: [], unterlagen: [], lebenslauf: "x".repeat(MAX_TEXT_ZEICHEN + 1) }, plan);
    expect(ergebnis.ok).toBe(false);
  });

  it("nimmt einen Text an genau der Grenze an", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: [], unterlagen: [], anschreiben: "x".repeat(MAX_TEXT_ZEICHEN) }, plan);
    expect(ergebnis.ok).toBe(true);
  });

  it("lehnt mehr Dateien als erlaubt ab", () => {
    const vielePlan: Bewerbungsplan = {
      ...plan,
      ablage: Array.from({ length: MAX_PAKET_DATEIEN + 1 }, (_, i) => ({
        docId: `u${i}`,
        art: "sonstiges",
        dateiname: `d${i}.pdf`,
      })),
    };
    const ergebnis = pruefePaketAnfrage(
      { formulare: [], unterlagen: vielePlan.ablage.map((u) => u.docId) },
      vielePlan,
    );
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt ein missgebildetes Objekt ab", () => {
    expect(pruefePaketAnfrage({ formulare: "nicht-array" }, plan).ok).toBe(false);
    expect(pruefePaketAnfrage(null, plan).ok).toBe(false);
    expect(pruefePaketAnfrage({ formulare: [], unterlagen: [], anderesFeld: 1 }, plan).ok).toBe(false);
  });

  it("lehnt eine doppelte Formular-docId ab", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: ["bogen-1", "bogen-1"], unterlagen: [] }, plan);
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt eine doppelte Unterlagen-docId ab", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: [], unterlagen: ["u1", "u1"] }, plan);
    expect(ergebnis.ok).toBe(false);
  });

  it("nimmt luekenAkzeptiert:true an und reicht es im Ergebnis durch", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: [], unterlagen: [], luekenAkzeptiert: true }, plan);
    expect(ergebnis).toEqual({ ok: true, wert: { formulare: [], unterlagen: [], luekenAkzeptiert: true } });
  });

  it("setzt luekenAkzeptiert auf false, wenn es fehlt", () => {
    const ergebnis = pruefePaketAnfrage({ formulare: [], unterlagen: [] }, plan);
    expect(ergebnis.ok && ergebnis.wert.luekenAkzeptiert).toBe(false);
  });
});

/** Keine Anhaenge, keine Fristaussage - fuer die Tests, die davon nicht handeln. */
const OHNE_AUSSCHREIBUNG = { anhaenge: [], bewerbungJederzeit: false };

/**
 * WOZU: Wir nehmen keine Ausweiskopien entgegen.
 * Verlangt die Ausschreibung eine, sagen
 * Paketseite und Merkzettel dem Bewerber, dass er sie selbst beilegt - sonst
 * fehlt sie in der Bewerbung, ohne dass es ihm auffaellt.
 */
describe("Ausweiskopie im Kontopaket", () => {
  it("traegt im Plan den Hinweis fuer die Paketseite, wenn die Ausschreibung eine Ausweiskopie verlangt", () => {
    const plan = baueBewerbungsplan(
      anforderungen({ geforderteUnterlagen: ["Lebenslauf", "Kopie des Personalausweises"] }),
      STELLE,
      null,
      [],
    );
    expect(plan.ausweiskopieHinweis).toBe(AUSWEISKOPIE_HINWEIS);
  });

  it("laesst den Hinweis weg, wenn keine Ausweiskopie verlangt ist", () => {
    const plan = baueBewerbungsplan(
      anforderungen({ geforderteUnterlagen: ["Lebenslauf", "Kopie des Schwerbehindertenausweises"] }),
      STELLE,
      null,
      [],
    );
    expect(plan).not.toHaveProperty("ausweiskopieHinweis");
  });

  it("nennt die Ausweiskopie im Merkzettel unter UNTERLAGEN", () => {
    const plan = baueBewerbungsplan(
      anforderungen({ geforderteUnterlagen: ["Lebenslauf", "Kopie des Personalausweises"] }),
      STELLE,
      null,
      [],
    );
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [] }, "", OHNE_AUSSCHREIBUNG);
    const unterlagen = text.slice(text.indexOf("UNTERLAGEN"), text.indexOf("EINREICHEN"));
    expect(unterlagen.replace(/\s+/g, " ")).toContain(AUSWEISKOPIE_HINWEIS);
  });

  it("erwaehnt im Merkzettel keine Ausweiskopie, wenn keine verlangt ist", () => {
    const plan = baueBewerbungsplan(anforderungen({ geforderteUnterlagen: ["Lebenslauf"] }), STELLE, null, []);
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [] }, "", OHNE_AUSSCHREIBUNG);
    expect(text).not.toMatch(/Ausweiskopie/);
  });
});

describe("merkzettel", () => {
  const plan: Bewerbungsplan = {
    stelle: STELLE,
    formulare: [{ docId: "bogen-1", titel: "Bewerbungsbogen Militärisch", ausfuellbar: true, fehlendeAngaben: [], optionaleAngaben: [] }],
    geforderteUnterlagen: ["Lebenslauf", "Zeugniskopien"],
    hinweise: [],
    ablage: [
      { docId: "u-lebenslauf", art: "lebenslauf", dateiname: "lebenslauf.pdf" },
      { docId: "u-zeugnis", art: "zeugnis", dateiname: "zeugnis.pdf" },
      { docId: "u-sonstiges", art: "sonstiges", dateiname: "foto.jpg" },
    ],
    angabenVorhanden: true,
  };

  it("enthaelt Kennung und Frist", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).toContain(STELLE.refCode);
    expect(text).toContain(STELLE.bewerbungsschluss);
  });

  it("enthaelt einen Unterschreiben-Abschnitt mit dem Formulartitel, wenn ein Formular im Paket ist", () => {
    const text = merkzettel(plan, { formulare: ["bogen-1"], unterlagen: [], texte: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).toMatch(/unterschreiben/i);
    expect(text).toContain("Bewerbungsbogen Militärisch");
  });

  it("enthaelt keinen Unterschreiben-Hinweis auf Vordrucke ohne Formulare im Paket", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).toMatch(/kein Vordruck/i);
  });

  // Der Einreichweg braucht eine Adresse - genau EINE: die, die die
  // Ausschreibungen selbst nennen (lib/einreichen.ts). Erfunden wird keine.
  it("nennt als einzige URL das offizielle Bewerbungsportal", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: ["u-lebenslauf"], texte: ["anschreiben"] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    const urls = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
    expect(urls).toEqual([BEWERBUNGSPORTAL_URL]);
    expect(text.replace(/\s+/g, " ")).toContain(`über ihre Kennung ${STELLE.refCode}`);
  });

  it("nennt den Vordruck unter seinem Namen im ZIP, wenn er bekannt ist", () => {
    const text = merkzettel(
      plan,
      { formulare: ["bogen-1"], unterlagen: [], texte: [], zipNamen: { "bogen-1": "03_Bewerbungsbogen.pdf" } },
      "Frau Musterfrau",
      OHNE_AUSSCHREIBUNG,
    );
    expect(text).toContain("  - 03_Bewerbungsbogen.pdf (Bewerbungsbogen Militärisch)");
  });

  it("enthaelt keinen Feldwert (nur Kennung/Titel/Ansprechperson, keine Bewerberdaten)", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).not.toMatch(/Mustermann|geburtsdatum|staatsangehoerigkeit/i);
  });

  it("markiert Lebenslauf als im Paket ueber eine Ablage vom Typ lebenslauf", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: ["u-lebenslauf"], texte: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).toMatch(/Lebenslauf: im Paket/);
  });

  it("markiert Lebenslauf als im Paket ueber den mitgeschickten Lebenslauf-Text", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: ["lebenslauf"] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).toMatch(/Lebenslauf: im Paket/);
  });

  it("markiert eine geforderte Unterlage NICHT als im Paket, solange die passende Kategorie fehlt", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).toMatch(/Lebenslauf: prüf selbst/);
    expect(text).toMatch(/Zeugniskopien: prüf selbst/);
  });

  it("markiert eine unklare Anforderung NICHT als im Paket, auch wenn ein unpassendes Dokument dabei ist", () => {
    const unklarerPlan: Bewerbungsplan = { ...plan, geforderteUnterlagen: ["Nachweis über X", "Nachweis über Y"] };
    const text = merkzettel(
      unklarerPlan,
      { formulare: [], unterlagen: ["u-sonstiges"], texte: ["lebenslauf", "anschreiben"] },
      "Frau Musterfrau",
      OHNE_AUSSCHREIBUNG,
    );
    expect(text).toMatch(/Nachweis über X: prüf selbst/);
    expect(text).toMatch(/Nachweis über Y: prüf selbst/);
    expect(text).not.toMatch(/Nachweis über X: im Paket/);
    expect(text).not.toMatch(/Nachweis über Y: im Paket/);
  });

  it("nennt keine Vollstaendigkeit, auch wenn alle bekannten Kategorien abgedeckt sind", () => {
    const text = merkzettel(
      plan,
      { formulare: [], unterlagen: ["u-lebenslauf", "u-zeugnis"], texte: ["lebenslauf"] },
      "Frau Musterfrau",
      OHNE_AUSSCHREIBUNG,
    );
    expect(text).toMatch(/Lebenslauf: im Paket/);
    expect(text).toMatch(/Zeugniskopien: im Paket/);
    expect(text).not.toMatch(/vollständig/i);
  });

  /**
   * Derselbe Satz wie in der transienten Mappe und in get_document_requirements
   * (s. mappe/merkzettel.ts): uns fehlt die Liste, nicht der Ausschreibung - und
   * "keine Liste" heisst nicht "nichts noetig".
   */
  it("sagt bei einer leeren Unterlagenliste, dass wir keine herauslesen konnten, und nennt das Uebliche", () => {
    const leererPlan: Bewerbungsplan = { ...plan, geforderteUnterlagen: [] };
    const text = merkzettel(leererPlan, { formulare: [], unterlagen: [], texte: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    const fliesstext = text.split(/\s+/).join(" ");
    expect(fliesstext).toMatch(/konnten wir aus dieser Ausschreibung nicht herauslesen/);
    expect(fliesstext).toMatch(/Unterlagen brauchst du trotzdem/);
    expect(text).not.toMatch(/vollständig/);
    expect(text).toContain("Frau Musterfrau");
  });

  it("nennt die Anhaenge der Ausschreibung, die nicht ausgefuellt im Paket liegen", () => {
    const text = merkzettel(plan, { formulare: ["bogen-1"], unterlagen: [], texte: [] }, "Frau Musterfrau", {
      anhaenge: [
        { docId: "bogen-1", attHeader: "Bewerbungsbogen_Militärisch" },
        { docId: "anlage", attHeader: "Anlage 1 zum Bewerbungsbogen" },
      ],
      bewerbungJederzeit: false,
    });
    expect(text).toContain("AUSFÜLLEN UND UNTERSCHREIBEN (gehört zur Bewerbung)");
    expect(text).toContain("  - Anlage 1 zum Bewerbungsbogen");
    expect(text).not.toContain("  - Bewerbungsbogen_Militärisch");
  });

  // Ein Pflichtvordruck wie Anlage 1 darf nicht neben einer Broschuere stehen.
  it("trennt Pflichtvordruck (mit Link), Beiblatt und Informationsmaterial", () => {
    const text = merkzettel(plan, { formulare: ["bogen-1"], unterlagen: [], texte: [] }, "Frau Musterfrau", {
      anhaenge: [
        { docId: "bogen-1", attHeader: "Bewerbungsbogen_Militärisch" },
        { docId: "fact", attHeader: "Factsheet_Fw_IT" },
        { docId: "beiblatt", attHeader: "Beiblatt Staatenliste" },
        { docId: "anlage", attHeader: "Anlage 1 zum Bewerbungsbogen", downloadUrl: "https://example.org/a1.pdf" },
        { docId: "td", attHeader: "TD_Teil_1_31940726" },
      ],
      bewerbungJederzeit: false,
    });
    const vordrucke = text.slice(text.indexOf("AUSFÜLLEN UND UNTERSCHREIBEN"), text.indexOf("UNTERLAGEN"));
    expect(vordrucke).toContain("  - Anlage 1 zum Bewerbungsbogen\n    Download: https://example.org/a1.pdf");
    expect(vordrucke).toMatch(/füllen wir nicht aus/);
    expect(vordrucke).toMatch(/Nachschlagen[\s\S]*- Beiblatt Staatenliste/);
    expect(text).toMatch(/ZUR INFORMATION\n[\s\S]*- Factsheet_Fw_IT/);
    expect(text).toMatch(/WEITERE DATEIEN DER AUSSCHREIBUNG\n[\s\S]*- TD_Teil_1_31940726/);
    // Die Reihenfolge: Pflichtvordruck vor den Feldern, Lesestoff ganz hinten vor EINREICHEN.
    expect(text.indexOf("AUSFÜLLEN UND UNTERSCHREIBEN")).toBeLessThan(text.indexOf("UNTERLAGEN"));
    expect(text.indexOf("ZUR INFORMATION")).toBeLessThan(text.indexOf("EINREICHEN"));
  });

  it("schreibt bei leerem Datum und 'jederzeit' im Text 'kein Bewerbungsschluss'", () => {
    const ohneDatum: Bewerbungsplan = { ...plan, stelle: { ...STELLE, bewerbungsschluss: "" } };
    const text = merkzettel(ohneDatum, { formulare: [], unterlagen: [], texte: [] }, "Frau Musterfrau", {
      anhaenge: [],
      bewerbungJederzeit: true,
    });
    expect(text).toContain("Bewerbungsschluss: keiner, Bewerbung jederzeit möglich");
  });

  it("nennt den Weg ueber das Bundeswehr-Portal per Kennung statt einer erfundenen URL", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).toMatch(/Bewerbungsportal der Bundeswehr/);
    expect(text).toMatch(/Kennung/);
  });

  it("nennt die Ansprechperson", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [] }, "Herr Beispiel", OHNE_AUSSCHREIBUNG);
    expect(text).toContain("Herr Beispiel");
  });

  /**
   * Wenn der Bewerber Luecken ausdruecklich akzeptiert hat,
   * bekommt der Merkzettel einen eigenen Abschnitt - Labels, NIE Feldwerte.
   */
  it("nennt je Formular unter VON HAND ERGÄNZEN, was der Bewerber selbst eintragen muss", () => {
    const text = merkzettel(
      plan,
      {
        formulare: ["bogen-1"],
        unterlagen: [],
        texte: [],
        vonHand: [{ formular: "Bewerbungsbogen Militärisch", felder: ["Geschlecht und Anrede auswählen"] }],
      },
      "Frau Musterfrau",
      OHNE_AUSSCHREIBUNG,
    );
    expect(text).toMatch(/VON HAND ERGÄNZEN/);
    expect(text).toContain("  Bewerbungsbogen Militärisch:");
    expect(text).toContain("    - Geschlecht und Anrede auswählen");
  });

  it("laesst den VON HAND ERGÄNZEN-Abschnitt weg, wenn kein Formular im Paket ist", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).not.toMatch(/VON HAND ERGÄNZEN/);
  });

  it("laesst den Abschnitt auch weg, wenn vonHand leer uebergeben wird", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: [], vonHand: [] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).not.toMatch(/VON HAND ERGÄNZEN/);
  });

  // Ein Platzhalter wie "[Adresse]" darf nicht unbemerkt ins Anschreiben-PDF gehen.
  it("nennt offene Platzhalter in den Texten, vor allem anderen", () => {
    const text = merkzettel(
      plan,
      {
        formulare: [],
        unterlagen: [],
        texte: ["anschreiben"],
        platzhalter: [{ ort: "Im Anschreiben", platzhalter: ["[Telefon]"] }],
      },
      "Frau Musterfrau",
      OHNE_AUSSCHREIBUNG,
    );
    expect(text.replace(/\s+/g, " ")).toContain(
      "Im Anschreiben stehen noch Platzhalter: [Telefon]. Ersetze sie vor dem Einreichen.",
    );
    expect(text.indexOf("PLATZHALTER ERSETZEN")).toBeLessThan(text.indexOf("UNTERSCHREIBEN"));
  });

  it("laesst den Platzhalter-Abschnitt ohne Platzhalter weg", () => {
    const text = merkzettel(plan, { formulare: [], unterlagen: [], texte: ["anschreiben"] }, "Frau Musterfrau", OHNE_AUSSCHREIBUNG);
    expect(text).not.toMatch(/PLATZHALTER/);
  });
});

describe("paketDateiname", () => {
  it("baut 'Bewerbung_<refCode>.zip'", () => {
    expect(paketDateiname("2026-XYZ-42")).toBe("Bewerbung_2026-XYZ-42.zip");
  });

  it("saeubert NUR den refCode, nicht die '.zip'-Endung, ueber sichererDateiname", () => {
    // Ein Schraegstrich im refCode wuerde `sichererDateiname`, auf den GANZEN
    // String angewandt, als Pfadtrenner deuten und "Bewerbung_" verschlucken -
    // deshalb wirkt die Bereinigung ausschliesslich auf den refCode.
    expect(paketDateiname("AB/12")).toBe("Bewerbung_12.zip");
    expect(paketDateiname('böse"kennung')).not.toContain('"');
  });
});

describe("baueMappenDokumente", () => {
  it("nummeriert die Eingabe per Einfuegereihenfolge durch (hinzugefuegtAm)", () => {
    const dokumente = baueMappenDokumente([
      { docId: "a", art: "formular", dateiname: "a.pdf", storagePath: "p/a", contentType: "application/pdf", sizeBytes: 1, herkunft: "formular" },
      { docId: "b", art: "lebenslauf", dateiname: "b.pdf", storagePath: "p/b", contentType: "application/pdf", sizeBytes: 2, herkunft: "client" },
    ]);
    expect(dokumente.map((d) => d.hinzugefuegtAm)).toEqual([0, 1]);
    expect(dokumente[0]).toMatchObject({ docId: "a", art: "formular" });
    expect(dokumente[1]).toMatchObject({ docId: "b", art: "lebenslauf" });
  });

  it("liefert eine leere Liste fuer eine leere Eingabe", () => {
    expect(baueMappenDokumente([])).toEqual([]);
  });
});

describe("pruefePaketGroesse", () => {
  it("laesst eine kleine, wenige Dateien umfassende Anfrage durch", () => {
    expect(pruefePaketGroesse([1000, 2000, 3000])).toEqual({ ok: true, wert: true });
  });

  it("lehnt ab, wenn die Gesamtgroesse MAX_PAKET_BYTES ueberschreitet", () => {
    const ergebnis = pruefePaketGroesse([MAX_PAKET_BYTES + 1]);
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.fehler).toMatch(/höchstens/);
  });

  it("laesst genau MAX_PAKET_BYTES durch (Grenzwert selbst ist noch erlaubt)", () => {
    expect(pruefePaketGroesse([MAX_PAKET_BYTES])).toEqual({ ok: true, wert: true });
  });

  it("lehnt ab, wenn mehr als MAX_PAKET_DATEIEN Eintraege uebergeben werden", () => {
    const ergebnis = pruefePaketGroesse(new Array(MAX_PAKET_DATEIEN + 1).fill(1));
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.fehler).toMatch(/Dateien/);
  });

  it("laesst eine leere Liste durch (kein Dokument im Paket)", () => {
    expect(pruefePaketGroesse([])).toEqual({ ok: true, wert: true });
  });
});

describe("feldnamenFuer", () => {
  it("bildet Schluessel auf Alltagssprache ab", () => {
    expect(feldnamenFuer(["plz", "staatsangehoerigkeit"])).toEqual(["Postleitzahl", "Staatsangehörigkeit"]);
  });

  it("liefert eine leere Liste fuer eine leere Eingabe", () => {
    expect(feldnamenFuer([])).toEqual([]);
  });
});

/**
 * Die drei Kernfelder allein reichen nicht - ein Formular mit fehlender
 * Postleitzahl oder (mit Einwilligung) Staatsangehoerigkeit wuerde sonst
 * stillschweigend mit leeren Pflichtfeldern gefuellt.
 */
describe("pruefeFormularLuecken", () => {
  it("liefert null, wenn kein Formular Luecken hat", () => {
    expect(pruefeFormularLuecken([{ titel: "Bogen", fehlendeAngaben: [] }], false)).toBeNull();
  });

  it("liefert null, wenn luekenAkzeptiert gesetzt ist, obwohl Luecken bestehen", () => {
    expect(pruefeFormularLuecken([{ titel: "Bogen", fehlendeAngaben: ["Postleitzahl"] }], true)).toBeNull();
  });

  it("nennt Formulartitel und fehlende Feldnamen, wenn Luecken bestehen und nicht akzeptiert sind", () => {
    const fehler = pruefeFormularLuecken(
      [{ titel: "Bewerbungsbogen Militärisch", fehlendeAngaben: ["Postleitzahl", "Staatsangehörigkeit"] }],
      false,
    );
    expect(fehler).toContain("Bewerbungsbogen Militärisch");
    expect(fehler).toContain("Postleitzahl, Staatsangehörigkeit");
    expect(fehler).toMatch(/Meine Angaben/);
  });

  it("baut einen Teilsatz je betroffenem Formular, geordnet und ohne die luecken-freien Formulare zu nennen", () => {
    const fehler = pruefeFormularLuecken(
      [
        { titel: "Formular A", fehlendeAngaben: ["Postleitzahl"] },
        { titel: "Formular B", fehlendeAngaben: [] },
        { titel: "Formular C", fehlendeAngaben: ["Telefon"] },
      ],
      false,
    );
    expect(fehler).toContain("Formular A");
    expect(fehler).toContain("Formular C");
    expect(fehler).not.toContain("Formular B");
  });

  it("liefert null fuer eine leere Formularliste", () => {
    expect(pruefeFormularLuecken([], false)).toBeNull();
  });
});

/**
 * Das Kontopaket der Stelle FA163EC863931FD19AAFDDF869A2139B (2026-1-CIR-Fw-IT-E)
 * als Beispiel: Anschreiben,
 * Lebenslauf, Bewerbungsbogen_Militärisch ohne gespeicherte Staatsangehoerigkeit,
 * vier Anhaenge. Ausgeschrieben, damit jede Aenderung am Zettel im Diff steht.
 */
describe("merkzettel — Kontopaket einer echten IT-Stelle, vollstaendig ausgeschrieben", () => {
  it("rendert den Zettel", () => {
    const plan: Bewerbungsplan = {
      stelle: {
        pinstGuid: "FA163EC863931FD19AAFDDF869A2139B",
        refCode: "2026-1-CIR-Fw-IT-E",
        titel: "Expertin / Experte Informationstechnik (m/w/d)",
        bewerbungsschluss: "",
        bewerbungsschlussText: "keiner – laut Ausschreibung ist die Bewerbung jederzeit möglich",
        aktiv: true,
      },
      formulare: [
        { docId: "bogen", titel: "Bewerbungsbogen_Militärisch", ausfuellbar: true, fehlendeAngaben: [], optionaleAngaben: [] },
      ],
      geforderteUnterlagen: [],
      hinweise: [],
      ablage: [],
      angabenVorhanden: true,
      selbstAuszufuellen: [],
      einreichen: [],
    };
    const text = merkzettel(
      plan,
      {
        formulare: ["bogen"],
        unterlagen: [],
        texte: ["anschreiben", "lebenslauf"],
        vonHand: vonHandFuerFormulare(
          [{ attHeader: "Bewerbungsbogen_Militärisch", fehlendeAngaben: ["staatsangehoerigkeit"] }],
          ["Feldwebel"],
        ),
        platzhalter: [
          { ort: "Im Anschreiben", platzhalter: [] },
          { ort: "Im Lebenslauf", platzhalter: [] },
        ],
        zipNamen: { bogen: "03_Bewerbungsbogen.pdf" },
      },
      "die in der Ausschreibung genannte Ansprechperson",
      {
        anhaenge: [
          { docId: "fact", attHeader: "Factsheet_Fw_IT" },
          { docId: "beiblatt", attHeader: "Beiblatt Staatenliste" },
          {
            docId: "anlage",
            attHeader: "Anlage 1 zum Bewerbungsbogen",
            downloadUrl:
              "https://firebasestorage.googleapis.com/v0/b/better-bewerbungsportal.firebasestorage.app/o/jobDocuments%2Fanlage1.pdf?alt=media",
          },
          { docId: "bogen", attHeader: "Bewerbungsbogen_Militärisch" },
          { docId: "bfd", attHeader: "Berufsförderungsdienst - Die Zukunft im Blick" },
        ],
        bewerbungJederzeit: true,
      },
    );
    expect(text).toMatchInlineSnapshot(`
      "BEWERBUNG: Expertin / Experte Informationstechnik (m/w/d)
      Kennung der Ausschreibung: 2026-1-CIR-Fw-IT-E
      Bewerbungsschluss: keiner, Bewerbung jederzeit möglich

      UNTERSCHREIBEN
        Die amtlichen Vordrucke haben kein digitales Unterschriftsfeld. Druck sie aus,
        unterschreib sie von Hand und scanne sie dann ein oder schick sie mit:
        - 03_Bewerbungsbogen.pdf (Bewerbungsbogen_Militärisch)

      AUSFÜLLEN UND UNTERSCHREIBEN (gehört zur Bewerbung)
        Diese Vordrucke der Ausschreibung füllen wir nicht aus und sie liegen nicht im
        Paket. Lade sie herunter, fülle sie von Hand aus, unterschreibe sie und reiche sie
        mit der Bewerbung ein:
        - Anlage 1 zum Bewerbungsbogen
          Download: https://firebasestorage.googleapis.com/v0/b/better-bewerbungsportal.firebasestorage.app/o/jobDocuments%2Fanlage1.pdf?alt=media
        Zum Nachschlagen dafür (nicht ausfüllen):
        - Beiblatt Staatenliste
        Steht auf einem Vordruck, dass er nur in bestimmten Fällen gilt (z. B. bei
        Minderjährigen), richte dich danach.

      VON HAND ERGÄNZEN
        Diese Felder haben wir nicht ausgefüllt, weil du sie selbst entscheidest oder uns
        die Angabe fehlte:
        Bewerbungsbogen_Militärisch:
          - Staatsangehörigkeit eintragen (Pflichtangabe auf dem Bogen)
          - Laufbahn ankreuzen (Freiwilliger Wehrdienst / Soldat auf Zeit (Kurz) /
            Mannschaften / Unteroffiziere / Feldwebel / Offiziere), laut Ausschreibung:
            Feldwebel
          - Geschlecht und Anrede auswählen, Titel falls vorhanden
          - Staat beim Hauptwohnsitz und beim Geburtsort (z. B. Deutschland)
          - Weitere Wohnsitze, falls vorhanden
          - Freiwillig, falls nicht schon eingetragen: Akademischer Grad, Führerschein
            Klassen zivil, weitere oder frühere Staatsangehörigkeiten, Grad der
            Behinderung
          - Teil B (Einwilligung zur Erreichbarkeit per Telefon und E-Mail): Nein oder Ja
            ankreuzen, Ort und Datum
          - Teil C (Erklärung): Ort und Datum
          - Bei Minderjährigen zusätzlich: Ort, Datum, Vorname und Nachname der
            Sorgeberechtigten

      UNTERLAGEN
        Eine Liste der Unterlagen konnten wir aus dieser Ausschreibung nicht herauslesen.
        Unterlagen brauchst du trotzdem: üblich sind ein Anschreiben, ein tabellarischer
        Lebenslauf und Zeugniskopien. Verbindlich sind der Ausschreibungstext und die dort
        genannte Ansprechperson bzw. die Karriereberatung.

      ZUR INFORMATION
        Diese Dateien der Ausschreibung sind Informationsmaterial, das du nicht
        mitschicken musst:
        - Factsheet_Fw_IT
        - Berufsförderungsdienst - Die Zukunft im Blick

      EINREICHEN
        Die Bewerbung reichst du selbst bei der Bundeswehr ein:
        - Im offiziellen Bewerbungsportal der Bundeswehr
          (https://bewerbung.bundeswehr-karriere.de) auf „Karriere starten“ klicken und
          ein Profil anlegen.
        - Dort die Stelle über ihre Kennung 2026-1-CIR-Fw-IT-E suchen und die Unterlagen
          als PDF im Bewerbungsprofil hochladen. Unterschriebene Vordrucke vorher
          einscannen.
        - Das Portal fragt die persönlichen Angaben dort noch einmal selbst ab.
        - In der Regel meldet sich danach die Karriereberatung zur Terminvereinbarung.
        - Nennt die Ausschreibung einen anderen Weg, gilt dieser.
        Bei Fragen: die in der Ausschreibung genannte Ansprechperson

      Dieses Paket stammt von Better Bewerbungsportal, einem unabhängigen privaten
      Projekt, und nicht von der Bundeswehr. Prüfe die Angaben, bevor du sie einreichst."
    `);
  });
});
