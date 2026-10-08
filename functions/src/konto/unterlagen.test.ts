import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { MAX_DATEI_BYTES } from "../mappe/uploadRegeln";
import {
  contentDispositionUnterlage,
  EINGANG_FRIST_MS,
  eingangPfad,
  istVerwaisterUpload,
  MAX_UNTERLAGEN,
  MAX_UNTERLAGEN_BYTES,
  pruefeNeueUnterlage,
  sichererDateiname,
  UNTERLAGEN_ARTEN,
  unterlagenPfad,
  unterlageSicht,
  type UnterlageEintrag,
} from "./unterlagen";

const leer = { anzahl: 0, bytes: 0 };

describe("pruefeNeueUnterlage", () => {
  it("nimmt ein PDF in normaler Groesse an", () => {
    expect(pruefeNeueUnterlage({ art: "lebenslauf", contentType: "application/pdf", sizeBytes: 500_000 }, leer).ok).toBe(
      true,
    );
  });

  // Ausweiskopien nehmen wir nicht entgegen.
  it("kennt keine Ausweiskopie als Unterlagenart", () => {
    expect(UNTERLAGEN_ARTEN as readonly string[]).not.toContain("ausweiskopie");
    expect([...UNTERLAGEN_ARTEN]).toEqual(["lebenslauf", "zeugnis", "sonstiges"]);
  });

  it("lehnt einen falschen Dateityp ab", () => {
    const ergebnis = pruefeNeueUnterlage({ art: "sonstiges", contentType: "application/zip", sizeBytes: 1000 }, leer);
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt eine zu grosse einzelne Datei ab (10-MB-Grenze)", () => {
    const ergebnis = pruefeNeueUnterlage(
      { art: "sonstiges", contentType: "application/pdf", sizeBytes: MAX_DATEI_BYTES + 1 },
      leer,
    );
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt die 16. Datei ab", () => {
    const ergebnis = pruefeNeueUnterlage(
      { art: "sonstiges", contentType: "application/pdf", sizeBytes: 1000 },
      { anzahl: MAX_UNTERLAGEN, bytes: 1000 },
    );
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt ab, wenn das Konto insgesamt ueber 50 MB kaeme", () => {
    const ergebnis = pruefeNeueUnterlage(
      { art: "sonstiges", contentType: "application/pdf", sizeBytes: 2_000_000 },
      { anzahl: 3, bytes: MAX_UNTERLAGEN_BYTES - 1_000_000 },
    );
    expect(ergebnis.ok).toBe(false);
  });
});

describe("unterlagenPfad", () => {
  it("baut den Storage-Pfad aus uid und docId", () => {
    expect(unterlagenPfad("uid123", "doc456")).toBe("konten/uid123/dokumente/doc456");
  });
});

describe("eingangPfad", () => {
  it("baut einen eigenen Pfad, getrennt von unterlagenPfad", () => {
    expect(eingangPfad("uid123", "doc456")).toBe("konten/uid123/eingang/doc456");
    expect(eingangPfad("uid123", "doc456")).not.toBe(unterlagenPfad("uid123", "doc456"));
  });
});

/**
 * WOZU: dieselbe Regel entscheidet an drei Stellen
 * (eigenes Aufraeumen vor kontoUnterlageUploadUrl, stuendlicher Sweep,
 * Mengengrenzen-Zaehlung) - ein einzelner Test hier deckt alle drei ab.
 */
describe("istVerwaisterUpload", () => {
  const JETZT = 1_800_000_000_000;

  it("gilt als NICHT verwaist kurz nach der Erstellung", () => {
    expect(istVerwaisterUpload(JETZT - 1000, JETZT)).toBe(false);
  });

  it("gilt als NICHT verwaist knapp unter der Frist", () => {
    expect(istVerwaisterUpload(JETZT - (EINGANG_FRIST_MS - 1), JETZT)).toBe(false);
  });

  it("gilt als verwaist GENAU an der Frist (inklusiv)", () => {
    expect(istVerwaisterUpload(JETZT - EINGANG_FRIST_MS, JETZT)).toBe(true);
  });

  it("gilt als verwaist deutlich ueber der Frist", () => {
    expect(istVerwaisterUpload(JETZT - EINGANG_FRIST_MS * 2, JETZT)).toBe(true);
  });
});

