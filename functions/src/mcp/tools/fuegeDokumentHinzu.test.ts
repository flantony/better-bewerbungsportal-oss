import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod/v3";

const ladeMappeMock = vi.fn();
const fuegeEinMock = vi.fn();
vi.mock("../../mappe/mappeStore", () => ({
  ladeMappe: (...args: unknown[]) => ladeMappeMock(...args),
  fuegeDokumentEin: (...args: unknown[]) => fuegeEinMock(...args),
}));

const { fuegeDokumentHinzu, fuegeDokumentHinzuInputSchema, MAX_INLINE_BASE64 } = await import("./fuegeDokumentHinzu");
const { MAX_TEXT_ZEICHEN } = await import("../lib/eingabeGrenzen");

beforeEach(() => {
  ladeMappeMock.mockReset().mockResolvedValue({ dokumente: [], titel: "Teststelle" });
  fuegeEinMock.mockReset().mockImplementation(async (_id, dokument) => ({ ...dokument, storagePath: "p", hinzugefuegtAm: 1 }));
});

/**
 * WOZU: Text ist der Hauptweg. Dasselbe Dokument als Base64 kostet rund
 * dreissigtausend Token, als Text zwei - und was der Client selbst schreibt,
 * hat er ohnehin als Text.
 */
describe("fuege_dokument_hinzu", () => {
  it("nimmt Text und legt ihn als PDF ab", async () => {
    const ergebnis = await fuegeDokumentHinzu({
      mappenId: "m1",
      art: "lebenslauf",
      dateiname: "Lebenslauf.pdf",
      text: "Erika Musterfrau",
    });
    expect(fuegeEinMock).toHaveBeenCalledOnce();
    expect(ergebnis.dokument.art).toBe("lebenslauf");
    expect(ergebnis.dokument.contentType).toBe("application/pdf");
  });

  it("nimmt kleine Dateien auch als Base64", async () => {
    const base64 = Buffer.from("%PDF-1.4 kleines PDF").toString("base64");
    const ergebnis = await fuegeDokumentHinzu({ mappenId: "m1", art: "zeugnis", dateiname: "Z.pdf", inhaltBase64: base64 });
    expect(ergebnis.dokument.art).toBe("zeugnis");
    expect(ergebnis.dokument.contentType).toBe("application/pdf");
    expect(fuegeEinMock).toHaveBeenCalledOnce();
    expect(fuegeEinMock.mock.calls[0][1]).toMatchObject({ herkunft: "upload", contentType: "application/pdf" });
  });

  it("lehnt zu grosses Base64 ab und schickt auf die Upload-Seite", async () => {
    const zuGross = "A".repeat(MAX_INLINE_BASE64 + 1);
    await expect(
      fuegeDokumentHinzu({ mappenId: "m1", art: "zeugnis", dateiname: "Z.pdf", inhaltBase64: zuGross }),
    ).rejects.toThrow(/Upload-Seite/);
  });

  it("verlangt genau einen der beiden Wege", async () => {
    await expect(fuegeDokumentHinzu({ mappenId: "m1", art: "zeugnis", dateiname: "Z.pdf" })).rejects.toThrow(
      /text.*inhaltBase64|inhaltBase64.*text/,
    );
  });

  it("lehnt ab, wenn text UND inhaltBase64 mitkommen", async () => {
    await expect(
      fuegeDokumentHinzu({ mappenId: "m1", art: "zeugnis", dateiname: "Z.pdf", text: "x", inhaltBase64: "eA==" }),
    ).rejects.toThrow(/genau eines/);
  });

  // Wir nehmen keine Ausweiskopien entgegen - auch nicht ueber
  // die Upload-Seite. Die Fehlermeldung darf die KI nicht dorthin schicken.
  it("weist die Ausweiskopie ab und schickt die KI nicht zur Upload-Seite", async () => {
    const fehler = fuegeDokumentHinzu({ mappenId: "m1", art: "ausweiskopie", dateiname: "A.pdf", text: "x" });
    await expect(fehler).rejects.toThrow(/selbst bei/);
    await expect(fehler).rejects.not.toThrow(/über die Upload-Seite/);
  });

  it("weist ein formular ohne Anlass ab", async () => {
    await expect(
      fuegeDokumentHinzu({ mappenId: "m1", art: "formular", dateiname: "F.pdf", text: "x" }),
    ).rejects.toThrow(/Upload-Seite/);
  });

  it("lehnt Datenmuell ab, statt ihn als PDF in die Mappe zu legen", async () => {
    const muell = Buffer.from([1, 2, 3, 4, 5]).toString("base64");
    await expect(
      fuegeDokumentHinzu({ mappenId: "m1", art: "zeugnis", dateiname: "Z.pdf", inhaltBase64: muell }),
    ).rejects.toThrow(/PDF, JPEG|beschädigt|Upload-Seite/);
  });

  it("uebernimmt den erkannten Typ, nicht den geratenen", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64");
    const ergebnis = await fuegeDokumentHinzu({ mappenId: "m1", art: "zeugnis", dateiname: "Scan.jpg", inhaltBase64: jpeg });
    expect(ergebnis.dokument.contentType).toBe("image/jpeg");
  });
});

