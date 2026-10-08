import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Zeichnet auf, welche Gleichheitsfilter je Zaehlung gestellt wurden. Genau das
 * ist der Vertrag dieses Tools: es darf NICHT Dokumente lesen und daraus zaehlen,
 * sondern muss Firestore zaehlen lassen.
 */
interface Zaehlung {
  filter: { field: string; value: unknown }[];
}

const zaehlungen: Zaehlung[] = [];
/** Liefert die Trefferzahl je Zaehlung - pro Test ueberschreibbar. */
let anzahlFuer: (filter: { field: string; value: unknown }[]) => number = () => 3;
/** Feld, dessen Zaehlung mit fehlendem Index scheitern soll. */
let fehlendesIndexFeld: string | null = null;

function makeQuery(filter: { field: string; value: unknown }[] = []): unknown {
  const query = {
    where(field: string, _op: string, value: unknown) {
      return makeQuery([...filter, { field, value }]);
    },
    count() {
      return {
        async get() {
          if (fehlendesIndexFeld && filter.some((f) => f.field === fehlendesIndexFeld)) {
            throw Object.assign(new Error("no index"), { code: 9 });
          }
          zaehlungen.push({ filter });
          return { data: () => ({ count: anzahlFuer(filter) }) };
        },
      };
    },
    orderBy: () => query,
    limit: () => query,
    async get() {
      return { docs: [], size: 0 };
    },
  };
  return query;
}

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({ collection: () => makeQuery() }),
  Timestamp: { fromMillis: (millis: number) => ({ toMillis: () => millis }) },
}));

const { zaehleTreffer } = await import("./zaehleTreffer");

beforeEach(() => {
  zaehlungen.length = 0;
  anzahlFuer = () => 3;
  fehlendesIndexFeld = null;
});

