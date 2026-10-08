import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MAPPE_FRIST_MS } from "./ablauf";
import type { MappeRecord } from "./mappeTypen";

/**
 * Ein einzelner veraenderlicher "Dokumentstand" statt eines frischen Mocks je
 * Aufruf: die entscheidenden Tests unten rufen ZWEI Schreibvorgaenge
 * nacheinander auf (merkeZip, dann fuegeDokumentEin/entferneDokument/
 * setzeFormularstand) und muessen sehen, was der zweite Aufruf beim vom
 * ersten hinterlassenen Stand vorfindet - genau diese Verkettung muss
 * geprueft sein.
 */
function machDoc(anfangsstand: Record<string, unknown>) {
  let stand = { ...anfangsstand };
  // Versionszaehler wie Firestores interne Update-Zeit: eine Transaktion, deren
  // gelesenes Dokument sich vor dem Commit geaendert hat, wird wiederholt.
  let version = 0;
  /**
   * Feuert GENAU EINMAL, direkt nach einem Lesevorgang - modelliert den fremden
   * Schreibvorgang, der zwischen Lesen und Schreiben faellt. Beim zweiten
   * (Wiederholungs-)Versuch feuert er nicht mehr, wie im echten Rennen auch.
   */
  let dazwischen: (() => Promise<void>) | null = null;

  async function lesen() {
    const momentaufnahme = { version, daten: stand };
    if (dazwischen) {
      const fremd = dazwischen;
      dazwischen = null;
      await fremd();
    }
    return momentaufnahme;
  }
  function schreiben(patch: Record<string, unknown>) {
    stand = { ...stand, ...patch };
    version++;
  }

  return {
    get: async () => {
      const gelesen = await lesen();
      return { exists: true, data: () => gelesen.daten as unknown as MappeRecord };
    },
    set: async (v: Record<string, unknown>) => {
      stand = { ...v };
      version++;
    },
    update: async (v: Record<string, unknown>) => schreiben(v),
    stand: () => stand,
    version: () => version,
    lesen,
    schreiben,
    setzeDazwischen: (fremd: () => Promise<void>) => {
      dazwischen = fremd;
    },
  };
}

/** Eine Kennung im echten Format - `mappeStore` weist alles andere vor jedem Zugriff ab. */
const M1 = "m" + "0".repeat(24) + "1";

let fakeDoc = machDoc({});
const docMock = vi.fn(() => fakeDoc);
/** Was die Zaehlung offener Mappen in `erstelleMappe` liefert. */
let offeneMappen = 0;
const offeneMappenAbfragen: { feld: string; op: string; wert: unknown }[] = [];
const collectionMock = vi.fn(() => ({
  doc: docMock,
  where: (feld: string, op: string, wert: unknown) => {
    offeneMappenAbfragen.push({ feld, op, wert });
    return { count: () => ({ get: async () => ({ data: () => ({ count: offeneMappen }) }) }) };
  },
}));

/**
 * Firestore-Transaktion mit dem Verhalten, auf das es hier ankommt: Schreiben
 * wird gepuffert und erst beim Commit angewendet, und wenn sich das gelesene
 * Dokument inzwischen geaendert hat, laeuft die Transaktion NEU. Ohne dieses
 * Modell koennte der Test den Unterschied zwischen `get()`+`update()` und einer
 * echten Transaktion gar nicht zeigen.
 */
const runTransactionMock = vi.fn(
  async <T>(
    fn: (tx: {
      get: (ref: unknown) => Promise<{ exists: boolean; data: () => MappeRecord }>;
      update: (ref: unknown, patch: Record<string, unknown>) => void;
    }) => Promise<T>,
  ): Promise<T> => {
    for (let versuch = 0; versuch < 5; versuch++) {
      let geleseneVersion: number | null = null;
      const schreibpuffer: Record<string, unknown>[] = [];
      const tx = {
        get: async () => {
          const gelesen = await fakeDoc.lesen();
          geleseneVersion = gelesen.version;
          return { exists: true, data: () => gelesen.daten as unknown as MappeRecord };
        },
        update: (_ref: unknown, patch: Record<string, unknown>) => {
          schreibpuffer.push(patch);
        },
      };
      const ergebnis = await fn(tx);
      if (geleseneVersion !== null && geleseneVersion !== fakeDoc.version()) continue;
      for (const patch of schreibpuffer) fakeDoc.schreiben(patch);
      return ergebnis;
    }
    throw new Error("Transaktion nach fuenf Versuchen aufgegeben");
  },
);

