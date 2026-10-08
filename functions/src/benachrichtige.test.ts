import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  filterSchluessel,
  kuerzlichBenachrichtigt,
  merklisteZuKlein,
  MAX_SEITEN,
  MIN_ABSTAND_STUNDEN,
  plane,
  rotiert,
  sammleKandidaten,
  SEITE,
  vereinigeSammlungen,
  type KontoBenachrichtigungsStand,
  type StellenKandidat,
} from "./benachrichtige";
import { aktiveSuchfilter } from "./konto/suchprofile";
import { listJobsFilterAus } from "./mcp/lib/suchfilter";
import type { JobQueryFilter, JobQueryResult } from "./mcp/lib/queryJobs";
import { MAX_STELLEN_JE_MAIL } from "./konto/benachrichtigung";
import { MERKLISTE_MAX } from "./konto/kontoTypen";

const TAG_MS = 86_400_000;

function kandidat(over: Partial<StellenKandidat> = {}): StellenKandidat {
  return {
    pinstGuid: "id-1",
    firstSeenAtMs: 2000,
    titel: "Titel",
    ort: "Ort",
    bewerbungsschluss: "01.01.2028",
    ...over,
  };
}

const KONTO: KontoBenachrichtigungsStand = { seitMs: 1000, gemeldet: [] };

describe("plane", () => {
  it("liefert null, wenn es keine Kandidaten gibt", () => {
    expect(plane(KONTO, [], 5000)).toBeNull();
  });

  it("liefert null, wenn nur bereits gemeldete Stellen da sind", () => {
    const k = kandidat({ pinstGuid: "schon-da", firstSeenAtMs: 3000 });
    expect(plane({ ...KONTO, gemeldet: ["schon-da"] }, [k], 5000)).toBeNull();
  });

  it("baut senden aus den ersten MAX_STELLEN_JE_MAIL (neueste zuerst), weitere aus dem Rest", () => {
    const kandidaten = Array.from({ length: MAX_STELLEN_JE_MAIL + 3 }, (_, i) =>
      kandidat({ pinstGuid: `id-${i}`, firstSeenAtMs: 2000 + i }),
    );
    const ergebnis = plane(KONTO, kandidaten, 9999);
    expect(ergebnis?.senden.length).toBe(MAX_STELLEN_JE_MAIL);
    expect(ergebnis?.weitere).toBe(3);
    expect(ergebnis?.senden[0].pinstGuid).toBe(`id-${MAX_STELLEN_JE_MAIL + 2}`);
  });

  it("neueGemeldet enthaelt ALLE neuen IDs, nicht nur die tatsaechlich versendeten", () => {
    const kandidaten = Array.from({ length: MAX_STELLEN_JE_MAIL + 2 }, (_, i) =>
      kandidat({ pinstGuid: `id-${i}`, firstSeenAtMs: 2000 + i }),
    );
    const ergebnis = plane(KONTO, kandidaten, 9999);
    expect(ergebnis?.neueGemeldet.length).toBe(MAX_STELLEN_JE_MAIL + 2);
    expect(ergebnis?.neueGemeldet).toContain(`id-${MAX_STELLEN_JE_MAIL + 1}`);
  });

  // ALLE neuen Stellen kommen auf die Merkliste,
  // auch die "und N weitere" - dort findet der Bewerber genau die, die die
  // Mail nicht einzeln nennt. Neueste zuerst, ohne schon gemeldete.
  it("neu enthaelt alle neuen Stellen einschliesslich der weiteren, neueste zuerst, ohne schon gemeldete", () => {
    const kandidaten = Array.from({ length: MAX_STELLEN_JE_MAIL + 2 }, (_, i) =>
      kandidat({ pinstGuid: `id-${i}`, firstSeenAtMs: 2000 + i }),
    );
    const ergebnis = plane({ seitMs: 1000, gemeldet: ["id-0"] }, kandidaten, 9999);
    expect(ergebnis?.neu).toHaveLength(MAX_STELLEN_JE_MAIL + 1);
    expect(ergebnis?.neu[0]).toBe(`id-${MAX_STELLEN_JE_MAIL + 1}`);
    expect(ergebnis?.neu).not.toContain("id-0");
    expect(ergebnis?.neu.slice(0, MAX_STELLEN_JE_MAIL)).toEqual(ergebnis?.senden.map((s) => s.pinstGuid));
  });

  it("uebertraegt titel/ort/bewerbungsschluss unveraendert in die MailStelle", () => {
    const k = kandidat({ titel: "Elektroniker", ort: "Köln", bewerbungsschluss: "01.06.2027" });
    const ergebnis = plane(KONTO, [k], 9999);
    expect(ergebnis?.senden[0]).toEqual({
      pinstGuid: "id-1",
      titel: "Elektroniker",
      ort: "Köln",
      bewerbungsschluss: "01.06.2027",
    });
  });
});

