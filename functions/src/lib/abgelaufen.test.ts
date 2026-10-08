import { describe, expect, it } from "vitest";
import { ARCHIV_TAGE, GNADENFRIST_TAGE, istAbgelaufen, istArchivReif } from "./abgelaufen";
import { toApplicationEndSortKey } from "./applicationEndSortKey";

const TAG_MS = 24 * 60 * 60 * 1000;
/** Stichtag 15.08.2026, als Sortkey (= Mitternacht zu Beginn des Tages). */
const STICHTAG = toApplicationEndSortKey("15.08.2026").toMillis();

describe("istAbgelaufen", () => {
  it("laesst den Stichtag selbst als offen gelten", () => {
    // Der eigentliche Fehler, den diese Funktion verhindert: um 23:59 des
    // Stichtags kann man sich noch bewerben.
    expect(istAbgelaufen(STICHTAG, STICHTAG + TAG_MS - 1, 0)).toBe(false);
  });

  it("erklaert den Tag nach dem Stichtag ohne Gnadenfrist fuer abgelaufen", () => {
    expect(istAbgelaufen(STICHTAG, STICHTAG + TAG_MS, 0)).toBe(true);
  });

  it("haelt die Stelle waehrend der Gnadenfrist", () => {
    const kurzVorEnde = STICHTAG + (1 + GNADENFRIST_TAGE) * TAG_MS - 1;
    expect(istAbgelaufen(STICHTAG, kurzVorEnde)).toBe(false);
    expect(istAbgelaufen(STICHTAG, kurzVorEnde + 1)).toBe(true);
  });

  it("behandelt eine fehlende Frist als NICHT abgelaufen", () => {
    // Im Zweifel nicht loeschen - die API liefert eine entfernte Stelle nie zurueck.
    expect(istAbgelaufen(null, Date.now())).toBe(false);
    expect(istAbgelaufen(undefined, Date.now())).toBe(false);
  });

  it("laesst den Sentinel fuer unparsbare Fristen nie ablaufen", () => {
    const sentinel = toApplicationEndSortKey("").toMillis();
    expect(istAbgelaufen(sentinel, Date.now())).toBe(false);
  });

  it("erkennt lange abgelaufene Stellen", () => {
    expect(istAbgelaufen(STICHTAG, STICHTAG + 316 * TAG_MS)).toBe(true);
  });
});

describe("istArchivReif", () => {
  const ARCHIVIERT_AM = STICHTAG + 5 * TAG_MS;

  it("haelt die Stelle waehrend des Archivfensters", () => {
    expect(istArchivReif(ARCHIVIERT_AM, ARCHIVIERT_AM + (ARCHIV_TAGE - 1) * TAG_MS)).toBe(false);
  });

  it("gibt sie nach Ablauf des Fensters zum Loeschen frei", () => {
    expect(istArchivReif(ARCHIVIERT_AM, ARCHIVIERT_AM + ARCHIV_TAGE * TAG_MS)).toBe(true);
  });

  it("behaelt eine Stelle ohne removedAt, statt blind zu loeschen", () => {
    // Ohne Zeitstempel laesst sich das Alter nicht bestimmen. Loeschen ist
    // endgueltig, ein weiterer Lauf kostet nichts - also im Zweifel behalten.
    expect(istArchivReif(null, Date.now())).toBe(false);
    expect(istArchivReif(undefined, Date.now())).toBe(false);
  });

  it("archiviert deutlich laenger, als die Stelle in der Suche bleibt", () => {
    // Sonst waere das Archiv sinnlos: es soll ueberdauern, nicht nur nachlaufen.
    expect(ARCHIV_TAGE).toBeGreaterThan(GNADENFRIST_TAGE);
  });
});
