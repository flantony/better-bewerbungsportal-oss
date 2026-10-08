import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Ein Firestore-Doppel, das die `where`-Klauseln WIRKLICH auswertet.
 *
 * Die anderen Tests dieses Ordners zeichnen die Klauseln nur auf. Hier geht es
 * aber um Differenzen zweier Zaehlungen - ein Doppel, das fuer jede Query
 * dieselbe Zahl liefert, wuerde jeden Fehler in der Rechnung verbergen und
 * ausgerechnet 0 ausgeschlossene Stellen melden.
 *
 * ZWEI FIRESTORE-EIGENHEITEN, die hier absichtlich nachgebildet sind:
 *  - `in` ignoriert `null`: `contractTypeLabel in [null, ""]` trifft kein
 *    Dokument mit `null`, `contractTypeLabel == null` schon. Deshalb zaehlt der Code die
 *    Leerwerte EINZELN mit `==` und nicht in einer `in`-Klausel.
 *  - `== null` trifft nur ausdrueckliche Nullwerte, kein fehlendes Feld.
 */
interface Klausel {
  feld: string;
  op: string;
  wert: unknown;
}

type Dokument = Record<string, unknown>;

let bestand: Dokument[] = [];
/** Jede gestellte Zaehlung - Beleg dafuer, wie viele Abfragen wirklich laufen. */
let zaehlungen: Klausel[][] = [];
/** Laesst `count()` scheitern, wie ein fehlender Index es tut. */
let zaehlungSchlaegtFehl = false;

function feldwert(doc: Dokument, feld: string): unknown {
  return feld
    .split(".")
    .reduce<unknown>((wert, teil) => (wert as Dokument | undefined)?.[teil], doc);
}

function trifft(doc: Dokument, klausel: Klausel): boolean {
  const wert = feldwert(doc, klausel.feld);
  switch (klausel.op) {
    case "==":
      return klausel.wert === null ? wert === null : wert === klausel.wert;
    case ">=":
      return typeof wert === "number" && wert >= (klausel.wert as number);
    // Firestore laesst `null` in einer `in`-Liste nicht mitzaehlen.
    case "in":
      return (klausel.wert as unknown[]).some((kandidat) => kandidat !== null && kandidat === wert);
    case "array-contains":
      return Array.isArray(wert) && wert.includes(klausel.wert);
    default:
      throw new Error(`Doppel kennt Operator "${klausel.op}" nicht`);
  }
}

function makeQuery(klauseln: Klausel[]): unknown {
  return {
    where: (feld: string, op: string, wert: unknown) => makeQuery([...klauseln, { feld, op, wert }]),
    orderBy: () => makeQuery(klauseln),
    limit: () => makeQuery(klauseln),
    count: () => ({
      async get() {
        if (zaehlungSchlaegtFehl) throw Object.assign(new Error("kein Index"), { code: 9 });
        zaehlungen.push(klauseln);
        const anzahl = bestand.filter((doc) => klauseln.every((k) => trifft(doc, k))).length;
        return { data: () => ({ count: anzahl }) };
      },
    }),
    async get() {
      const passend = bestand.filter((doc) => klauseln.every((k) => trifft(doc, k)));
      return { docs: passend.map((doc) => ({ id: "x", data: () => doc })), size: passend.length };
    },
  };
}

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({ collection: () => makeQuery([]) }),
  Timestamp: { fromMillis: (millis: number) => ({ toMillis: () => millis }) },
}));

const { zaehleAusschluesse } = await import("./ausschluesse");

/** Eine Stelle. Leere Werte stehen ausdruecklich drin, nicht als fehlendes Feld. */
function stelle(over: Dokument = {}): Dokument {
  return {
    active: true,
    api: { ReqIndustry: 1, Region: "02" },
    organisationsbereich: "0004",
    laufbahngruppe: "0009",
    contractTypeLabel: "Soldatin / Soldat auf Zeit",
    vollzeit: true,
    einstiegsweg: "",
    besoldung: null,
    suchTokens: ["offizier"],
    ortTokens: ["hamburg"],
    ...over,
  };
}

beforeEach(() => {
  bestand = [];
  zaehlungen = [];
  zaehlungSchlaegtFehl = false;
});

