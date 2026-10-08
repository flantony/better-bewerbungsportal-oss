import { describe, expect, it, vi, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

const getFirestoreMock = vi.fn();
vi.mock("firebase-admin/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase-admin/firestore")>();
  return { ...actual, getFirestore: (...a: unknown[]) => getFirestoreMock(...a) };
});

const { raeumeMerklistenAuf, merklistenIds, MIN_AKTIVE_STELLEN } = await import("./merklisteAufraeumen");

type Daten = Record<string, unknown>;

/**
 * Minimaler Firestore fuer den Lauf: `konten` (mit `select`), `jobsV2` (mit
 * `getAll` samt Feldmaske) und Transaktionen, die sofort schreiben. Zaehlt die
 * gelesenen Stellen-Dokumente, damit die Kostengrenze pruefbar ist.
 */
function fakeDb(konten: Record<string, Daten>, jobs: Record<string, Daten>, fuellStellen = MIN_AKTIVE_STELLEN) {
  const daten = new Map<string, Daten>();
  // Ein plausibler Bestand, den keine Merkliste enthaelt (s. MIN_AKTIVE_STELLEN).
  for (let i = 0; i < fuellStellen; i++) daten.set(`jobsV2/FUELL${i}`, { active: true });
  for (const [uid, d] of Object.entries(konten)) daten.set(`konten/${uid}`, d);
  for (const [id, d] of Object.entries(jobs)) daten.set(`jobsV2/${id}`, d);
  const zaehler = { jobReads: 0, getAllAufrufe: 0, transaktionen: 0 };

  const ref = (pfad: string) => ({
    __pfad: pfad,
    id: pfad.split("/").at(-1),
    get: async () => ({ exists: daten.has(pfad), data: () => daten.get(pfad) }),
    update: async (patch: Daten) => {
      daten.set(pfad, { ...(daten.get(pfad) ?? {}), ...patch });
    },
  });

  return {
    daten,
    zaehler,
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
      where: (feld: string, _op: string, wert: unknown) => ({
        count: () => ({
          get: async () => ({
            data: () => ({
              count: [...daten.entries()].filter(([pfad, d]) => pfad.startsWith(`${name}/`) && d[feld] === wert).length,
            }),
          }),
        }),
      }),
      select: () => ({
        get: async () => ({
          docs: [...daten.entries()]
            .filter(([pfad]) => pfad.startsWith(`${name}/`))
            .map(([pfad, d]) => ({ id: pfad.split("/")[1], get: (feld: string) => d[feld] })),
        }),
      }),
    }),
    getAll: async (...args: unknown[]) => {
      zaehler.getAllAufrufe++;
      const refs = args.filter((a): a is ReturnType<typeof ref> => typeof a === "object" && a !== null && "__pfad" in a);
      zaehler.jobReads += refs.length;
      return refs.map((r) => {
        const d = daten.get(r.__pfad);
        return { id: r.id, exists: d !== undefined, get: (feld: string) => d?.[feld] };
      });
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      zaehler.transaktionen++;
      return fn({
        get: (r: ReturnType<typeof ref>) => r.get(),
        update: (r: ReturnType<typeof ref>, patch: Daten) => void r.update(patch),
      });
    },
  };
}

const eintrag = (pinstGuid: string, ausMail?: number) => ({
  pinstGuid,
  gemerktAm: Timestamp.fromMillis(1),
  ...(ausMail !== undefined ? { ausMail: Timestamp.fromMillis(ausMail) } : {}),
});

beforeEach(() => getFirestoreMock.mockReset());

/**
 * WOZU: geschlossene Stellen verlassen jede
 * Merkliste, selbst gemerkte wie aus der Mail. "Geschlossen" ist, was der Sync
 * daraus macht: `active: false` oder geloescht.
 */