/**
 * `letzteAm` als zweite, mit jeder Nacht vorrueckende Untergrenze wuerde
 * Stellen verschlucken, die aus welchem Grund auch immer (Fetch-Limit,
 * Zwischensync) erst eine Nacht spaeter als Kandidat auftauchen. `letzteAm`
 * ist deshalb reine Information (wird nach dem Versand geschrieben, s.
 * benachrichtigeKonten), aber KEINE Grenze - `plane()` bekommt es gar nicht
 * uebergeben.
 */
describe("plane - Stellen gehen nicht verloren, wenn sie eine Nacht zu spaet auftauchen", () => {
  it("Stelle 51 von 60 an einer Nacht neuen Stellen geht nicht verloren, sondern kommt in der naechsten Nacht", () => {
    const seitMs = Date.parse("2027-01-01T00:00:00Z");
    const nacht1 = Date.parse("2027-09-20T04:00:00Z");
    const nacht2 = nacht1 + TAG_MS;

    // Nacht 1: aus welchem Grund auch immer (z.B. ein Fetch-Limit) sind nur
    // die 50 juengsten der 60 an diesem Tag neuen Stellen als Kandidat da.
    const kandidatenNacht1 = Array.from({ length: 50 }, (_, i) =>
      kandidat({ pinstGuid: `frisch-${i}`, firstSeenAtMs: nacht1 - i * 1000 }),
    );
    const ergebnis1 = plane({ seitMs, gemeldet: [] }, kandidatenNacht1, nacht1);
    expect(ergebnis1).not.toBeNull();
    expect(ergebnis1?.neueGemeldet).toHaveLength(50);

    // Nacht 2: "Stelle 51" (aelter als alle 50 von gestern, aber vom selben
    // Tag) taucht erst hier als Kandidat auf. Mit max(seit, letzteAm) als
    // Grenze waere sie schon aelter als `letzteAm` (=nacht1) und damit fuer
    // immer verloren.
    const stelle51 = kandidat({ pinstGuid: "stelle-51", firstSeenAtMs: nacht1 - 50_000 });
    const ergebnis2 = plane({ seitMs, gemeldet: ergebnis1!.neueGemeldet }, [stelle51, ...kandidatenNacht1], nacht2);

    expect(ergebnis2).not.toBeNull();
    expect(ergebnis2?.senden.map((s) => s.pinstGuid)).toContain("stelle-51");
  });

  it("eine erst waehrend des Laufs (z.B. durch einen manuellen Sync) gesehene Stelle wird in der naechsten Nacht gemeldet", () => {
    const seitMs = Date.parse("2027-01-01T00:00:00Z");
    const nacht1 = Date.parse("2027-09-20T04:00:00Z");
    // Nacht 1 sieht die Stelle noch gar nicht als Kandidat (sie entsteht erst
    // NACH dem Zeitpunkt, den Nacht 1 als `jetzt` verwendet hat).
    const ergebnis1 = plane({ seitMs, gemeldet: [] }, [], nacht1);
    expect(ergebnis1).toBeNull();

    const spaeteStelle = kandidat({ pinstGuid: "waehrend-des-laufs", firstSeenAtMs: nacht1 + 5 * 60 * 1000 });
    const nacht2 = nacht1 + TAG_MS;
    const ergebnis2 = plane({ seitMs, gemeldet: [] }, [spaeteStelle], nacht2);
    expect(ergebnis2?.senden.map((s) => s.pinstGuid)).toEqual(["waehrend-des-laufs"]);
  });

  it("nichts aelter als NEU_FENSTER_TAGE (7 Tage) wird gemeldet, selbst wenn es neuer als `seit` und nicht gemeldet ist", () => {
    const seitMs = Date.parse("2020-01-01T00:00:00Z"); // Konto seit Jahren aktiv
    const jetzt = Date.parse("2027-09-20T04:00:00Z");

    const uralt = kandidat({ pinstGuid: "uralt", firstSeenAtMs: jetzt - 10 * TAG_MS });
    expect(plane({ seitMs, gemeldet: [] }, [uralt], jetzt)).toBeNull();

    const geradeNoch = kandidat({ pinstGuid: "gerade-noch", firstSeenAtMs: jetzt - 6 * TAG_MS });
    const ergebnis = plane({ seitMs, gemeldet: [] }, [geradeNoch], jetzt);
    expect(ergebnis?.senden.map((s) => s.pinstGuid)).toEqual(["gerade-noch"]);
  });
});

