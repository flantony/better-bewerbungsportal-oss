import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Zeichnet die `.where()`-Aufrufe auf, damit wir pruefen koennen, dass die Filter
 * TATSAECHLICH in die Firestore-Query wandern - und nicht in JavaScript laufen,
 * waehrend Firestore alle Dokumente liefert.
 */
interface WhereCall {
  field: string;
  op: string;
  value: unknown;
}

const whereCalls: WhereCall[] = [];
const orderByCalls: { field: string; direction: string }[] = [];
let startAfterArgs: unknown[] | null = null;
let docs: { id: string; data: () => unknown }[] = [];
let limitArg = 0;
/** Fehler, den `get()` beim naechsten Aufruf werfen soll (Index-Rueckfall-Test). */
let getFehler: { code: number } | null = null;
/** Wie oft Dokumente gelesen wurden (nicht gezaehlt: `count()`). */
let getAufrufe = 0;

/** Nachbildung eines Firestore-Timestamps - nur `toMillis` wird gebraucht. */
function ts(millis: number) {
  return { toMillis: () => millis };
}

function makeQuery(): unknown {
  const query = {
    where(field: string, op: string, value: unknown) {
      whereCalls.push({ field, op, value });
      return query;
    },
    orderBy(field: string, direction: string) {
      orderByCalls.push({ field, direction });
      return query;
    },
    startAfter(...args: unknown[]) {
      startAfterArgs = args;
      return query;
    },
    limit(n: number) {
      limitArg = n;
      return query;
    },
    count() {
      return { async get() { return { data: () => ({ count: docs.length }) } } };
    },
    async get() {
      getAufrufe++;
      if (getFehler) {
        const fehler = getFehler;
        getFehler = null;
        throw fehler;
      }
      // Der Deckel muss wirken, sonst laesst sich `abgeschnitten` nicht pruefen.
      const sichtbar = limitArg > 0 ? docs.slice(0, limitArg) : docs;
      return { docs: sichtbar, size: sichtbar.length };
    },
  };
  return query;
}

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({ collection: () => makeQuery() }),
  Timestamp: { fromMillis: (millis: number) => ts(millis) },
}));

const { queryJobs, CursorUngueltigError, vergissSchnappschuss, erfuellt, SCHNAPPSCHUSS_MS } = await import(
  "./queryJobs"
);

function job(over: Record<string, unknown> = {}) {
  return {
    id: (over.pinstGuid as string) ?? "id1",
    data: () => ({
      title: "Offizier Schiffstechnik",
      besOrt: "Wilhelmshaven",
      contractTypeLabel: "Soldatin / Soldat auf Zeit",
      refCode: "REF-4711",
      applicationEnd: "01.06.2027",
      applicationEndSortKey: ts(1_800_000_000_000),
      firstSeenAt: ts(1_700_000_000_000),
      vollzeit: true,
      suchTokens: ["offizier", "schiffstechnik", "schif", "schiff"],
      dokumente: [],
      ...over,
    }),
  };
}

beforeEach(() => {
  whereCalls.length = 0;
  orderByCalls.length = 0;
  startAfterArgs = null;
  docs = [job()];
  limitArg = 0;
  getFehler = null;
  getAufrufe = 0;
  // Der Speicherweg haelt ein Abbild je Instanz (s. aktiveStellen) - jeder
  // Test beginnt mit einem frischen.
  vergissSchnappschuss();
});