/**
 * Militaerisch + Vertragsart "Soldatin / Soldat auf Zeit". Die drei
 * Reserveoffizier-Stellen tragen "", "unbefristet", "unbefristet" - der Filter
 * schliesst zu 100 Prozent genau die Kategorie aus, nach der gefragt wird.
 */
describe("zaehleAusschluesse - der Vertragsart-Fall", () => {
  beforeEach(() => {
    bestand = [
      stelle(),
      stelle(),
      // Drei Reserveoffizier-Stellen.
      stelle({ einstiegsweg: "reserveoffizier", contractTypeLabel: "" }),
      stelle({ einstiegsweg: "reserveoffizier", contractTypeLabel: "unbefristet" }),
      stelle({ einstiegsweg: "reserveoffizier", contractTypeLabel: "unbefristet" }),
      // Eine ohne jede Vertragsart.
      stelle({ contractTypeLabel: null }),
      // Eine zivile - die scheitert an taetigkeitsbereich, nicht an der Vertragsart.
      stelle({ api: { ReqIndustry: 2, Region: "02" } }),
    ];
  });

  it("nennt den Filter und die Zahl der allein an ihm gescheiterten Stellen", async () => {
    const messung = await zaehleAusschluesse(
      { taetigkeitsbereich: "militaerisch", vertragsarten: ["Soldatin / Soldat auf Zeit"] },
      Promise.resolve({ totalCount: 2, abgeschnitten: false }),
    );
    const vertrag = messung?.je.find((eintrag) => eintrag.filter === "vertragsarten");
    expect(vertrag?.anzahl).toBe(4);
  });

  it("zaehlt darunter die Stellen, die zum Merkmal gar keinen Wert tragen", async () => {
    const messung = await zaehleAusschluesse(
      { taetigkeitsbereich: "militaerisch", vertragsarten: ["Soldatin / Soldat auf Zeit"] },
      Promise.resolve({ totalCount: 2, abgeschnitten: false }),
    );
    // Die eine mit `null` und die eine mit "" - beide sind nicht inhaltlich
    // ausgeschlossen, sondern unbeschrieben.
    expect(messung?.je.find((e) => e.filter === "vertragsarten")?.ohneAngabe).toBe(2);
  });

  it("meldet auch den zweiten gesetzten Filter", async () => {
    const messung = await zaehleAusschluesse(
      { taetigkeitsbereich: "militaerisch", vertragsarten: ["Soldatin / Soldat auf Zeit"] },
      Promise.resolve({ totalCount: 2, abgeschnitten: false }),
    );
    expect(messung?.je.find((e) => e.filter === "taetigkeitsbereich")?.anzahl).toBe(1);
  });

  it("stellt den Filter mit der Datenluecke nach vorn", async () => {
    const messung = await zaehleAusschluesse(
      { taetigkeitsbereich: "militaerisch", vertragsarten: ["Soldatin / Soldat auf Zeit"] },
      Promise.resolve({ totalCount: 2, abgeschnitten: false }),
    );
    expect(messung?.je[0].filter).toBe("vertragsarten");
  });
});

describe("zaehleAusschluesse - kein Alarm ohne Anlass", () => {
  it("schweigt, wenn kein gedeckter Filter gesetzt ist", async () => {
    bestand = [stelle(), stelle()];
    const messung = await zaehleAusschluesse(
      { wunschort: "Hamburg" },
      Promise.resolve({ totalCount: 2, abgeschnitten: false }),
    );
    expect(messung).toBeNull();
    // Und kostet dann auch keine einzige Abfrage.
    expect(zaehlungen).toHaveLength(0);
  });

  it("schweigt, wenn der Filter nichts ausgeschlossen hat", async () => {
    bestand = [stelle(), stelle()];
    const messung = await zaehleAusschluesse(
      { taetigkeitsbereich: "militaerisch" },
      Promise.resolve({ totalCount: 2, abgeschnitten: false }),
    );
    expect(messung).toBeNull();
  });

  it("schweigt, wenn der Lesedeckel die Trefferzahl schon verfaelscht hat", async () => {
    bestand = [stelle(), stelle({ contractTypeLabel: null })];
    const messung = await zaehleAusschluesse(
      { vertragsarten: ["Soldatin / Soldat auf Zeit"] },
      Promise.resolve({ totalCount: 3000, abgeschnitten: true }),
    );
    expect(messung).toBeNull();
  });
});