describe("zaehle_treffer", () => {
  it("zaehlt ueber Aggregationen statt Dokumente zu lesen", async () => {
    const result = await zaehleTreffer({});
    expect(result.gesamt).toBe(3);
    // Eine Zaehlung fuer gesamt plus je Facettenwert eine.
    expect(zaehlungen.length).toBeGreaterThan(30);
  });

  it("liefert alle vier Dimensionen mit sprechenden Namen statt Codes", async () => {
    const result = await zaehleTreffer({});
    expect(result.facetten.organisationsbereich?.map((f) => f.wert)).toContain("Marine");
    expect(result.facetten.laufbahngruppe?.map((f) => f.wert)).toContain("Offiziere");
    expect(result.facetten.taetigkeitsbereich?.map((f) => f.wert).toSorted()).toEqual(["militaerisch", "zivil"]);
    expect(result.facetten.vertragsart?.length).toBeGreaterThan(0);
  });

  // "Hier gibt es nichts" ist die eigentlich nuetzliche Auskunft - sie darf nicht
  // weggelassen werden, sonst raet der Client weiter.
  it("behaelt Facettenwerte mit 0 Treffern", async () => {
    anzahlFuer = () => 0;
    const result = await zaehleTreffer({});
    expect(result.facetten.organisationsbereich?.every((f) => f.anzahl === 0)).toBe(true);
    expect(result.facetten.organisationsbereich?.length).toBeGreaterThan(10);
  });

  // Der Grund fuer dieses Feld: ohne es erklaert ein schwaecheres Modell die
  // Laufbahngruppen dem Bewerber aus seinem Trainingswissen und liegt falsch.
  it("liefert zu jeder Laufbahngruppe eine Bedeutung mit", async () => {
    const result = await zaehleTreffer({});
    for (const eintrag of result.facetten.laufbahngruppe ?? []) {
      expect(eintrag.bedeutung, `${eintrag.wert} ohne Bedeutung`).toBeTruthy();
    }
  });

  // Nur dort, wo es wirklich noetig ist - sonst blaeht jede Antwort auf.
  it("haengt keine Bedeutung an selbsterklaerende Facetten", async () => {
    const result = await zaehleTreffer({});
    for (const eintrag of result.facetten.organisationsbereich ?? []) {
      expect(eintrag.bedeutung).toBeUndefined();
    }
    for (const eintrag of result.facetten.vertragsart ?? []) {
      expect(eintrag.bedeutung).toBeUndefined();
    }
  });

  // Wird die Facette gezaehlt, der Parameter aber nicht angenommen, verwirft
  // der Server einstiegswege=["reserveoffizier"] still, und `gesamt` (etwa
  // alle Marine-Offiziere) gilt als Zahl der Reserveoffiziersstellen.
  it("nimmt einstiegswege als Filter an und gibt ihn an die Query weiter", async () => {
    await zaehleTreffer({ einstiegswege: ["reserveoffizier"] });
    expect(zaehlungen.some((z) => z.filter.some((f) => f.value === "reserveoffizier"))).toBe(true);
  });

  // Dasselbe gilt fuer `bundesland`: fehlt der Parameter hier, kommt die
  // bundesweite Zahl als Landeszahl zurueck, und ein Client folgert daraus,
  // in Brandenburg gebe es die Fachrichtung gar nicht.
  it("nimmt bundesland als Filter an und gibt es an die Query weiter", async () => {
    await zaehleTreffer({ bundesland: ["Brandenburg"] });
    const regionFilter = zaehlungen.flatMap((z) => z.filter).filter((f) => f.field === "api.Region");
    expect(regionFilter.length).toBeGreaterThan(0);
    // Ein einzelner Wert wird als Gleichheit gestellt, mehrere als IN - s. den
    // Test darunter. Beides ist richtig, nur nicht dasselbe.
    expect(regionFilter[0].value).toBe("12");
  });

  it("uebersetzt mehrere Bundeslaender in ihre Codes", async () => {
    await zaehleTreffer({ bundesland: ["Hamburg", "Bremen"] });
    const regionFilter = zaehlungen.flatMap((z) => z.filter).find((f) => f.field === "api.Region");
    expect(regionFilter?.value).toEqual(["02", "04"]);
  });

  it("zaehlt bei gesetztem Filter nur die gewaehlten Einstiegswege", async () => {
    const result = await zaehleTreffer({ einstiegswege: ["reserveoffizier"] });
    expect(result.facetten.einstiegsweg?.map((e) => e.wert)).toEqual(["reserveoffizier"]);
  });

  it("liefert zu jedem Einstiegsweg eine Bedeutung", async () => {
    const result = await zaehleTreffer({});
    for (const eintrag of result.facetten.einstiegsweg ?? []) {
      expect(eintrag.bedeutung, eintrag.wert).toBeTruthy();
    }
  });

  it("zaehlt eine Dimension nicht, die der Filter bereits festlegt", async () => {
    const result = await zaehleTreffer({ organisationsbereich: ["Marine"] });
    expect(result.facetten.organisationsbereich).toBeUndefined();
    expect(result.facetten.laufbahngruppe).toBeDefined();
  });

  // Ausnahme von der Regel darueber, und der Grund ist die Bedeutung: wer nach
  // "Andere" filtert, schreibt anschliessend darueber - und braucht das Wort
  // dazu. Fiele die Dimension hier weg, fehlte die Erklaerung genau dann.
  it("liefert die Bedeutung auch fuer eine bereits gefilterte Laufbahngruppe", async () => {
    const result = await zaehleTreffer({ laufbahngruppe: ["Andere"] });
    const eintraege = result.facetten.laufbahngruppe ?? [];
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0].wert).toBe("Andere");
    expect(eintraege[0].bedeutung).toMatch(/catch-all/i);
  });

  it("sortiert die groessten Toepfe nach vorn", async () => {
    // Marine bekommt kuenstlich die meisten Treffer - es muss vorn stehen,
    // egal an welcher Stelle der Code in der Optionsliste steht.
    anzahlFuer = (filter) => (filter.some((f) => f.value === "0004") ? 99 : 1);
    const result = await zaehleTreffer({});
    const anzahlen = result.facetten.organisationsbereich?.map((f) => f.anzahl) ?? [];
    expect(anzahlen).toEqual([...anzahlen].sort((a, b) => b - a));
    expect(result.facetten.organisationsbereich?.[0].wert).toBe("Marine");
  });

  it("laesst eine Dimension ohne Index ausfallen, statt den Aufruf zu verlieren", async () => {
    fehlendesIndexFeld = "laufbahngruppe";
    const result = await zaehleTreffer({});
    expect(result.facetten.laufbahngruppe).toBeUndefined();
    expect(result.facetten.organisationsbereich).toBeDefined();
    expect(result.hinweis?.nurFuerDich).toContain("laufbahngruppe");
  });

  // Mehrere Woerter braeuchten einen Nachfilter - die Zahlen waeren dann still falsch.
  it("weist mehrteilige Suchbegriffe mit einer umsetzbaren Anweisung zurueck", async () => {
    await expect(zaehleTreffer({ suchbegriff: "IT Offizier" })).rejects.toThrow(/ein Wort/);
  });

  it("weist Suchbegriff und Ort gleichzeitig zurueck", async () => {
    await expect(zaehleTreffer({ suchbegriff: "IT", wunschort: "Köln" })).rejects.toThrow(/list_jobs/);
  });
});

