/**
 * Sammelt die Schreibvorgaenge des Syncs und committet sie in Teilstuecken.
 *
 * ZWEI GRENZEN, NICHT EINE: Ein Firestore-Commit darf hoechstens 500
 * Schreibvorgaenge enthalten UND hoechstens 10 MiB gross sein - und in diese
 * Groesse zaehlen die Indexeintraege mit, die der Commit aendert. Ein Update,
 * das nur `lastSeenAt` setzt, aendert kaum Eintraege. Ein Wechsel von `active`
 * dagegen schreibt jeden Composite-Index der Stelle neu: alle beginnen mit
 * `active`, und rund die Haelfte faechert ueber `suchTokens`/`ortTokens` in
 * einen Eintrag je Token auf. Dasselbe gilt fuer das Anlegen und das Loeschen
 * einer Stelle.
 *
 * Rund 60 archivierte STELLEN (~120 schwere Vorgaenge, jobs + jobsV2) passen
 * in einen Commit, rund 125 Stellen (~250 Vorgaenge) nicht ("Transaction too
 * big"). So viele Archivierungen kommen zusammen, wenn die Bundeswehr viele
 * Stellen auf einmal herausnimmt - nur nach Anzahl gezaehlt, landeten sie alle
 * im selben Commit. `MAX_SCHWERE_OPS_JE_COMMIT` = 50 Vorgaenge sind 25
 * Stellen, gut ein Drittel dessen, was sicher passt.
 *
 * GRENZE NUR ZWISCHEN STELLEN: `schreibeGruppe` haelt die Vorgaenge einer
 * Stelle (jobs, jobsV2, Volltexte) im selben Commit. Sonst bleibt bei einem
 * gescheiterten Folgecommit z.B. jobsV2 als Waise stehen, die die Loeschstufe
 * nie wieder findet, weil sie nur ueber `jobs` iteriert.
 */
export const MAX_OPS_JE_COMMIT = 500;
export const MAX_SCHWERE_OPS_JE_COMMIT = 50;

/**
 * `schwer`: aendert viele Indexeintraege - Anlegen, Loeschen oder `active`
 * umschalten. `leicht`: alles andere.
 */
export type Schreibart = "leicht" | "schwer";

export interface CommitFaehig {
  commit(): Promise<unknown>;
}

export interface Vorgang<B> {
  vorgang: (batch: B) => void;
  art?: Schreibart;
}

export interface Schreibpuffer<B extends CommitFaehig> {
  /** Legt einen Vorgang in den laufenden Batch und committet, sobald eine Grenze erreicht ist. */
  schreibe(vorgang: (batch: B) => void, art?: Schreibart): Promise<void>;
  /**
   * Wie `schreibe`, aber fuer zusammengehoerige Vorgaenge: Passt die Gruppe
   * nicht mehr in den laufenden Batch, wird VORHER committet - die Gruppe
   * landet immer ganz in einem Commit.
   */
  schreibeGruppe(vorgaenge: Vorgang<B>[]): Promise<void>;
  /** Committet den Rest. Wirft, wenn der Commit scheitert. */
  abschliessen(): Promise<void>;
}

export function erzeugeSchreibpuffer<B extends CommitFaehig>(neuerBatch: () => B): Schreibpuffer<B> {
  let batch = neuerBatch();
  let ops = 0;
  let schwere = 0;

  const leeren = async () => {
    await batch.commit();
    batch = neuerBatch();
    ops = 0;
    schwere = 0;
  };

  const schreibeGruppe = async (vorgaenge: Vorgang<B>[]) => {
    const schwerInGruppe = vorgaenge.filter((v) => v.art === "schwer").length;
    const passtNicht = ops + vorgaenge.length > MAX_OPS_JE_COMMIT || schwere + schwerInGruppe > MAX_SCHWERE_OPS_JE_COMMIT;
    if (ops > 0 && passtNicht) await leeren();
    for (const v of vorgaenge) v.vorgang(batch);
    ops += vorgaenge.length;
    schwere += schwerInGruppe;
    if (ops >= MAX_OPS_JE_COMMIT || schwere >= MAX_SCHWERE_OPS_JE_COMMIT) await leeren();
  };

  return {
    schreibe: (vorgang, art = "leicht") => schreibeGruppe([{ vorgang, art }]),
    schreibeGruppe,
    async abschliessen() {
      if (ops > 0) await leeren();
    },
  };
}