/**
 * Ein leerer `einstiegsweg` heisst "kein besonderer Einstiegsweg" und nicht "wir
 * wissen es nicht" - die allermeisten Stellen tragen ihn leer. Ein `ohneAngabe`
 * darauf waere formal richtig und inhaltlich eine Falschmeldung.
 */
describe("zaehleAusschluesse - welche Filter eine Datenluecke haben koennen", () => {
  it("meldet fuer einstiegswege keine Datenluecke", async () => {
    bestand = [stelle({ einstiegsweg: "reserveoffizier" }), stelle(), stelle()];
    const messung = await zaehleAusschluesse(
      { einstiegswege: ["reserveoffizier"] },
      Promise.resolve({ totalCount: 1, abgeschnitten: false }),
    );
    const eintrag = messung?.je.find((e) => e.filter === "einstiegswege");
    expect(eintrag?.anzahl).toBe(2);
    expect(eintrag?.ohneAngabe).toBeUndefined();
  });

  it("zaehlt bei mindestbesoldung die Stellen ohne hinterlegte Besoldung", async () => {
    bestand = [
      stelle({ besoldung: { tabelle: "A", bisStufe: 13 } }),
      stelle({ besoldung: { tabelle: "A", bisStufe: 9 } }),
      stelle({ besoldung: null }),
      stelle({ besoldung: null }),
    ];
    const messung = await zaehleAusschluesse(
      { mindestbesoldung: 11, besoldungstabelle: "A" },
      Promise.resolve({ totalCount: 1, abgeschnitten: false }),
    );
    const eintrag = messung?.je.find((e) => e.filter === "mindestbesoldung");
    expect(eintrag?.anzahl).toBe(3);
    expect(eintrag?.ohneAngabe).toBe(2);
  });
});

/**
 * `alter` wirkt erst im Speicher (Stellen ohne Altersangabe bleiben absichtlich
 * drin, s. queryJobs.passtZumAlter). Die Zaehlung kann ihn deshalb nicht
 * mitrechnen - und muss das sagen, statt eine zu hohe Zahl als genau auszugeben.
 */
describe("zaehleAusschluesse - Filter, die erst nach der Abfrage wirken", () => {
  it("benennt alter als nicht eingerechnet und zaehlt die Basis selbst", async () => {
    bestand = [stelle(), stelle({ contractTypeLabel: null }), stelle({ contractTypeLabel: null })];
    const messung = await zaehleAusschluesse(
      { vertragsarten: ["Soldatin / Soldat auf Zeit"], alter: 45 },
      // Der Alters-Nachfilter hat einen Treffer verworfen: totalCount 0, obwohl
      // die Query eine Stelle liefert. Wer damit rechnet, meldet 3 statt 2.
      Promise.resolve({ totalCount: 0, abgeschnitten: false }),
    );
    expect(messung?.nichtEingerechnet).toContain("alter");
    expect(messung?.je.find((e) => e.filter === "vertragsarten")?.anzahl).toBe(2);
  });

  it("gibt keine Zahl aus, wenn eine Facette in den Nachfilter gerutscht ist", async () => {
    bestand = [stelle(), stelle({ contractTypeLabel: null })];
    const messung = await zaehleAusschluesse(
      {
        organisationsbereich: ["0004", "0012"],
        laufbahngruppe: ["0009", "0008"],
        vertragsarten: ["Soldatin / Soldat auf Zeit"],
      },
      Promise.resolve({ totalCount: 1, abgeschnitten: false }),
    );
    expect(messung).toBeNull();
  });
});

describe("zaehleAusschluesse - Robustheit", () => {
  // Ein Zusatz darf die Antwort nie kosten: faellt die Zaehlung aus (fehlender
  // zusammengesetzter Index), bleibt die Trefferliste, wie sie ist.
  it("liefert null statt eines Fehlers, wenn eine Zaehlung scheitert", async () => {
    bestand = [stelle(), stelle({ contractTypeLabel: null })];
    zaehlungSchlaegtFehl = true;
    const messung = await zaehleAusschluesse(
      { vertragsarten: ["Soldatin / Soldat auf Zeit"] },
      Promise.resolve({ totalCount: 1, abgeschnitten: false }),
    );
    expect(messung).toBeNull();
  });
});