describe("queryJobs — Filter landen in der Query", () => {
  it("filtert immer auf aktive Stellen", async () => {
    await queryJobs({});
    expect(whereCalls).toContainEqual({ field: "active", op: "==", value: true });
  });

  // Rohwert der API, im Schema jobsV2 unter `api.*`.
  it("uebersetzt taetigkeitsbereich in api.ReqIndustry", async () => {
    await queryJobs({ taetigkeitsbereich: "militaerisch" });
    expect(whereCalls).toContainEqual({ field: "api.ReqIndustry", op: "==", value: 1 });

    whereCalls.length = 0;
    await queryJobs({ taetigkeitsbereich: "zivil" });
    expect(whereCalls).toContainEqual({ field: "api.ReqIndustry", op: "==", value: 2 });

    // "beide" darf gar nicht filtern.
    whereCalls.length = 0;
    await queryJobs({ taetigkeitsbereich: "beide" });
    expect(whereCalls.some((c) => c.field === "api.ReqIndustry")).toBe(false);
  });

  // Einwertige Facetten muessen als Gleichheit gestellt werden: mehrere
  // in-Klauseln multiplizieren sich in Firestore zu Disjunktionen und laufen
  // sonst ins Limit (17 Bereiche x 9 Laufbahngruppen = 153 > 30).
  it("stellt einwertige Facetten als Gleichheitsfilter", async () => {
    await queryJobs({ organisationsbereich: ["0004"], laufbahngruppe: ["0009"] });
    expect(whereCalls).toContainEqual({ field: "organisationsbereich", op: "==", value: "0004" });
    expect(whereCalls).toContainEqual({ field: "laufbahngruppe", op: "==", value: "0009" });
    expect(whereCalls.some((c) => c.op === "in")).toBe(false);
  });

  it("nutzt in nur fuer eine einzige mehrwertige Facette", async () => {
    await queryJobs({
      organisationsbereich: ["0004", "0002"],
      laufbahngruppe: ["0009", "0008"],
    });
    const inKlauseln = whereCalls.filter((c) => c.op === "in");
    expect(inKlauseln).toHaveLength(1);
    expect(inKlauseln[0].field).toBe("organisationsbereich");
  });

  it("filtert die zweite mehrwertige Facette nach, statt die Query zu sprengen", async () => {
    // Beide erfuellen die erste Facette (die in der Query) - die Attrappe
    // filtert nicht, das Abbild des Speicherwegs schon.
    docs = [
      job({ pinstGuid: "passt", organisationsbereich: "0004", laufbahngruppe: "0009" }),
      job({ pinstGuid: "passtNicht", organisationsbereich: "0004", laufbahngruppe: "0005" }),
    ];
    const result = await queryJobs({
      organisationsbereich: ["0004", "0002"],
      laufbahngruppe: ["0009", "0008"],
    });
    expect(result.results.map((r) => r.pinstGuid)).toEqual(["passt"]);
  });

  it("uebersetzt beschaeftigungsumfang in das vorberechnete vollzeit-Flag", async () => {
    await queryJobs({ beschaeftigungsumfang: "teilzeit" });
    expect(whereCalls).toContainEqual({ field: "vollzeit", op: "==", value: false });
  });

  // Kern der Besoldungslogik: "mindestens A11" muss A10-A11 einschliessen.
  it("filtert Mindestbesoldung gegen die OBERE Grenze der Spanne", async () => {
    await queryJobs({ mindestbesoldung: 11 });
    expect(whereCalls).toContainEqual({ field: "besoldung.bisStufe", op: ">=", value: 11 });
    expect(whereCalls).toContainEqual({ field: "besoldung.tabelle", op: "==", value: "A" });
  });

  it("erlaubt die Tarif-Tabelle explizit", async () => {
    await queryJobs({ mindestbesoldung: 9, besoldungstabelle: "E" });
    expect(whereCalls).toContainEqual({ field: "besoldung.tabelle", op: "==", value: "E" });
  });

  it("nutzt array-contains fuer den trennschaerfsten Suchbegriff", async () => {
    await queryJobs({ suchbegriff: "IT Offizier" });
    // "offizier" ist laenger als "it" und geht deshalb in die Query.
    expect(whereCalls).toContainEqual({ field: "suchTokens", op: "array-contains", value: "offizier" });
    expect(whereCalls.filter((c) => c.op === "array-contains")).toHaveLength(1);
  });

  // "unklar" MUSS drin bleiben: fast alle Seiteneinstiegs-Ausschreibungen sagen
  // das Wort nirgends im Text, die Extraktion liefert dort korrekt "unklar".
  // Ein Ausschluss verbaerge also genau die gesuchten Stellen - dieselbe
  // Regel wie beim Alter.
  it("filtert Seiteneinstieg, ohne 'unklar' auszuschliessen", async () => {
    await queryJobs({ seiteneinstieg: true });
    expect(whereCalls).toContainEqual({
      field: "jobAttributes.seiteneinstieg",
      op: "in",
      value: ["ja", "unklar"],
    });
  });

  it("stellt den Einstiegsweg als Gleichheitsfilter", async () => {
    await queryJobs({ einstiegswege: ["reserveoffizier"] });
    expect(whereCalls).toContainEqual({ field: "einstiegsweg", op: "==", value: "reserveoffizier" });
  });

  it("nutzt in fuer mehrere Einstiegswege", async () => {
    await queryJobs({ einstiegswege: ["reserveoffizier", "seiteneinstieg"] });
    expect(whereCalls).toContainEqual({
      field: "einstiegsweg",
      op: "in",
      value: ["reserveoffizier", "seiteneinstieg"],
    });
  });

  it("begrenzt die Firestore-Abfrage immer", async () => {
    await queryJobs({});
    expect(limitArg).toBeGreaterThan(0);
  });
});