const getFirestoreMock = vi.fn(() => ({ collection: collectionMock, runTransaction: runTransactionMock }));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: (...a: unknown[]) => getFirestoreMock(...a),
  FieldValue: {
    arrayUnion: (v: unknown) => ({ __op: "arrayUnion", v }),
    arrayRemove: (v: unknown) => ({ __op: "arrayRemove", v }),
  },
}));

const saveMock = vi.fn();
const deleteFileMock = vi.fn();
const fileMock = vi.fn(() => ({ save: saveMock, delete: deleteFileMock }));
const bucketMock = vi.fn(() => ({ file: fileMock }));
const getStorageMock = vi.fn(() => ({ bucket: bucketMock }));
vi.mock("firebase-admin/storage", () => ({
  getStorage: (...a: unknown[]) => getStorageMock(...a),
}));

const {
  erstelleMappe,
  fuegeDokumentEin,
  entferneDokument,
  setzeFormularstand,
  merkeZip,
  ladeMappe,
  ladeMappeRoh,
  MappeNichtGefundenError,
  ZuVieleMappenError,
  MAX_OFFENE_MAPPEN,
} = await import("./mappeStore");

const JETZT = 1_800_000_000_000;

function leereMappe(teil: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    pinstGuid: "p1",
    refCode: "REF-1",
    titel: "Teststelle",
    erstelltAm: JETZT - 10_000,
    letzteAktivitaetAm: JETZT - 10_000,
    verfaelltAm: JETZT - 10_000 + MAPPE_FRIST_MS,
    zipGebautAm: null,
    heruntergeladenAm: null,
    einmalToken: null,
    dokumente: [],
    formularstand: {},
    ...teil,
  };
}

beforeEach(() => {
  saveMock.mockReset();
  deleteFileMock.mockReset();
  runTransactionMock.mockClear();
  fakeDoc = machDoc(leereMappe());
  offeneMappen = 0;
  offeneMappenAbfragen.length = 0;
});

/** Schnappschuss der Ausschreibungsdaten, wie ihn `eroeffne_bewerbungsmappe` mitgibt. */
const ANFORDERUNGEN = {
  geforderteUnterlagen: ["Lebenslauf"],
  unterlagenHinweise: "",
  bewerbungsschluss: "2026-09-01",
};

