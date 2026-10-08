import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { textZuPdf, umbrechen, schriftSicher, zeilenFuerPdf } from "./textZuPdf";

describe("textZuPdf", () => {
  it("erzeugt ein PDF, das als PDF erkennbar ist", async () => {
    const bytes = await textZuPdf("Lebenslauf", "Erika Musterfrau\nGeboren 1998");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it("uebersteht Umlaute und Sonderzeichen der Bewerbersprache", async () => {
    await expect(textZuPdf("Anschreiben", "Gruesse aus Koeln - ss, ae, oe, ue")).resolves.toBeInstanceOf(Uint8Array);
  });

  it("wirft nicht bei C0-/C1-Steuerzeichen, Emoji, Euro und Anfuehrungszeichen", async () => {
    const text = "a\u0085b\u0081c\u009Fd\u0007e\u007F\tf \u20AC 5 \u201Ezitiert\u201C \u{1F600}\n\nEnde";
    await expect(textZuPdf("Titel\u0085mit\nUmbruch", text)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("zeilenFuerPdf", () => {
  it("behaelt die Zeilenumbrueche - mehrzeiliger Text ergibt mehrere Zeilen", () => {
    expect(zeilenFuerPdf("Sehr geehrte Damen und Herren,\n\nich bewerbe mich.\nMit Gruessen", 92)).toEqual([
      "Sehr geehrte Damen und Herren,",
      "",
      "ich bewerbe mich.",
      "Mit Gruessen",
    ]);
  });

  it("versteht auch Windows- und alte Mac-Zeilenenden", () => {
    expect(zeilenFuerPdf("eins\r\nzwei\rdrei", 92)).toEqual(["eins", "zwei", "drei"]);
  });

  it("bricht lange Zeilen innerhalb eines Absatzes weiter um", () => {
    const zeilen = zeilenFuerPdf(`${"wort ".repeat(40)}\nzweiter Absatz`, 92);
    expect(zeilen.length).toBeGreaterThan(2);
    expect(zeilen.at(-1)).toBe("zweiter Absatz");
  });
});

describe("schriftSicher", () => {
  it("laesst Euro und die deutschen Anfuehrungszeichen stehen", () => {
    const text = "\u201Edoppelt\u201C \u201Aeinfach\u2018 \u201Cengl\u201D \u2019 5 \u20AC";
    expect(schriftSicher(text)).toBe(text);
  });

  it("laesst Halbgeviert-, Geviertstrich, Auslassungspunkte und Aufzaehlungspunkt stehen", () => {
    const text = "a\u2013b\u2014c\u2026 \u2022 Punkt";
    expect(schriftSicher(text)).toBe(text);
  });

  it("loescht, was die Schrift nicht kann - etwa ein Emoji", () => {
    expect(schriftSicher("Gru\u00df \u{1F600}")).toBe("Gru\u00df ");
  });

  it("loescht C0- und C1-Steuerzeichen, macht aus Tabulatoren Leerzeichen", () => {
    expect(schriftSicher("a\u0085b\u0081c\u009Fd\u0000e\u007Ff\tg")).toBe("abcdef g");
  });

  it("laesst Umlaute unversehrt, die Schrift kann sie", () => {
    expect(schriftSicher("Gr\u00fc\u00dfe aus K\u00f6ln")).toBe("Gr\u00fc\u00dfe aus K\u00f6ln");
  });

  it("jedes behaltene Zeichen ist mit Helvetica und Helvetica-Bold kodierbar", async () => {
    const pdf = await PDFDocument.create();
    const schriften = [await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold)];
    const unkodierbar: string[] = [];
    for (let cp = 0; cp <= 0xffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const behalten = schriftSicher(String.fromCodePoint(cp));
      if (!behalten) continue;
      for (const schrift of schriften) {
        try {
          schrift.encodeText(behalten);
          schrift.widthOfTextAtSize(behalten, 10);
        } catch {
          unkodierbar.push(cp.toString(16));
        }
      }
    }
    expect(unkodierbar).toEqual([]);
  });
});

describe("umbrechen", () => {
  it("haelt jede Zeile innerhalb der erlaubten Laenge", () => {
    const zeilen = umbrechen("wort ".repeat(400), 92);
    expect(zeilen.length).toBeGreaterThan(20);
    for (const zeile of zeilen) expect(zeile.length).toBeLessThanOrEqual(92);
  });

  it("verliert kein Wort", () => {
    const text = "Erika Musterfrau arbeitet seit 2019 als Logistikerin in Koeln.";
    expect(umbrechen(text, 20).join(" ").split(/\s+/).sort()).toEqual(text.split(/\s+/).sort());
  });

  it("bricht ein Wort, das laenger ist als die Zeile, hart um statt es zu verlieren", () => {
    const zeilen = umbrechen("A".repeat(200), 92);
    expect(zeilen.every((zeile) => zeile.length <= 92)).toBe(true);
    expect(zeilen.join("")).toBe("A".repeat(200));
  });

  it("haengt sich bei einer unsinnigen Zeilenlaenge nicht auf", () => {
    expect(umbrechen("abc", 0)).toEqual(["a", "b", "c"]);
  });
});

describe("textZuPdf Seitenumbruch", () => {
  it("legt fuer langen Text eine zweite Seite an", async () => {
    const bytes = await textZuPdf("Lebenslauf", "Zeile mit Inhalt\n".repeat(300));
    const geladen = await PDFDocument.load(bytes);
    expect(geladen.getPageCount()).toBeGreaterThan(1);
  });
});