describe("sichererDateiname", () => {
  it("laesst einen normalen Dateinamen unangetastet", () => {
    expect(sichererDateiname("lebenslauf.pdf")).toBe("lebenslauf.pdf");
  });

  it("entfernt Pfadanteile (Unix-Trenner)", () => {
    expect(sichererDateiname("../../x.pdf")).toBe("x.pdf");
  });

  it("entfernt Pfadanteile (Windows-Trenner)", () => {
    expect(sichererDateiname("..\\..\\x.pdf")).toBe("x.pdf");
  });

  it("kuerzt auf 120 Zeichen und behaelt die Endung", () => {
    const lang = "a".repeat(200) + ".pdf";
    const ergebnis = sichererDateiname(lang);
    expect(ergebnis.length).toBe(120);
    expect(ergebnis.endsWith(".pdf")).toBe(true);
  });

  /**
   * WOZU: 115 "a" + Emoji (Surrogatpaar) + 50 "b" + ".pdf" -
   * eine codeeinheiten-basierte Kuerzung (`.slice(0,116)`) schneidet genau
   * zwischen den beiden Haelften des Emoji-Surrogatpaars durch. Das
   * uebrig bleibende einzelne Surrogat ist kein gueltiges UTF-16 mehr -
   * `encodeURIComponent` (in `contentDispositionUnterlage`) wirft dann eine
   * URIError, was beim Download dieser einen Datei zu einem dauerhaften 500
   * fuehrt.
   */
  it("schneidet ein Emoji an der Kuerzungsgrenze nicht mitten im Surrogatpaar durch", () => {
    const lang = "a".repeat(115) + "😀" + "b".repeat(50) + ".pdf";
    const ergebnis = sichererDateiname(lang);
    expect(() => encodeURIComponent(ergebnis)).not.toThrow();
    expect(ergebnis.endsWith(".pdf")).toBe(true);
    expect(Array.from(ergebnis)).toContain("😀");
  });

  it("entfernt CR/LF (Header-Injection-Schutz)", () => {
    expect(sichererDateiname("a\r\nb.pdf")).toBe("ab.pdf");
  });

  it("entfernt NUL-Bytes", () => {
    expect(sichererDateiname("a\u0000b.pdf")).toBe("ab.pdf");
  });

  it("entfernt Tabs", () => {
    expect(sichererDateiname("a\tb.pdf")).toBe("ab.pdf");
  });

  it("entfernt Anfuehrungszeichen (landen in einem gequoteten Content-Disposition-Header)", () => {
    expect(sichererDateiname('a"b.pdf')).toBe("ab.pdf");
  });

  it("faellt auf einen Standardnamen zurueck, wenn nach dem Bereinigen nichts uebrig bleibt", () => {
    expect(sichererDateiname("\r\n\u0000")).toBe("unterlage");
  });

  it("faellt bei leerem Stamm auf Standardname + Endung zurueck", () => {
    expect(sichererDateiname("\r\n.pdf")).toBe("unterlage.pdf");
  });

  it("behandelt eine unplausibel lange 'Endung' als Teil des Stamms und bleibt trotzdem <= 120 Zeichen", () => {
    const lang = "a".repeat(150) + "." + "x".repeat(50);
    const ergebnis = sichererDateiname(lang);
    expect(ergebnis.length).toBe(120);
  });

  it("bleibt bei jeder Kombination aus langem Stamm und langer Endung <= 120 Zeichen", () => {
    for (const endungLaenge of [0, 1, 10, 11, 50]) {
      const name = "a".repeat(300) + (endungLaenge > 0 ? "." + "b".repeat(endungLaenge) : "");
      expect(sichererDateiname(name).length).toBeLessThanOrEqual(120);
    }
  });

  // U+202E (RIGHT-TO-LEFT OVERRIDE) dreht im Dateisystem/Browser die sichtbare
  // Zeichenreihenfolge um - "rechnung‮fdp.exe" zeigt sich als
  // "rechnungexe.pdf", der tatsaechliche Typ bleibt aber .exe. Kein
  // ASCII-Steuerzeichen (\x00-\x1f/\x7f), deshalb eigener Test.
  it("entfernt das bidirektionale Steuerzeichen U+202E (RLO)", () => {
    const ergebnis = sichererDateiname("rechnung‮fdp.exe");
    expect(ergebnis).not.toContain("‮");
  });

  it("entfernt weitere Unicode-Format-/Bidi-Zeichen (U+200B, U+2066, U+FEFF)", () => {
    const ergebnis = sichererDateiname("a​b⁦c﻿d.pdf");
    expect(ergebnis).toBe("abcd.pdf");
  });

  // "u" + kombinierender Trema (U+0308) ist zwei Codepunkte, die optisch wie
  // ein vorkomponiertes "ü" aussehen - ohne NFC-Normalisierung waeren das zwei
  // unterschiedliche gespeicherte Namen fuer denselben sichtbaren Text.
  it("normalisiert einen zerlegten Umlaut (NFC)", () => {
    expect(sichererDateiname("grün.pdf")).toBe("grün.pdf");
  });
});

describe("unterlageSicht", () => {
  it("wandelt den gespeicherten Eintrag in die Sicht (ISO-Zeitstempel statt Timestamp)", () => {
    const eintrag: UnterlageEintrag = {
      docId: "d1",
      art: "lebenslauf",
      dateiname: "lebenslauf.pdf",
      contentType: "application/pdf",
      sizeBytes: 1234,
      hochgeladenAm: Timestamp.fromMillis(1_800_000_000_000),
    };
    expect(unterlageSicht(eintrag)).toEqual({
      docId: "d1",
      art: "lebenslauf",
      dateiname: "lebenslauf.pdf",
      contentType: "application/pdf",
      sizeBytes: 1234,
      hochgeladenAm: new Date(1_800_000_000_000).toISOString(),
    });
  });
});

describe("contentDispositionUnterlage", () => {
  it("baut attachment + filename fuer einen einfachen (ASCII-)Namen", () => {
    expect(contentDispositionUnterlage("lebenslauf.pdf")).toBe(
      "attachment; filename=\"lebenslauf.pdf\"; filename*=UTF-8''lebenslauf.pdf",
    );
  });

  it("liefert einen ASCII-Fallback UND den echten, prozent-kodierten Namen bei einem Umlaut", () => {
    const ergebnis = contentDispositionUnterlage("Zeugnis_Müller.pdf");
    expect(ergebnis).toContain('filename="Zeugnis_M_ller.pdf"');
    expect(ergebnis).toContain("filename*=UTF-8''Zeugnis_M%C3%BCller.pdf");
  });

  it("laesst keine Steuerzeichen (Header-Injection) durch - baut auf sichererDateiname auf", () => {
    const ergebnis = contentDispositionUnterlage("a\r\nb.pdf");
    expect(ergebnis).not.toMatch(/[\r\n]/);
  });
});