// ─── Kandidatensuche und Mail-Abstand ───────────────────────────────────────

function treffer(pinstGuid: string, firstSeenAtMs: number) {
  return {
    pinstGuid,
    firstSeenAt: Timestamp.fromMillis(firstSeenAtMs),
    title: "Titel",
    besOrt: "Ort",
    applicationEnd: "01.01.2028",
  };
}

function ergebnis(results: ReturnType<typeof treffer>[], extra: Partial<JobQueryResult> = {}): JobQueryResult {
  return {
    results: results as unknown as JobQueryResult["results"],
    totalCount: results.length,
    gelesen: results.length,
    abgeschnitten: false,
    sortierung: "neueste",
    ...extra,
  };
}

// WOZU: je Filter und Nacht hoechstens zwei queryJobs-Aufrufe, egal wie viele
// Seiten das 7-Tage-Fenster fuellt.
describe("sammleKandidaten - hoechstens zwei Abfragen", () => {
  const jetzt = Date.parse("2027-09-20T04:00:00Z");
  const FILTER: JobQueryFilter = { wunschort: "Köln" };

  it("eine Seite reicht, wenn es keinen Cursor gibt", async () => {
    const abfragen = vi.fn().mockResolvedValueOnce(ergebnis([treffer("a", jetzt - 1000)]));
    const s = await sammleKandidaten(FILTER, jetzt, abfragen);
    expect(abfragen).toHaveBeenCalledTimes(1);
    expect(abfragen.mock.calls[0][0]).toMatchObject({ wunschort: "Köln", sortierung: "neueste", limit: SEITE });
    expect(abfragen.mock.calls[0][0].cursor).toBeUndefined();
    expect(s.kandidaten.map((k) => k.pinstGuid)).toEqual(["a"]);
    expect(s.seitenDeckel).toBe(false);
  });

  it("stoppt nach Seite 1, wenn deren letzter Treffer schon vor dem 7-Tage-Fenster liegt", async () => {
    const abfragen = vi
      .fn()
      .mockResolvedValueOnce(ergebnis([treffer("a", jetzt - 1000), treffer("alt", jetzt - 8 * TAG_MS)], { naechsterCursor: "c1" }));
    const s = await sammleKandidaten(FILTER, jetzt, abfragen);
    expect(abfragen).toHaveBeenCalledTimes(1);
    expect(s.seitenDeckel).toBe(false);
  });

  it("holt den Rest in EINEM zweiten Aufruf mit Cursor und limit (MAX_SEITEN - 1) * SEITE", async () => {
    const abfragen = vi
      .fn()
      .mockResolvedValueOnce(ergebnis([treffer("a", jetzt - 1000)], { naechsterCursor: "c1", abgeschnitten: false }))
      .mockResolvedValueOnce(ergebnis([treffer("b", jetzt - 2000), treffer("alt", jetzt - 8 * TAG_MS)], { abgeschnitten: true }));
    const s = await sammleKandidaten(FILTER, jetzt, abfragen);
    expect(abfragen).toHaveBeenCalledTimes(2);
    expect(abfragen.mock.calls[1][0]).toMatchObject({
      wunschort: "Köln",
      sortierung: "neueste",
      cursor: "c1",
      limit: (MAX_SEITEN - 1) * SEITE,
    });
    expect(s.kandidaten.map((k) => k.pinstGuid)).toEqual(["a", "b", "alt"]);
    expect(s.abgeschnitten).toBe(true);
    expect(s.seitenDeckel).toBe(false);
  });

  it("meldet seitenDeckel, wenn auch der zweite Aufruf noch im Fenster endet und weiterblaettern koennte", async () => {
    const abfragen = vi
      .fn()
      .mockResolvedValueOnce(ergebnis([treffer("a", jetzt - 1000)], { naechsterCursor: "c1" }))
      .mockResolvedValueOnce(ergebnis([treffer("b", jetzt - 2000)], { naechsterCursor: "c2" }));
    const s = await sammleKandidaten(FILTER, jetzt, abfragen);
    expect(abfragen).toHaveBeenCalledTimes(2);
    expect(s.seitenDeckel).toBe(true);
  });

  it("kein seitenDeckel, wenn der zweite Aufruf keinen Cursor mehr hat", async () => {
    const abfragen = vi
      .fn()
      .mockResolvedValueOnce(ergebnis([treffer("a", jetzt - 1000)], { naechsterCursor: "c1" }))
      .mockResolvedValueOnce(ergebnis([treffer("b", jetzt - 2000)]));
    const s = await sammleKandidaten(FILTER, jetzt, abfragen);
    expect(s.seitenDeckel).toBe(false);
  });
});

