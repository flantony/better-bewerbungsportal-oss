import { describe, expect, it } from "vitest";
import { MAX_OPS_JE_COMMIT, MAX_SCHWERE_OPS_JE_COMMIT, erzeugeSchreibpuffer, type Schreibart } from "./schreibPuffer";

interface FakeBatch {
  ops: { id: number; art: Schreibart }[];
  commit(): Promise<void>;
}

/** Zeichnet je Commit auf, welche Schreibvorgaenge darin lagen. */
function fakeFirestore() {
  const commits: { id: number; art: Schreibart }[][] = [];
  const neuerBatch = (): FakeBatch => {
    const batch: FakeBatch = {
      ops: [],
      commit: async () => {
        commits.push(batch.ops);
      },
    };
    return batch;
  };
  return { commits, neuerBatch };
}

async function schreibeFolge(arten: Schreibart[]) {
  const fake = fakeFirestore();
  const puffer = erzeugeSchreibpuffer(fake.neuerBatch);
  for (const [id, art] of arten.entries()) {
    await puffer.schreibe((batch) => batch.ops.push({ id, art }), art);
  }
  await puffer.abschliessen();
  return fake.commits;
}

const schwere = (commit: { art: Schreibart }[]) => commit.filter((op) => op.art === "schwer").length;

describe("erzeugeSchreibpuffer", () => {
  /**
   * WOZU: Nimmt die Bundeswehr viele Stellen auf einmal heraus, setzt der
   * Sync sie auf `active: false` - im selben 500er-Batch bricht das mit
   * "Transaction too big" ab. Ein solcher Wechsel schreibt jeden Composite-Index
   * der Stelle neu (alle beginnen mit `active`, die Haelfte faechert ueber
   * suchTokens/ortTokens auf) - 250 davon sprengen die 10-MiB-Grenze eines
   * Commits, obwohl es weit unter 500 Schreibvorgaenge sind.
   */
  it("verteilt eine Massenarchivierung auf mehrere Commits", async () => {
    const folge: Schreibart[] = [
      ...Array<Schreibart>(900).fill("leicht"), // bekannte Stellen: nur lastSeenAt
      ...Array<Schreibart>(2 * 300).fill("schwer"), // 300 Archivierungen, je jobs + jobsV2
    ];
    const commits = await schreibeFolge(folge);

    for (const commit of commits) {
      expect(schwere(commit)).toBeLessThanOrEqual(MAX_SCHWERE_OPS_JE_COMMIT);
      expect(commit.length).toBeLessThanOrEqual(MAX_OPS_JE_COMMIT);
    }
  });

  it("haelt die 500er-Grenze fuer leichte Schreibvorgaenge", async () => {
    const commits = await schreibeFolge(Array<Schreibart>(1200).fill("leicht"));
    expect(commits.map((c) => c.length)).toEqual([500, 500, 200]);
  });

  it("schreibt jeden Vorgang genau einmal und in der Reihenfolge des Aufrufs", async () => {
    const folge: Schreibart[] = Array.from({ length: 777 }, (_, i) => (i % 3 === 0 ? "schwer" : "leicht"));
    const commits = await schreibeFolge(folge);
    expect(commits.flat().map((op) => op.id)).toEqual(folge.map((_, i) => i));
  });

  /**
   * WOZU: Eine Stelle wird in jobs UND jobsV2 geschrieben bzw. geloescht. Faellt
   * die Commit-Grenze zwischen beide und scheitert der Folgecommit, bleibt in
   * jobsV2 eine Waise, die Stufe 2 nie wieder findet (sie iteriert nur ueber
   * `jobs`). Zusammengehoerige Vorgaenge duerfen deshalb nicht geteilt werden.
   */
  it("teilt eine Gruppe nie auf zwei Commits auf", async () => {
    const fake = fakeFirestore();
    const puffer = erzeugeSchreibpuffer(fake.neuerBatch);
    let id = 0;
    for (let stelle = 0; stelle < 40; stelle++) {
      const gruppe = (["schwer", "leicht", "schwer"] as Schreibart[]).map((art) => {
        const op = { id: id++, art };
        return { vorgang: (b: FakeBatch) => void b.ops.push(op), art };
      });
      await puffer.schreibeGruppe(gruppe);
    }
    await puffer.abschliessen();
    for (const commit of fake.commits) {
      expect(commit.length % 3).toBe(0);
      expect(schwere(commit)).toBeLessThanOrEqual(MAX_SCHWERE_OPS_JE_COMMIT);
    }
    expect(fake.commits.flat().map((op) => op.id)).toEqual(Array.from({ length: id }, (_, i) => i));
  });

  it("reicht einen gescheiterten Commit an den Aufrufer weiter", async () => {
    const puffer = erzeugeSchreibpuffer(() => ({
      commit: async () => {
        throw new Error("3 INVALID_ARGUMENT: Transaction too big.");
      },
    }));
    await expect(
      (async () => {
        for (let i = 0; i < MAX_SCHWERE_OPS_JE_COMMIT; i++) await puffer.schreibe(() => undefined, "schwer");
      })(),
    ).rejects.toThrow("Transaction too big");
  });

  it("committet am Ende nichts Leeres", async () => {
    const commits = await schreibeFolge(Array<Schreibart>(MAX_SCHWERE_OPS_JE_COMMIT).fill("schwer"));
    expect(commits).toHaveLength(1);
    expect(await schreibeFolge([])).toEqual([]);
  });
});