/**
 * Ohne Adresse schreibt eine KI "[Adresse]", "[Telefon]" usw. in den
 * Briefkopf, und die Platzhalter landen unbemerkt im PDF. Die
 * Mappe setzt nichts ein (sie kennt keine Angaben) - also muss die KI es im
 * Moment des Ablegens erfahren, nicht erst beim Einreichen.
 */
describe("fuege_dokument_hinzu — Platzhalter im Text", () => {
  it("sagt KI und Bewerber, welche Platzhalter noch im Text stehen", async () => {
    const ergebnis = await fuegeDokumentHinzu({
      mappenId: "m1",
      art: "anschreiben",
      dateiname: "Anschreiben.pdf",
      text: "Erika Musterfrau\n[Telefon]\nKöln, [Datum]",
    });
    expect(ergebnis.platzhalter).toEqual(["[Telefon]", "[Datum]"]);
    expect(ergebnis.hinweis.fuerDenBewerber).toContain(
      "Im Anschreiben stehen noch Platzhalter: [Telefon], [Datum]. Ersetze sie vor dem Einreichen.",
    );
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/\[Telefon\], \[Datum\]/);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/Frag den Bewerber/);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/Upload-Seite/);
    // DSGVO: der Hinweis darf nicht zum Erfragen von Herkunftsangaben einladen.
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/Nach Staatsangehörigkeit, Sprachkenntnissen/);
  });

  it("merkt sich in der Mappe nur die Platzhalter-Namen - nie Text, und nichts mit Ziffern oder @", async () => {
    await fuegeDokumentHinzu({
      mappenId: "m1",
      art: "lebenslauf",
      dateiname: "Lebenslauf.pdf",
      text: "Erika Musterfrau\n[E-Mail]\n[geb. 01.01.1990]\n[erika@example.com]\n[seit Jahren in Köln wohnhaft]",
    });
    const gespeichert = fuegeEinMock.mock.calls[0][1];
    expect(gespeichert.platzhalter).toEqual(["[E-Mail]"]);
    expect(JSON.stringify(gespeichert)).not.toMatch(/Musterfrau|1990|example|Köln/);
  });

  it("bleibt ohne Platzhalter beim normalen Hinweis und speichert kein Feld", async () => {
    const ergebnis = await fuegeDokumentHinzu({
      mappenId: "m1",
      art: "lebenslauf",
      dateiname: "Lebenslauf.pdf",
      text: "Erika Musterfrau, siehe [1]",
    });
    expect(ergebnis.platzhalter).toBeUndefined();
    expect(ergebnis.hinweis.fuerDenBewerber).toBe("Das habe ich zu deiner Mappe gelegt.");
    expect(fuegeEinMock.mock.calls[0][1]).not.toHaveProperty("platzhalter");
  });
});

/**
 * WOZU: Dieses Werkzeug ist mit `text` der BEVORZUGTE Weg fuer alles, was das
 * KI-Tool selbst verfasst - Lebenslauf und Anschreiben, also die
 * umfangreichsten Bewerberangaben ueberhaupt. Der DSFA-Eintrag muss ihn
 * deshalb unter Zweck und verarbeiteten Daten eigens nennen und ihm eine
 * eigene Rechtsgrundlage geben - die Upload-Seite durchlaeuft dieser Pfad nie.
 * Ein Weg, den die DSFA nicht kennt, ist nicht abgedeckt; deshalb haengt der
 * Test hier am Werkzeug und nicht in einer Dokumentationsecke.
 */