describe("queryJobs — Nachfilterung", () => {
  it("stellt den Ort ALS QUERY, nicht als Nachfilter", async () => {
    // Als Teilstring-Nachfilter in JavaScript griffe der Lese-Deckel VOR dem
    // Filter - die Ortssuche waere still unvollstaendig.
    await queryJobs({ wunschort: "köln" });
    expect(whereCalls).toContainEqual({ field: "ortTokens", op: "array-contains", value: "köln" });
  });

  it("laesst den Ort auch Bestandteile mehrteiliger Ortsnamen treffen", async () => {
    // "Köln-Wahn" wird beim Schreiben zu ["köln", "wahn", ...] zerlegt, beide
    // Eingaben treffen also - ohne Teilstring-Suche zur Lesezeit.
    await queryJobs({ wunschort: "wahn" });
    expect(whereCalls).toContainEqual({ field: "ortTokens", op: "array-contains", value: "wahn" });
  });

  it("gibt dem Ort den Vorzug vor dem Suchbegriff und filtert den Titel nach", async () => {
    // Nur EIN array-contains je Query. Der Ort ist trennschaerfer, der
    // Titel-Token wandert deshalb in die Nachfilterung.
    docs = [
      job({ besOrt: "Köln", ortTokens: ["köln"], suchTokens: ["offizier", "it"] }),
      job({ pinstGuid: "id2", besOrt: "Köln", ortTokens: ["köln"], suchTokens: ["koch"] }),
    ];
    const result = await queryJobs({ wunschort: "Köln", suchbegriff: "Offizier" });
    expect(whereCalls).toContainEqual({ field: "ortTokens", op: "array-contains", value: "köln" });
    expect(whereCalls.some((c) => c.field === "suchTokens")).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].pinstGuid).toBe("id1");
  });

  it("hebt den Fetch-Deckel an, sobald noch nachgefiltert wird", async () => {
    await queryJobs({ suchbegriff: "Offizier" });
    const ohneNachfilter = limitArg;
    await queryJobs({ suchbegriff: "Offizier Schiffstechnik" });
    expect(limitArg).toBeGreaterThan(ohneNachfilter);
  });

  it("filtert nach Alter, laesst Stellen OHNE Altersangabe aber immer drin", async () => {
    docs = [
      job({ pinstGuid: "zuJung", jobAttributes: { mindestalter: 40, hoechstalter: 0 } }),
      job({ pinstGuid: "zuAlt", jobAttributes: { mindestalter: 0, hoechstalter: 30 } }),
      job({ pinstGuid: "passt", jobAttributes: { mindestalter: 18, hoechstalter: 45 } }),
      // Ohne Angabe: dass wir keine Grenze kennen, ist kein Grund auszusortieren.
      job({ pinstGuid: "ohneAngabe" }),
    ];
    const result = await queryJobs({ alter: 34 });
    expect(result.results.map((j) => j.pinstGuid).toSorted()).toEqual(["ohneAngabe", "passt"]);
  });

  it("stellt das Alter NICHT als Query - eine Grenze von 0 waere sonst ein Ausschluss", async () => {
    await queryJobs({ alter: 34 });
    expect(whereCalls.some((c) => c.field.includes("alter"))).toBe(false);
  });

  // `abgeschnitten` gibt es nur auf dem Speicher-Weg: dort kann der
  // Lese-Deckel Treffer verschlucken, die auch Weiterblaettern nicht
  // erreicht. Der indizierte Weg kennt das Problem nicht, er blaettert sauber.
  it("meldet abgeschnitten, wenn der Deckel auf dem Speicher-Weg greift", async () => {
    await queryJobs({ alter: 30 });
    const deckel = limitArg;
    expect(deckel).toBeGreaterThan(0);
    docs = Array.from({ length: deckel }, (_, i) => job({ pinstGuid: `id${i}` }));
    vergissSchnappschuss();
    const result = await queryJobs({ alter: 30 });
    expect(result.abgeschnitten).toBe(true);
  });

  it("meldet auf dem indizierten Weg nie abgeschnitten - dort wird geblaettert", async () => {
    docs = Array.from({ length: 200 }, (_, i) => job({ pinstGuid: `id${i}` }));
    const result = await queryJobs({ limit: 10 });
    expect(result.abgeschnitten).toBe(false);
    expect(result.naechsterCursor).toBeTruthy();
  });

  it("filtert die restlichen Suchbegriffe nach", async () => {
    docs = [
      job({ suchTokens: ["offizier", "it"] }),
      job({ pinstGuid: "id2", suchTokens: ["offizier", "marine"] }),
    ];
    const result = await queryJobs({ suchbegriff: "Offizier IT" });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].pinstGuid).toBe("id1");
  });

  it("meldet totalCount nach Filterung und die Zahl gelesener Dokumente", async () => {
    docs = [job(), job({ pinstGuid: "id2" }), job({ pinstGuid: "id3" })];
    // Alter erzwingt den Speicher-Weg, auf dem totalCount aus der gefilterten
    // Menge stammt statt aus einer Aggregation.
    const result = await queryJobs({ limit: 2, alter: 30 });
    expect(result.results).toHaveLength(2);
    expect(result.totalCount).toBe(3);
    expect(result.gelesen).toBe(3);
  });
});