// WOZU: ein Konto haelt mehrere Filter, ein
// Treffer auf irgendeinen aktiven zaehlt - aber eine Stelle, die zu zwei
// Filtern passt, ist trotzdem nur EINE neue Stelle.
describe("vereinigeSammlungen - mehrere Filter eines Kontos", () => {
  it("fuehrt die Kandidaten zusammen und zaehlt eine Stelle aus zwei Filtern nur einmal", () => {
    const v = vereinigeSammlungen([
      { kandidaten: [kandidat({ pinstGuid: "a" }), kandidat({ pinstGuid: "b" })], abgeschnitten: false, seitenDeckel: false },
      { kandidaten: [kandidat({ pinstGuid: "b" }), kandidat({ pinstGuid: "c" })], abgeschnitten: false, seitenDeckel: false },
    ]);
    expect(v.kandidaten.map((k) => k.pinstGuid).sort()).toEqual(["a", "b", "c"]);
    expect(v.abgeschnitten).toBe(false);
    expect(v.seitenDeckel).toBe(false);
  });

  it("meldet abgeschnitten/seitenDeckel, sobald ein einziger Filter betroffen ist", () => {
    const leer = { kandidaten: [], abgeschnitten: false, seitenDeckel: false };
    expect(vereinigeSammlungen([leer, { ...leer, abgeschnitten: true }]).abgeschnitten).toBe(true);
    expect(vereinigeSammlungen([{ ...leer, seitenDeckel: true }, leer]).seitenDeckel).toBe(true);
    expect(vereinigeSammlungen([])).toEqual(leer);
  });

  it("plant aus den vereinigten Kandidaten genau eine Mail ohne Doppelmeldung", () => {
    const jetzt = 10 * TAG_MS;
    const v = vereinigeSammlungen([
      { kandidaten: [kandidat({ pinstGuid: "a", firstSeenAtMs: jetzt - 1000 })], abgeschnitten: false, seitenDeckel: false },
      {
        kandidaten: [kandidat({ pinstGuid: "a", firstSeenAtMs: jetzt - 1000 }), kandidat({ pinstGuid: "b", firstSeenAtMs: jetzt - 500 })],
        abgeschnitten: false,
        seitenDeckel: false,
      },
    ]);
    const planung = plane({ seitMs: 0, gemeldet: [] }, v.kandidaten, jetzt);
    expect(planung?.senden.map((s) => s.pinstGuid)).toEqual(["b", "a"]);
    expect(planung?.weitere).toBe(0);
    expect(planung?.neueGemeldet).toEqual(["b", "a"]);
  });

  it("fragt pausierte Filter gar nicht erst ab (aktiveSuchfilter)", async () => {
    const jetzt = Date.parse("2027-09-20T04:00:00Z");
    const abfragen = vi.fn().mockResolvedValue(ergebnis([treffer("a", jetzt - 1000)]));
    const eintraege = [
      { aktiv: true, filter: { wunschort: "Köln" } },
      { aktiv: false, filter: { wunschort: "Ulm" } },
    ];
    await Promise.all(aktiveSuchfilter(eintraege).map((f) => sammleKandidaten(listJobsFilterAus(f), jetzt, abfragen)));
    expect(abfragen).toHaveBeenCalledTimes(1);
    expect(abfragen.mock.calls[0][0]).toMatchObject({ wunschort: "Köln" });
  });
});

