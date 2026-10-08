import { describe, it, expect } from "vitest";
import { MAX_DATEI_BYTES, MAX_DATEIEN, MAX_MAPPE_BYTES, erkenneTyp, pruefeUpload } from "./uploadRegeln";

const leer = { anzahl: 0, summeBytes: 0 };

/**
 * WOZU: Ein offener Upload-Endpunkt ist ein kostenloser Dateiserver. Die
 * Kennung hält Fremde draussen, diese Regeln halten den Missbrauch klein.
 */
describe("pruefeUpload", () => {
  it("nimmt ein PDF in normaler Groesse", () => {
    expect(pruefeUpload({ contentType: "application/pdf", sizeBytes: 500_000 }, leer)).toEqual({ ok: true });
  });

  it("nimmt Scans als JPEG und PNG", () => {
    expect(pruefeUpload({ contentType: "image/jpeg", sizeBytes: 1000 }, leer).ok).toBe(true);
    expect(pruefeUpload({ contentType: "image/png", sizeBytes: 1000 }, leer).ok).toBe(true);
  });

  it("lehnt andere Typen ab und sagt welche gehen", () => {
    const ergebnis = pruefeUpload({ contentType: "application/zip", sizeBytes: 1000 }, leer);
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).toMatch(/PDF/);
  });

  it("lehnt eine zu grosse Datei ab", () => {
    expect(pruefeUpload({ contentType: "application/pdf", sizeBytes: MAX_DATEI_BYTES + 1 }, leer).ok).toBe(false);
  });

  it("lehnt die elfte Datei ab", () => {
    const ergebnis = pruefeUpload(
      { contentType: "application/pdf", sizeBytes: 1000 },
      { anzahl: MAX_DATEIEN, summeBytes: 1000 },
    );
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).toMatch(/10/);
  });

  it("lehnt ab, wenn die Mappe insgesamt zu gross wuerde", () => {
    const ergebnis = pruefeUpload(
      { contentType: "application/pdf", sizeBytes: 2_000_000 },
      { anzahl: 3, summeBytes: MAX_MAPPE_BYTES - 1_000_000 },
    );
    expect(ergebnis.ok).toBe(false);
  });
});

describe("erkenneTyp", () => {
  it("erkennt ein PDF an seinem Kopf", () => {
    expect(erkenneTyp(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe("application/pdf");
  });

  it("erkennt JPEG und PNG", () => {
    expect(erkenneTyp(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(erkenneTyp(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
  });

  it("erkennt nichts in Datenmuell - und sagt das, statt zu raten", () => {
    expect(erkenneTyp(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });

  it("kommt mit einer leeren Datei klar", () => {
    expect(erkenneTyp(new Uint8Array())).toBeNull();
  });
});