describe("queryJobs — Reihenfolge und Blaettern", () => {
  it("sortiert standardmaessig nach Bewerbungsschluss, frueheste zuerst", async () => {
    await queryJobs({});
    expect(orderByCalls).toEqual([{ field: "applicationEndSortKey", direction: "asc" }]);
  });

  // lastSeenAt setzt der Sync fuer ALLE aktiven Stellen auf denselben Wert -
  // eine Sortierung danach saehe sortiert aus, waere aber willkuerlich.
  it("nutzt fuer 'neueste' firstSeenAt, nicht lastSeenAt", async () => {
    await queryJobs({ sortierung: "neueste" });
    expect(orderByCalls).toEqual([{ field: "firstSeenAt", direction: "desc" }]);
  });

  it("liest auf dem indizierten Weg nur eine Seite statt eines vollen Deckels", async () => {
    docs = Array.from({ length: 500 }, (_, i) => job({ pinstGuid: `id${i}` }));
    const result = await queryJobs({ limit: 50 });
    // limit + 1: das eine Extra-Dokument beantwortet nur "gibt es noch mehr?".
    expect(limitArg).toBe(51);
    expect(result.gelesen).toBe(51);
    expect(result.results).toHaveLength(50);
  });

  it("holt totalCount per Aggregation statt aus der gelesenen Menge", async () => {
    docs = Array.from({ length: 120 }, (_, i) => job({ pinstGuid: `id${i}` }));
    const result = await queryJobs({ limit: 10 });
    expect(result.totalCount).toBe(120);
    expect(result.gelesen).toBe(11);
  });

  it("setzt den Cursor der Vorseite als startAfter mit ID als Tiebreaker", async () => {
    docs = Array.from({ length: 30 }, (_, i) => job({ pinstGuid: `id${i}` }));
    const erste = await queryJobs({ limit: 10 });
    expect(erste.naechsterCursor).toBeTruthy();

    await queryJobs({ limit: 10, cursor: erste.naechsterCursor });
    expect(startAfterArgs).toHaveLength(2);
    expect(startAfterArgs?.[1]).toBe("id9");
  });

  it("blaettert auf dem Speicher-Weg ohne Stellen zu verlieren oder zu wiederholen", async () => {
    docs = Array.from({ length: 5 }, (_, i) =>
      job({ pinstGuid: `id${i}`, applicationEndSortKey: ts(1_000 + i) }),
    );
    const seite1 = await queryJobs({ limit: 2, alter: 30 });
    const seite2 = await queryJobs({ limit: 2, alter: 30, cursor: seite1.naechsterCursor });
    const seite3 = await queryJobs({ limit: 2, alter: 30, cursor: seite2.naechsterCursor });

    const gesehen = [...seite1.results, ...seite2.results, ...seite3.results].map((j) => j.pinstGuid);
    expect(gesehen).toEqual(["id0", "id1", "id2", "id3", "id4"]);
    expect(seite3.naechsterCursor).toBeUndefined();
  });

  it("sortiert auf dem Speicher-Weg selbst, statt die Firestore-Reihenfolge zu uebernehmen", async () => {
    docs = [
      job({ pinstGuid: "spaet", applicationEndSortKey: ts(3_000) }),
      job({ pinstGuid: "frueh", applicationEndSortKey: ts(1_000) }),
      job({ pinstGuid: "mitte", applicationEndSortKey: ts(2_000) }),
    ];
    const result = await queryJobs({ alter: 30 });
    expect(result.results.map((j) => j.pinstGuid)).toEqual(["frueh", "mitte", "spaet"]);
  });

  it("sortiert Stellen ohne Bewerbungsschluss ans Ende, nicht nach vorn", async () => {
    docs = [
      job({ pinstGuid: "ohne", applicationEndSortKey: undefined }),
      job({ pinstGuid: "mit", applicationEndSortKey: ts(2_000) }),
    ];
    const result = await queryJobs({ alter: 30 });
    expect(result.results.map((j) => j.pinstGuid)).toEqual(["mit", "ohne"]);
  });

  it("weist einen unbrauchbaren Cursor zurueck, statt still von vorn anzufangen", async () => {
    await expect(queryJobs({ cursor: "kein-echter-cursor" })).rejects.toBeInstanceOf(CursorUngueltigError);
  });

  // Ein fehlender zusammengesetzter Index darf dem Nutzer keinen Fehler zeigen.
  it("faellt bei fehlendem Index auf die Speicher-Sortierung zurueck", async () => {
    docs = [
      job({ pinstGuid: "spaet", applicationEndSortKey: ts(3_000) }),
      job({ pinstGuid: "frueh", applicationEndSortKey: ts(1_000) }),
    ];
    getFehler = { code: 9 };
    const result = await queryJobs({});
    expect(result.results.map((j) => j.pinstGuid)).toEqual(["frueh", "spaet"]);
  });

  it("reicht andere Firestore-Fehler durch, statt sie zu verschlucken", async () => {
    getFehler = { code: 7 };
    await expect(queryJobs({})).rejects.toMatchObject({ code: 7 });
  });
});