describe("DSFA-Eintrag zur transienten Bewerbungsmappe", () => {
  const dsfa = readFileSync(new URL("../../../../DSFA.md", import.meta.url), "utf8");
  const start = dsfa.indexOf("### Transiente Bewerbungsmappe");
  const naechster = dsfa.indexOf("\n### ", start + 1);
  const eintrag = dsfa.slice(start, naechster === -1 ? undefined : naechster);

  function abschnitt(name: string): string {
    const von = eintrag.indexOf(`- **${name}**`);
    expect(von, `Abschnitt "${name}" fehlt im DSFA-Eintrag`).toBeGreaterThan(-1);
    const bis = eintrag.indexOf("\n- **", von + 1);
    return eintrag.slice(von, bis === -1 ? undefined : bis);
  }

  it("fuehrt den Textweg als eigene Datenquelle unter den verarbeiteten Daten", () => {
    expect(abschnitt("Verarbeitete Daten")).toContain("fuege_dokument_hinzu");
  });

  it("benennt fuer den Textweg eine eigene Rechtsgrundlage, statt ihn unter der Upload-Seite mitlaufen zu lassen", () => {
    expect(abschnitt("Rechtsgrundlage")).toContain("fuege_dokument_hinzu");
  });
});

/**
 * WOZU: ohne Obergrenze auf `text` und `dateiname` wuerde das PDF gerendert,
 * BEVOR irgendeine Grenze greift - ein Aufruf mit Megabytes an Text kostete
 * Speicher und Rechenzeit, auch wenn die Mappe laengst voll oder abgelaufen ist.
 */
describe("fuege_dokument_hinzu - Grenzen", () => {
  const schema = z.object(fuegeDokumentHinzuInputSchema);
  const MAPPE = "m" + "0".repeat(24) + "1";

  it("lehnt im Schema zu langen Text und zu lange Dateinamen ab", () => {
    expect(schema.safeParse({ mappenId: MAPPE, art: "lebenslauf", dateiname: "L.pdf", text: "x".repeat(MAX_TEXT_ZEICHEN) }).success).toBe(
      true,
    );
    const zuLang = schema.safeParse({ mappenId: MAPPE, art: "lebenslauf", dateiname: "L.pdf", text: "x".repeat(MAX_TEXT_ZEICHEN + 1) });
    expect(zuLang.success).toBe(false);
    if (!zuLang.success) expect(zuLang.error.issues[0].message).toMatch(/split/);
    expect(schema.safeParse({ mappenId: MAPPE, art: "lebenslauf", dateiname: "x".repeat(121), text: "x" }).success).toBe(false);
  });

  it("lehnt im Schema eine mappenId ab, die eroeffne_bewerbungsmappe nicht ausgegeben haben kann", () => {
    const ergebnis = schema.safeParse({ mappenId: "../konten/x", art: "lebenslauf", dateiname: "L.pdf", text: "x" });
    expect(ergebnis.success).toBe(false);
    if (!ergebnis.success) expect(ergebnis.error.issues[0].message).toMatch(/eroeffne_bewerbungsmappe/);
  });

  it("prueft die Textlaenge auch ohne Schema, bevor es die Mappe laedt oder ein PDF rendert", async () => {
    await expect(
      fuegeDokumentHinzu({ mappenId: MAPPE, art: "lebenslauf", dateiname: "L.pdf", text: "x".repeat(MAX_TEXT_ZEICHEN + 1) }),
    ).rejects.toThrow(/höchstens/);
    expect(ladeMappeMock).not.toHaveBeenCalled();
    expect(fuegeEinMock).not.toHaveBeenCalled();
  });

  it("rendert nichts in eine volle Mappe und nennt den Weg heraus", async () => {
    const voll = Array.from({ length: 10 }, (_, i) => ({ docId: `t${i}`, art: "zeugnis", sizeBytes: 100 }));
    ladeMappeMock.mockResolvedValue({ dokumente: voll, titel: "Teststelle" });
    await expect(
      fuegeDokumentHinzu({ mappenId: MAPPE, art: "lebenslauf", dateiname: "L.pdf", text: "Erika" }),
    ).rejects.toThrow(/mappe_status/);
    expect(fuegeEinMock).not.toHaveBeenCalled();
  });

  it("saeubert den Dateinamen, bevor er ins Paket geht", async () => {
    await fuegeDokumentHinzu({ mappenId: MAPPE, art: "lebenslauf", dateiname: '../Lebens"lauf\r\n.pdf', text: "Erika" });
    expect(fuegeEinMock.mock.calls[0][1]).toMatchObject({ dateiname: "Lebenslauf.pdf" });
  });
});