function dokumentEintrag(over: Record<string, unknown> = {}) {
  return {
    docId: "d1",
    art: "zeugnis",
    dateiname: "zeugnis.pdf",
    storagePath: `bewerbungsmappen/${M1}/d1`,
    contentType: "application/pdf",
    sizeBytes: 100,
    herkunft: "upload",
    hinzugefuegtAm: JETZT - 20_000,
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * WOZU: verfaelltAm ist die eigentliche
 * Datenschutz-Zusage im Datensatz selbst. verfaelltAm muss ab der Stichzeit
 * (Paketbau, falls es einen gibt) laufen, nicht ab JEDER Beruehrung - sonst
 * verlaengert ein spaeterer Schreibvorgang die Aufbewahrung nach hinten.
 */
describe("verfaelltAm", () => {
  it("wird bei der Erstellung auf jetzt + Frist gesetzt (noch kein Paket)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await erstelleMappe({ pinstGuid: "p1", refCode: "REF-1", titel: "Teststelle", anforderungen: ANFORDERUNGEN });

    expect(fakeDoc.stand().zipGebautAm).toBeNull();
    expect(fakeDoc.stand().verfaelltAm).toBe(JETZT + MAPPE_FRIST_MS);
  });

  /**
   * WOZU: `mappe_status` ist der Aufruf, den ein Client waehrend des Wartens
   * auf den Upload dutzendfach wiederholt. Mit dem Schnappschuss beim Eroeffnen
   * kostet er einen Read statt vier fuer die Anforderungen der Ausschreibung.
   *
   * DSGVO: hier darf ausschliesslich OEFFENTLICHE Ausschreibungsdaten stehen -
   * keine Bewerberangabe kommt durch diesen Schnappschuss nach Firestore.
   */
  it("legt den Schnappschuss der Ausschreibungsdaten mit an", async () => {
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await erstelleMappe({ pinstGuid: "p1", refCode: "REF-1", titel: "Teststelle", anforderungen: ANFORDERUNGEN });

    expect(fakeDoc.stand().anforderungen).toEqual(ANFORDERUNGEN);
  });

  it("wird beim Hinzufuegen eines Dokuments neu gesetzt, solange es noch kein Paket gibt", async () => {
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await fuegeDokumentEin(
      M1,
      { docId: "d1", art: "zeugnis", dateiname: "zeugnis.pdf", contentType: "application/pdf", sizeBytes: 100, herkunft: "upload" },
      new Uint8Array(),
    );

    expect(fakeDoc.stand().letzteAktivitaetAm).toBe(JETZT);
    expect(fakeDoc.stand().verfaelltAm).toBe(JETZT + MAPPE_FRIST_MS);
  });

  it("wird bei merkeZip auf den Paketbau-Zeitpunkt plus Frist gesetzt", async () => {
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await merkeZip(M1, "einmalToken1");

    expect(fakeDoc.stand().zipGebautAm).toBe(JETZT);
    expect(fakeDoc.stand().verfaelltAm).toBe(JETZT + MAPPE_FRIST_MS);
  });

  /**
   * Der heikle Fall: die Frist laeuft ab dem
   * Paketbau, nicht ab der letzten Beruehrung. Nachgerechnet: Paket gebaut bei JETZT, 30 Minuten spaeter noch ein
   * Dokument angefasst - verfaelltAm MUSS JETZT + Frist bleiben, nicht auf
   * (JETZT + 30 Minuten) + Frist springen.
   */
  it("verschiebt die Loeschung NICHT, wenn nach dem Paketbau noch ein Dokument hinzugefuegt wird", async () => {
    const gebautAm = JETZT;
    vi.spyOn(Date, "now").mockReturnValue(gebautAm);
    await merkeZip(M1, "einmalToken1");

    const spaeter = gebautAm + 30 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(spaeter);
    await fuegeDokumentEin(
      M1,
      { docId: "d2", art: "zeugnis", dateiname: "nachtrag.pdf", contentType: "application/pdf", sizeBytes: 50, herkunft: "upload" },
      new Uint8Array(),
    );

    expect(fakeDoc.stand().letzteAktivitaetAm).toBe(spaeter);
    expect(fakeDoc.stand().verfaelltAm).toBe(gebautAm + MAPPE_FRIST_MS);
  });

  it("verschiebt die Loeschung NICHT, wenn nach dem Paketbau noch ein Formularstand gesetzt wird", async () => {
    const gebautAm = JETZT;
    vi.spyOn(Date, "now").mockReturnValue(gebautAm);
    await merkeZip(M1, "einmalToken1");

    const spaeter = gebautAm + 30 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(spaeter);
    await setzeFormularstand(M1, "doc1", { gefuellt: 3, fehlendeAngaben: [] });

    expect(fakeDoc.stand().verfaelltAm).toBe(gebautAm + MAPPE_FRIST_MS);
  });

  it("verschiebt die Loeschung NICHT, wenn nach dem Paketbau noch ein Dokument entfernt wird", async () => {
    fakeDoc = machDoc(
      leereMappe({
        dokumente: [
          {
            docId: "d1",
            art: "zeugnis",
            dateiname: "zeugnis.pdf",
            storagePath: `bewerbungsmappen/${M1}/d1`,
            contentType: "application/pdf",
            sizeBytes: 100,
            herkunft: "upload",
            hinzugefuegtAm: JETZT - 20_000,
          },
        ],
      }),
    );

    const gebautAm = JETZT;
    vi.spyOn(Date, "now").mockReturnValue(gebautAm);
    await merkeZip(M1, "einmalToken1");

    const spaeter = gebautAm + 30 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(spaeter);
    await entferneDokument(M1, "d1");

    expect(fakeDoc.stand().verfaelltAm).toBe(gebautAm + MAPPE_FRIST_MS);
  });
});

/**
 * WOZU: Die Tests oben pruefen die Verkettung NACHEINANDER. Dazwischen liegt
 * aber ein Rennen: `merkeZip` faellt zwischen das Lesen und das Schreiben des
 * anderen Aufrufs. Dann liest der andere `zipGebautAm: null`, obwohl das Paket
 * schon gebaut ist, und setzt `verfaelltAm` auf `jetzt + Frist` statt auf
 * `zipGebautAm + Frist`. Weil `jetzt` immer >= dem Paketbau liegt, kann das die
 * Frist NUR verlaengern - und der Aufraeumlauf waehlt seine Kandidaten per
 * `where("verfaelltAm", "<=", jetzt)`: ist der Wert zu hoch, taucht die Mappe in
 * der Abfrage gar nicht auf, und die Pruefung `istAbgelaufen` bekommt sie nie zu
 * sehen. Die Zusage "eine Stunde" haengt also an genau diesem Rennen.
 *
 * Das Gegenmittel ist dasselbe wie bei `registriereAtomar` und
 * `loeseDownloadEin`: Lesen und Schreiben in EINER Transaktion, die Firestore
 * wiederholt, wenn das gelesene Dokument sich inzwischen geaendert hat.
 */
describe("Rennen mit merkeZip", () => {
  function merkeZipDazwischen(gebautAm: number, danach: number) {
    fakeDoc.setzeDazwischen(async () => {
      vi.spyOn(Date, "now").mockReturnValue(gebautAm);
      await merkeZip(M1, "einmalToken1");
      vi.spyOn(Date, "now").mockReturnValue(danach);
    });
  }

  it("verlaengert die Frist nicht, wenn merkeZip zwischen Lesen und Schreiben von fuegeDokumentEin faellt", async () => {
    const gebautAm = JETZT;
    const spaeter = JETZT + 30 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(spaeter);
    merkeZipDazwischen(gebautAm, spaeter);

    await fuegeDokumentEin(
      M1,
      { docId: "d2", art: "zeugnis", dateiname: "nachtrag.pdf", contentType: "application/pdf", sizeBytes: 50, herkunft: "upload" },
      new Uint8Array(),
    );

    expect(fakeDoc.stand().zipGebautAm).toBe(gebautAm);
    expect(fakeDoc.stand().verfaelltAm).toBe(gebautAm + MAPPE_FRIST_MS);
  });

  it("verlaengert die Frist nicht, wenn merkeZip zwischen Lesen und Schreiben von setzeFormularstand faellt", async () => {
    const gebautAm = JETZT;
    const spaeter = JETZT + 30 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(spaeter);
    merkeZipDazwischen(gebautAm, spaeter);

    await setzeFormularstand(M1, "doc1", { gefuellt: 3, fehlendeAngaben: [] });

    expect(fakeDoc.stand().verfaelltAm).toBe(gebautAm + MAPPE_FRIST_MS);
  });

  it("verlaengert die Frist nicht, wenn merkeZip zwischen Lesen und Schreiben von entferneDokument faellt", async () => {
    fakeDoc = machDoc(leereMappe({ dokumente: [dokumentEintrag()] }));
    const gebautAm = JETZT;
    const spaeter = JETZT + 30 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(spaeter);
    merkeZipDazwischen(gebautAm, spaeter);

    await entferneDokument(M1, "d1");

    expect(fakeDoc.stand().verfaelltAm).toBe(gebautAm + MAPPE_FRIST_MS);
    // Die Datei selbst muss trotz Wiederholung verschwinden - sonst bliebe eine
    // Bewerbungsdatei liegen, die der Bewerber gerade zurueckgezogen hat.
    expect(deleteFileMock).toHaveBeenCalled();
  });
});

/**
 * WOZU: `raeumeMappenAuf` laeuft viertelstuendlich - eine abgelaufene Mappe
 * steht darum planmaessig bis zu 15 Minuten laenger in Firestore. Ohne
 * Pruefung im Lader waere sie in diesem Fenster ueber die MCP-Werkzeuge voll
 * benutzbar, und `schliesse_bewerbungsmappe` liesse sie ueber `merkeZip` um
 * eine weitere Stunde AUFERSTEHEN. Werkzeugtests sehen das nicht, weil sie
 * `ladeMappe` samt Pruefung durch eine Attrappe ersetzen - deshalb sitzen diese Tests hier am Lader selbst.
 */
describe("Ablauf beim Laden und beim Paketbau", () => {
  const ABGELAUFEN_AM = JETZT - MAPPE_FRIST_MS - 1_000;

  function abgelaufeneMappe() {
    return leereMappe({
      zipGebautAm: ABGELAUFEN_AM,
      letzteAktivitaetAm: ABGELAUFEN_AM,
      verfaelltAm: ABGELAUFEN_AM + MAPPE_FRIST_MS,
    });
  }

  it("gibt eine Mappe innerhalb der Frist heraus", async () => {
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await expect(ladeMappe(M1)).resolves.toMatchObject({ refCode: "REF-1" });
  });

  it("weist eine abgelaufene Mappe ab, obwohl das Dokument noch existiert", async () => {
    fakeDoc = machDoc(abgelaufeneMappe());
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await expect(ladeMappe(M1)).rejects.toThrow(MappeNichtGefundenError);
  });

  it("gibt fuer eine fehlende und eine abgelaufene Mappe DENSELBEN Fehler - der Unterschied darf nach aussen nicht sichtbar sein", async () => {
    fakeDoc = machDoc(abgelaufeneMappe());
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await expect(ladeMappe(M1)).rejects.toThrow("gibt es nicht mehr");
  });

  it("laesst ladeMappeRoh die abgelaufene Mappe durch - die HTTP-Endpunkte antworten selbst mit 410", async () => {
    fakeDoc = machDoc(abgelaufeneMappe());
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await expect(ladeMappeRoh(M1)).resolves.toMatchObject({ zipGebautAm: ABGELAUFEN_AM });
  });

  /**
   * WOZU: Dieser Text geht bei vier Werkzeugen unveraendert an das fremde
   * KI-Tool - er ist die einzige Steuerung, die genau dann ankommt, wenn der
   * Client falsch abbiegt. Die Frist allein zu erklaeren reicht nicht: ein Client, der eine Sackgasse ohne
   * naechsten Schritt sieht, meldet dem Bewerber eine Stoerung, statt ihm eine
   * neue Mappe anzulegen.
   */
  it("nennt im Fehlertext den Weg heraus, nicht nur das Warum", async () => {
    fakeDoc = machDoc(abgelaufeneMappe());
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await expect(ladeMappe(M1)).rejects.toThrow(/eroeffne_bewerbungsmappe/);
    // Und die Frist bleibt erklaert - der Weg ersetzt sie nicht.
    await expect(ladeMappe(M1)).rejects.toThrow(/eine Stunde/);
    // Kein "Serverfehler"-Missverstaendnis: das ist der Satz, der den Client
    // davon abhaelt, eine Stoerung zu melden.
    await expect(ladeMappe(M1)).rejects.toThrow(/kein Serverfehler/);
  });

  it("nennt die Kennung der Mappe nicht - sie ist der Zugriffsschluessel", async () => {
    fakeDoc = machDoc(abgelaufeneMappe());
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    const fehler = await ladeMappe("mGEHEIM123").catch((f: Error) => f);
    expect((fehler as Error).message).not.toContain("mGEHEIM123");
  });

  it("laesst merkeZip eine abgelaufene Mappe NICHT auferstehen", async () => {
    fakeDoc = machDoc(abgelaufeneMappe());
    vi.spyOn(Date, "now").mockReturnValue(JETZT);

    await expect(merkeZip(M1, "einmalToken1")).rejects.toThrow(MappeNichtGefundenError);
    // Der eigentliche Schaden waere nicht der Aufruf, sondern das verschobene
    // verfaelltAm: eine Stunde extra fuer Daten, deren Frist schon um war.
    expect(fakeDoc.stand().verfaelltAm).toBe(ABGELAUFEN_AM + MAPPE_FRIST_MS);
    expect(fakeDoc.stand().zipGebautAm).toBe(ABGELAUFEN_AM);
  });
});

/**
 * WOZU: die Pro-IP-Drosselung bremst einen
 * Aufrufer, nicht viele. Ohne globalen Deckel liessen sich Mappen schneller
 * anlegen, als der Aufraeumlauf sie loescht - dann haelt die Stundenfrist nicht.
 */
describe("Deckel fuer offene Mappen", () => {
  it("zaehlt nur Mappen, deren Frist noch laeuft", async () => {
    vi.spyOn(Date, "now").mockReturnValue(JETZT);
    await erstelleMappe({ pinstGuid: "p1", refCode: "REF-1", titel: "Teststelle", anforderungen: ANFORDERUNGEN });
    expect(offeneMappenAbfragen).toEqual([{ feld: "verfaelltAm", op: ">", wert: JETZT }]);
  });

  it("legt unterhalb des Deckels an", async () => {
    offeneMappen = MAX_OFFENE_MAPPEN - 1;
    await expect(
      erstelleMappe({ pinstGuid: "p1", refCode: "REF-1", titel: "Teststelle", anforderungen: ANFORDERUNGEN }),
    ).resolves.toMatch(/^m[0-9a-z]{25}$/);
  });

  it("lehnt am Deckel hoeflich ab, ohne anzulegen, und nennt den naechsten Schritt", async () => {
    offeneMappen = MAX_OFFENE_MAPPEN;
    const fehler = await erstelleMappe({
      pinstGuid: "p1",
      refCode: "REF-1",
      titel: "Teststelle",
      anforderungen: ANFORDERUNGEN,
    }).catch((f: unknown) => f);
    expect(fehler).toBeInstanceOf(ZuVieleMappenError);
    expect((fehler as Error).message).toMatch(/höchstens noch zwei- oder dreimal/);
    // Der Weg ohne Mappe, falls der Deckel laenger anhaelt.
    expect((fehler as Error).message).toMatch(/get_document_requirements/);
    expect(fakeDoc.stand()).toEqual(leereMappe());
  });
});

/**
 * WOZU: prueften die Werkzeuge die Mengengrenze VOR dem Aufruf gegen einen
 * frueher gelesenen Stand, koennten gleichzeitige Aufrufe sie unterlaufen.
 * Deshalb prueft die Transaktion selbst.
 */
describe("fuegeDokumentEin - Mengengrenze in der Transaktion", () => {
  function eintraege(anzahl: number, teil: Record<string, unknown> = {}) {
    return Array.from({ length: anzahl }, (_, i) => dokumentEintrag({ docId: `t${i}`, ...teil }));
  }

  beforeEach(() => {
    deleteFileMock.mockResolvedValue(undefined);
  });

  const NEU = {
    docId: "tneu",
    art: "formular" as const,
    dateiname: "Bewerbungsbogen_REF-1.pdf",
    contentType: "application/pdf",
    sizeBytes: 100,
    herkunft: "formular" as const,
    vorlageDocId: "f1",
  };

  it("lehnt das elfte Dokument ab und loescht die schon geschriebene Datei wieder", async () => {
    vi.spyOn(Date, "now").mockReturnValue(JETZT);
    fakeDoc = machDoc(leereMappe({ dokumente: eintraege(10) }));

    await expect(fuegeDokumentEin(M1, NEU, new Uint8Array([1]))).rejects.toThrow(/höchstens 10 Dateien/);
    expect((fakeDoc.stand().dokumente as unknown[]).length).toBe(10);
    expect(deleteFileMock).toHaveBeenCalled();
  });

  it("sieht ein Dokument, das zwischen Vorpruefung und Schreiben hinzukam", async () => {
    vi.spyOn(Date, "now").mockReturnValue(JETZT);
    fakeDoc = machDoc(leereMappe({ dokumente: eintraege(9) }));
    // Ein gleichzeitiger Upload faellt zwischen Lesen und Schreiben - die
    // Transaktion wiederholt und sieht dann zehn.
    fakeDoc.setzeDazwischen(async () => {
      fakeDoc.schreiben({ dokumente: eintraege(10) });
    });

    await expect(fuegeDokumentEin(M1, NEU, new Uint8Array([1]))).rejects.toThrow(/höchstens 10 Dateien/);
  });

  it("ersetzt ein frueher ausgefuelltes Formular, statt die Mappe wachsen zu lassen", async () => {
    vi.spyOn(Date, "now").mockReturnValue(JETZT);
    const alt = dokumentEintrag({ docId: "talt", art: "formular", herkunft: "formular", vorlageDocId: "f1" });
    fakeDoc = machDoc(leereMappe({ dokumente: [...eintraege(9), alt] }));

    await fuegeDokumentEin(M1, NEU, new Uint8Array([1]), (d) => d.herkunft === "formular" && d.vorlageDocId === "f1");

    const dokumente = fakeDoc.stand().dokumente as { docId: string }[];
    expect(dokumente).toHaveLength(10);
    expect(dokumente.map((d) => d.docId)).toContain("tneu");
    expect(dokumente.map((d) => d.docId)).not.toContain("talt");
    expect(fileMock).toHaveBeenCalledWith(alt.storagePath);
  });

  it("schreibt nichts nach Storage, wenn die Kennung nicht das Format hat", async () => {
    saveMock.mockClear();
    await expect(fuegeDokumentEin("../konten/x", NEU, new Uint8Array([1]))).rejects.toThrow(MappeNichtGefundenError);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("weist eine falsch geformte Kennung beim Laden ab, ohne Firestore zu fragen", async () => {
    docMock.mockClear();
    await expect(ladeMappe("m1/../x")).rejects.toThrow(MappeNichtGefundenError);
    expect(docMock).not.toHaveBeenCalled();
  });
});