// `region` ist ein Rohwert der API und liegt im Schema jobsV2 unter `api.*`.
// Der Nachfilter arbeitet dagegen auf dem zurueckuebersetzten Datensatz und
// braucht den Domaenennamen - die beiden duerfen nicht verwechselt werden.
describe("queryJobs — Bundesland", () => {
  it("filtert auf api.Region, nicht auf region", async () => {
    await queryJobs({ bundesland: ["12"] });
    expect(whereCalls).toContainEqual({ field: "api.Region", op: "==", value: "12" });
  });

  it("wertet api.Region auch auf dem Speicherweg auf dem Rohfeld aus", async () => {
    docs = [
      job({ pinstGuid: "berlin", api: { Region: "11" } }),
      job({ pinstGuid: "hamburg", api: { Region: "02" } }),
    ];
    const result = await queryJobs({ bundesland: ["11"], alter: 30 });
    expect(result.results.map((j) => j.pinstGuid)).toEqual(["berlin"]);
  });
});

/**
 * WOZU: ohne Abbild laese der Speicherweg bei jedem Aufruf die ganze gefilterte
 * Menge, und jedes Weiterblaettern noch einmal. Mit Abbild liest eine Instanz
 * den Bestand hoechstens alle fuenf Minuten.
 */
describe("queryJobs — Abbild der aktiven Stellen", () => {
  it("liest den Bestand fuer mehrere Speicher-Abfragen nur einmal", async () => {
    docs = Array.from({ length: 5 }, (_, i) => job({ pinstGuid: `id${i}`, applicationEndSortKey: ts(1_000 + i) }));
    const erste = await queryJobs({ alter: 30, limit: 2 });
    const zweite = await queryJobs({ alter: 30, limit: 2, cursor: erste.naechsterCursor });
    const andere = await queryJobs({ suchbegriff: "Offizier Schiffstechnik" });

    expect(getAufrufe).toBe(1);
    expect(erste.gelesen).toBe(5);
    expect(zweite.gelesen).toBe(0);
    expect(andere.gelesen).toBe(0);
    expect(zweite.results.map((j) => j.pinstGuid)).toEqual(["id2", "id3"]);
  });

  it("teilt sich eine laufende Ladung zwischen gleichzeitigen Abfragen", async () => {
    await Promise.all([queryJobs({ alter: 30 }), queryJobs({ alter: 40 }), queryJobs({ alter: 50 })]);
    expect(getAufrufe).toBe(1);
  });

  it("liest nach Ablauf der Frist neu", async () => {
    const jetzt = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    await queryJobs({ alter: 30 });
    jetzt.mockReturnValue(1_000_000 + SCHNAPPSCHUSS_MS - 1);
    await queryJobs({ alter: 30 });
    expect(getAufrufe).toBe(1);
    jetzt.mockReturnValue(1_000_000 + SCHNAPPSCHUSS_MS);
    await queryJobs({ alter: 30 });
    expect(getAufrufe).toBe(2);
    jetzt.mockRestore();
  });

  it("haelt einen gescheiterten Lesevorgang nicht fest", async () => {
    getFehler = { code: 14 };
    await expect(queryJobs({ alter: 30 })).rejects.toMatchObject({ code: 14 });
    await expect(queryJobs({ alter: 30 })).resolves.toMatchObject({ totalCount: 1 });
  });

  it("gibt Kopien heraus, die das Abbild nicht veraendern", async () => {
    const erste = await queryJobs({ alter: 30 });
    (erste.results[0] as unknown as Record<string, unknown>).veraendert = true;
    const zweite = await queryJobs({ alter: 30 });
    expect(zweite.results[0]).not.toBe(erste.results[0]);
    expect("veraendert" in zweite.results[0]).toBe(false);
  });

  // Der indizierte Weg bleibt, wo er geht: er liest nur eine Seite.
  it("laesst den indizierten Weg unberuehrt", async () => {
    docs = Array.from({ length: 200 }, (_, i) => job({ pinstGuid: `id${i}` }));
    const result = await queryJobs({ limit: 10 });
    expect(limitArg).toBe(11);
    expect(result.gelesen).toBe(11);
  });
});

