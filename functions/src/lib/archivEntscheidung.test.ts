import { describe, expect, it, vi } from "vitest";
import type { BatchResult } from "../types";
import { entscheideArchivierung, klassifiziereDetailAntwort, type Veroeffentlichung } from "./archivEntscheidung";

const NICHT_MEHR_VEROEFFENTLICHT: BatchResult = {
  status: 400,
  ok: false,
  body: null,
  rawText:
    '{"error":{"code":"HRRCF0002/800","message":{"lang":"de","value":"Es ist ein Fehler aufgetreten - Die aufgerufene Stellenausschreibung ist nicht mehr veröffentlicht."}}}',
};
const ALLGEMEINER_400: BatchResult = {
  status: 400,
  ok: false,
  body: null,
  rawText: '{"error":{"code":"HRRCF0002/800","message":{"lang":"de","value":"Es ist ein Fehler aufgetreten"}}}',
};
const LIVE = (guid: string): BatchResult => ({ status: 200, ok: true, body: { d: { PinstGuid: guid } }, rawText: "" });

describe("klassifiziereDetailAntwort", () => {
  it("erkennt die zurueckgezogene Ausschreibung am Wortlaut der API", () => {
    expect(klassifiziereDetailAntwort(NICHT_MEHR_VEROEFFENTLICHT, "A")).toBe("zurueckgezogen");
  });

  it("nimmt 404 als zurueckgezogen", () => {
    expect(klassifiziereDetailAntwort({ status: 404, ok: false, body: null, rawText: "" }, "A")).toBe("zurueckgezogen");
  });

  /**
   * WOZU: Dieselbe API antwortet auch auf eine kaputte Anfrage mit HTTP 400 -
   * nur ohne den Zusatz "nicht mehr veroeffentlicht" (z.B. bei einer
   * erfundenen PinstGuid). Ein Fehler in unserer Abfrage darf nie den
   * ganzen Bestand archivieren.
   */
  it("haelt einen 400 ohne den Zurueckgezogen-Wortlaut fuer unklar", () => {
    expect(klassifiziereDetailAntwort(ALLGEMEINER_400, "A")).toBe("unklar");
  });

  it("erkennt eine noch veroeffentlichte Stelle", () => {
    expect(klassifiziereDetailAntwort(LIVE("A"), "A")).toBe("veroeffentlicht");
  });

  it("haelt 5xx und fehlende Antworten fuer unklar", () => {
    expect(klassifiziereDetailAntwort({ status: 503, ok: false, body: null, rawText: "" }, "A")).toBe("unklar");
    expect(klassifiziereDetailAntwort(undefined, "A")).toBe("unklar");
  });

  it("haelt eine 200-Antwort fuer eine andere Stelle fuer unklar", () => {
    expect(klassifiziereDetailAntwort(LIVE("B"), "A")).toBe("unklar");
  });
});

describe("entscheideArchivierung", () => {
  const pruefeMit = (antworten: Record<string, Veroeffentlichung>) =>
    vi.fn(async (guids: string[]) => new Map(guids.map((g) => [g, antworten[g] ?? "unklar"] as const)));

  it("archiviert eine nicht gelistete Stelle, deren Detailabruf sie als zurueckgezogen bestaetigt", async () => {
    const ergebnis = await entscheideArchivierung(["weg"], new Set(), pruefeMit({ weg: "zurueckgezogen" }));
    expect(ergebnis.archivieren).toEqual(["weg"]);
    expect(ergebnis.nochVeroeffentlicht).toEqual([]);
  });

  /**
   * WOZU: Die API liefert hoechstens 1000 Stellen im
   * Listing. Eine Stelle jenseits dieses Deckels fehlt im Listing, ist aber
   * per Detailabruf weiter da - sie zu archivieren nimmt eine offene Stelle
   * aus jeder Suche.
   */
  it("laesst eine nicht gelistete, aber noch veroeffentlichte Stelle aktiv", async () => {
    const ergebnis = await entscheideArchivierung(["live"], new Set(), pruefeMit({ live: "veroeffentlicht" }));
    expect(ergebnis.archivieren).toEqual([]);
    expect(ergebnis.nochVeroeffentlicht).toEqual(["live"]);
  });

  it("archiviert bei Fehler oder Zeitueberschreitung nicht, sondern prueft in der naechsten Nacht neu", async () => {
    const ergebnis = await entscheideArchivierung(["kaputt"], new Set(), pruefeMit({ kaputt: "unklar" }));
    expect(ergebnis.archivieren).toEqual([]);
    expect(ergebnis.nochVeroeffentlicht).toEqual([]);
    expect(ergebnis.unklar).toEqual(["kaputt"]);
  });

  it("archiviert nichts, wenn die ganze Pruefung wirft", async () => {
    const pruefe = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    const ergebnis = await entscheideArchivierung(["a", "b"], new Set(["alt"]), pruefe);
    expect(ergebnis.archivieren).toEqual(["alt"]);
    expect(ergebnis.unklar).toEqual(["a", "b"]);
  });

  it("archiviert abgelaufene Stellen ohne Detailabruf", async () => {
    const pruefe = pruefeMit({});
    const ergebnis = await entscheideArchivierung(["abgelaufen-und-weg"], new Set(["abgelaufen-und-weg", "abgelaufen-gelistet"]), pruefe);
    expect(ergebnis.archivieren.sort()).toEqual(["abgelaufen-gelistet", "abgelaufen-und-weg"]);
    expect(pruefe).not.toHaveBeenCalled();
  });

  it("meldet die Zaehlung fuer das Log", async () => {
    const ergebnis = await entscheideArchivierung(
      ["weg", "live", "kaputt", "abgelaufen"],
      new Set(["abgelaufen"]),
      pruefeMit({ weg: "zurueckgezogen", live: "veroeffentlicht" }),
    );
    expect(ergebnis.zaehlung).toEqual({
      nichtGelistet: 4,
      abgelaufen: 1,
      geprueft: 3,
      bestaetigtZurueckgezogen: 1,
      nochVeroeffentlicht: 1,
      unklar: 1,
    });
  });
});