// Gleiche Begruendung wie bei list_jobs: zaehle_treffer ist der empfohlene
// Ausweg aus einer leeren Suche - liefert es selbst eine Null ohne Wegweiser,
// ist der Ausweg zu Ende und die KI sagt "gibt es nicht".
describe("zaehle_treffer — nichts gezaehlt", () => {
  it("weist aus einem Null-Ergebnis heraus einen naechsten Schritt", async () => {
    anzahlFuer = () => 0;
    const result = await zaehleTreffer({ suchbegriff: "Panzerkommandant" });
    expect(result.gesamt).toBe(0);
    expect(result.hinweis?.nurFuerDich).toMatch(/Panzer/);
  });

  it("laesst den Hinweis weg, sobald es Treffer gibt", async () => {
    const result = await zaehleTreffer({ suchbegriff: "Panzerkommandant" });
    expect(result.gesamt).toBeGreaterThan(0);
    expect(result.hinweis).toBeUndefined();
  });

  // S. listJobs.test.ts - der Weg zur E-Mail-Benachrichtigung nur bei
  // Treffern, in einem eigenen Feld.
  it("zeigt bei Treffern den Weg zur E-Mail-Benachrichtigung, bei null nicht", async () => {
    const mitTreffern = await zaehleTreffer({ suchbegriff: "IT" });
    expect(mitTreffern.neueStellenPerMail?.nurFuerDich).toMatch(/erstelle_suchprofil_link/);
    anzahlFuer = () => 0;
    const ohne = await zaehleTreffer({ suchbegriff: "IT" });
    expect(ohne.neueStellenPerMail).toBeUndefined();
  });
});

// `reqIndustry` liegt im Schema jobsV2 unter `api.*`. Fragt die Zaehlung ein
// falsches Feld ab, antwortet Firestore nicht mit einem Fehler, sondern mit 0 -
// `zaehle_treffer` meldet dann militaerisch 0 und zivil 0, waehrend list_jobs
// korrekt zaehlt.
describe("zaehle_treffer — Feldpfade im Schema jobsV2", () => {
  it("zaehlt den Taetigkeitsbereich auf api.ReqIndustry", async () => {
    await zaehleTreffer({});
    const felder = zaehlungen.flatMap((z) => z.filter.map((f) => f.field));
    expect(felder).toContain("api.ReqIndustry");
    expect(felder).not.toContain("reqIndustry");
  });
});