describe("raeumeMerklistenAuf", () => {
  it("entfernt archivierte und geloeschte Stellen aus allen Merklisten, offene bleiben", async () => {
    const db = fakeDb(
      {
        u1: { merkliste: [eintrag("OFFEN"), eintrag("ARCHIV", 5), eintrag("WEG")] },
        u2: { merkliste: [eintrag("ARCHIV")] },
        u3: { merkliste: [eintrag("OFFEN", 5)] },
        u4: { merkliste: [] },
        u5: {},
      },
      { OFFEN: { active: true }, ARCHIV: { active: false } },
    );
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await raeumeMerklistenAuf({ jetzt: 1000, trockenlauf: false });

    expect(ergebnis).toEqual({
      kontenMitMerkliste: 3,
      stellenGeprueft: 3,
      geschlosseneStellen: 2,
      kontenBereinigt: 2,
      eintraegeEntfernt: 3,
      fehlgeschlagen: 0,
    });
    expect((db.daten.get("konten/u1") as { merkliste: unknown }).merkliste).toEqual([eintrag("OFFEN")]);
    expect((db.daten.get("konten/u2") as { merkliste: unknown }).merkliste).toEqual([]);
    expect((db.daten.get("konten/u3") as { merkliste: unknown }).merkliste).toEqual([eintrag("OFFEN", 5)]);
    // Nur die Konten, bei denen etwas wegfaellt, bekommen eine Transaktion.
    expect(db.zaehler.transaktionen).toBe(2);
  });

  it("laesst eine Stelle ohne active-Feld stehen - kein Beleg, kein Loeschen", async () => {
    const db = fakeDb({ u1: { merkliste: [eintrag("UNKLAR")] } }, { UNKLAR: { title: "x" } });
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await raeumeMerklistenAuf({ jetzt: 1000, trockenlauf: false });

    expect(ergebnis.eintraegeEntfernt).toBe(0);
    expect((db.daten.get("konten/u1") as { merkliste: unknown }).merkliste).toEqual([eintrag("UNKLAR")]);
  });

  it("zaehlt im Trockenlauf nur und schreibt nichts", async () => {
    const db = fakeDb({ u1: { merkliste: [eintrag("ARCHIV")] } }, { ARCHIV: { active: false } });
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await raeumeMerklistenAuf({ jetzt: 1000, trockenlauf: true });

    expect(ergebnis).toMatchObject({ kontenBereinigt: 1, eintraegeEntfernt: 1 });
    expect(db.zaehler.transaktionen).toBe(0);
    expect((db.daten.get("konten/u1") as { merkliste: unknown }).merkliste).toEqual([eintrag("ARCHIV")]);
  });

  it("liest jede Stelle nur einmal, in Bloecken - auch wenn viele Konten sie gemerkt haben", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `S${i}`);
    const konten = Object.fromEntries(
      Array.from({ length: 5 }, (_, k) => [`u${k}`, { merkliste: ids.map((id) => eintrag(id)) }]),
    );
    const jobs = Object.fromEntries(ids.map((id) => [id, { active: true }]));
    const db = fakeDb(konten, jobs);
    getFirestoreMock.mockReturnValue(db);

    await raeumeMerklistenAuf({ jetzt: 1000, trockenlauf: false });

    expect(db.zaehler.jobReads).toBe(250);
    expect(db.zaehler.getAllAufrufe).toBe(3);
    expect(db.zaehler.transaktionen).toBe(0);
  });

  it("bricht ohne zu loeschen ab, wenn das Nachschlagen der Stellen scheitert", async () => {
    const db = fakeDb({ u1: { merkliste: [eintrag("ARCHIV")] } }, { ARCHIV: { active: false } });
    db.getAll = async () => {
      throw new Error("unavailable");
    };
    getFirestoreMock.mockReturnValue(db);

    await expect(raeumeMerklistenAuf({ jetzt: 1000, trockenlauf: false })).rejects.toThrow("unavailable");
    expect((db.daten.get("konten/u1") as { merkliste: unknown }).merkliste).toEqual([eintrag("ARCHIV")]);
  });
});

// WOZU: ein abgebrochener Sync oder eine Migration, die `jobsV2` leert oder
// flaechig auf `active: false` setzt, wuerde sonst jede Merkliste
// unwiderruflich leeren.
describe("raeumeMerklistenAuf - Plausibilitaetsbremse", () => {
  it("bricht ohne zu loeschen ab, wenn jobsV2 unplausibel wenige aktive Stellen meldet", async () => {
    const db = fakeDb({ u1: { merkliste: [eintrag("WEG")] } }, {}, MIN_AKTIVE_STELLEN - 1);
    getFirestoreMock.mockReturnValue(db);

    await expect(raeumeMerklistenAuf({ jetzt: 1000, trockenlauf: false })).rejects.toThrow(/aktive Stellen/);
    expect((db.daten.get("konten/u1") as { merkliste: unknown }).merkliste).toEqual([eintrag("WEG")]);
    expect(db.zaehler.transaktionen).toBe(0);
  });

  it("fragt den Bestand gar nicht erst, wenn keine Merkliste etwas enthaelt", async () => {
    const db = fakeDb({ u1: { merkliste: [] } }, {}, 0);
    getFirestoreMock.mockReturnValue(db);

    expect(await raeumeMerklistenAuf({ jetzt: 1000, trockenlauf: false })).toMatchObject({ kontenMitMerkliste: 0 });
  });
});

describe("merklistenIds", () => {
  it("nimmt nur brauchbare Kennungen - nichts, was doc() zum Werfen braechte", () => {
    expect(merklistenIds([{ pinstGuid: "A" }, { pinstGuid: "" }, { pinstGuid: "a/b" }, { pinstGuid: 3 }, null, "x"])).toEqual(["A"]);
    expect(merklistenIds(undefined)).toEqual([]);
    expect(merklistenIds({})).toEqual([]);
  });
});