/**
 * Dieselbe Auswertung wie Firestore - fuer genau die vier Operatoren aus
 * buildQuery. Weicht sie ab, liefert der Speicherweg andere Treffer als die
 * Query, die er ersetzt.
 */
describe("erfuellt", () => {
  const daten = {
    vollzeit: false,
    api: { ReqIndustry: 2, Region: "11" },
    besoldung: { tabelle: "A", bisStufe: 11 },
    jobAttributes: { seiteneinstieg: "unklar" },
    ortTokens: ["köln", "wahn"],
  };

  it("vergleicht == streng und ueber verschachtelte Pfade", () => {
    expect(erfuellt(daten, { feld: "api.ReqIndustry", op: "==", wert: 2 })).toBe(true);
    expect(erfuellt(daten, { feld: "api.ReqIndustry", op: "==", wert: "2" })).toBe(false);
    expect(erfuellt(daten, { feld: "vollzeit", op: "==", wert: false })).toBe(true);
  });

  it("laesst ein fehlendes Feld keine Bedingung erfuellen", () => {
    expect(erfuellt(daten, { feld: "einstiegsweg", op: "==", wert: undefined })).toBe(false);
    expect(erfuellt(daten, { feld: "api.Fehlt", op: "in", wert: ["a"] })).toBe(false);
    expect(erfuellt(daten, { feld: "besoldung.vonStufe", op: ">=", wert: 1 })).toBe(false);
    expect(erfuellt(daten, { feld: "suchTokens", op: "array-contains", wert: "x" })).toBe(false);
    expect(erfuellt({}, { feld: "besoldung.tabelle", op: "==", wert: "A" })).toBe(false);
  });

  it("wertet in, >= und array-contains aus", () => {
    expect(erfuellt(daten, { feld: "jobAttributes.seiteneinstieg", op: "in", wert: ["ja", "unklar"] })).toBe(true);
    expect(erfuellt(daten, { feld: "besoldung.bisStufe", op: ">=", wert: 11 })).toBe(true);
    expect(erfuellt(daten, { feld: "besoldung.bisStufe", op: ">=", wert: 12 })).toBe(false);
    // Firestore ordnet Zahlen und Texte getrennt - kein Vergleich ueber Typen hinweg.
    expect(erfuellt(daten, { feld: "besoldung.bisStufe", op: ">=", wert: "1" })).toBe(false);
    expect(erfuellt(daten, { feld: "ortTokens", op: "array-contains", wert: "wahn" })).toBe(true);
    expect(erfuellt(daten, { feld: "ortTokens", op: "array-contains", wert: "bonn" })).toBe(false);
  });
});