describe("filterSchluessel", () => {
  it("ist unabhaengig von Schluesselreihenfolge und undefined-Feldern", () => {
    expect(filterSchluessel({ wunschort: "Köln", bundesland: ["NW"] })).toBe(
      filterSchluessel({ bundesland: ["NW"], suchbegriff: undefined, wunschort: "Köln" }),
    );
  });

  it("unterscheidet verschiedene Werte", () => {
    expect(filterSchluessel({ wunschort: "Köln" })).not.toBe(filterSchluessel({ wunschort: "Bonn" }));
  });
});

// WOZU: laeuft ein Lauf in den Timeout, sollen nicht jede Nacht dieselben
// Konten am Listenende leer ausgehen.
describe("rotiert", () => {
  it("beginnt am Tag n bei Index n mod Laenge", () => {
    expect(rotiert(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
    expect(rotiert(["a", "b", "c"], 1 * TAG_MS)).toEqual(["b", "c", "a"]);
    expect(rotiert(["a", "b", "c"], 5 * TAG_MS + 123)).toEqual(["c", "a", "b"]);
  });

  it("liefert fuer eine leere Liste eine leere Liste", () => {
    expect(rotiert([], 7 * TAG_MS)).toEqual([]);
  });
});

// WOZU: "hoechstens eine Mail je Nacht" - ein zweiter Lauf (manueller
// Trigger, Wiederholung des Schedulers) darf keine zweite Mail verschicken.
describe("kuerzlichBenachrichtigt", () => {
  const jetzt = Date.parse("2027-09-20T04:00:00Z");
  const STUNDE = 3_600_000;

  it("ist false, wenn noch nie benachrichtigt wurde", () => {
    expect(kuerzlichBenachrichtigt(null, jetzt, false)).toBe(false);
  });

  it("ist true unter MIN_ABSTAND_STUNDEN", () => {
    expect(MIN_ABSTAND_STUNDEN).toBe(20);
    expect(kuerzlichBenachrichtigt(jetzt - 19 * STUNDE, jetzt, false)).toBe(true);
  });

  it("ist false ab MIN_ABSTAND_STUNDEN (auch am Tag der Zeitumstellung mit 23 h)", () => {
    expect(kuerzlichBenachrichtigt(jetzt - 20 * STUNDE, jetzt, false)).toBe(false);
    expect(kuerzlichBenachrichtigt(jetzt - 23 * STUNDE, jetzt, false)).toBe(false);
  });

  it("ist mit erzwingen immer false", () => {
    expect(kuerzlichBenachrichtigt(jetzt - STUNDE, jetzt, true)).toBe(false);
  });
});

/**
 * WOZU: der Satz "Du findest diese Stellen auch auf deiner Merkliste" darf nur
 * dastehen, wenn sie auch hinpassen - und eine kaputte Merkliste darf die Mail
 * nicht aufhalten.
 */
describe("merklisteZuKlein", () => {
  const record = (merkliste: unknown[]) =>
    ({ schemaVersion: "konto-v1", erstelltAm: Timestamp.fromMillis(0), suchprofile: [], merkliste }) as never;
  const eintrag = (pinstGuid: string) => ({ pinstGuid, gemerktAm: Timestamp.fromMillis(1) });

  it("ist false, solange alle neuen Stellen Platz haben oder schon draufstehen", () => {
    expect(merklisteZuKlein(record([eintrag("A")]), ["A", "B"])).toBe(false);
    const fastVoll = Array.from({ length: MERKLISTE_MAX - 1 }, (_, i) => eintrag(`S${i}`));
    expect(merklisteZuKlein(record(fastVoll), ["S0", "NEU"])).toBe(false);
  });

  it("ist true, sobald eine neue Stelle nicht mehr passt", () => {
    const voll = Array.from({ length: MERKLISTE_MAX }, (_, i) => eintrag(`S${i}`));
    expect(merklisteZuKlein(record(voll), ["NEU"])).toBe(true);
  });

  it("ist false ohne Konto und bei einer kaputten Merkliste", () => {
    expect(merklisteZuKlein(undefined, ["NEU"])).toBe(false);
    expect(merklisteZuKlein(record([{ pinstGuid: "KAPUTT" }]), ["NEU"])).toBe(false);
  });
});
