import { describe, it, expect } from "vitest";
import { raeumeAbgelaufeneAuf, SEITENGROESSE, waehleAbgelaufene, type MappenSeite } from "./raeumeMappenAuf";

const JETZT = 1_800_000_000_000;
const STUNDE = 3_600_000;

/**
 * WOZU: Die Stundenfrist ist die DSGVO-Zusage dieses Features. Welche Mappen
 * fallen, muss ohne Firestore und ohne Warten pruefbar sein.
 */
describe("waehleAbgelaufene", () => {
  it("nimmt genau die Mappen, deren Frist um ist", () => {
    const auswahl = waehleAbgelaufene(
      [
        { mappenId: "frisch", zipGebautAm: JETZT - 60_000, letzteAktivitaetAm: JETZT - 60_000 },
        { mappenId: "alt", zipGebautAm: JETZT - STUNDE - 1000, letzteAktivitaetAm: JETZT - STUNDE - 1000 },
        { mappenId: "liegengelassen", zipGebautAm: null, letzteAktivitaetAm: JETZT - STUNDE - 1000 },
      ],
      JETZT,
    );
    expect(auswahl).toEqual(["alt", "liegengelassen"]);
  });

  it("nimmt nichts, wenn nichts abgelaufen ist", () => {
    expect(waehleAbgelaufene([{ mappenId: "a", zipGebautAm: null, letzteAktivitaetAm: JETZT }], JETZT)).toEqual([]);
  });
});

/**
 * Ein Bestand faelliger Mappen mit Cursor-Blaettern wie in Firestore: die
 * Seite beginnt hinter dem Cursor, unabhaengig davon, was inzwischen geloescht
 * wurde.
 */
function bestand(anzahl: number) {
  const mappen = Array.from({ length: anzahl }, (_, i) => ({
    mappenId: `m${String(i).padStart(5, "0")}`,
    zipGebautAm: null,
    letzteAktivitaetAm: JETZT - STUNDE - 1000 - i,
  }));
  const vorhanden = new Set(mappen.map((m) => m.mappenId));
  let abfragen = 0;
  const ladeSeite = async (weiter: number | null): Promise<MappenSeite<number>> => {
    abfragen++;
    const ab = weiter ?? 0;
    const seite = mappen.slice(ab, ab + SEITENGROESSE).filter((m) => vorhanden.has(m.mappenId));
    return { mappen: seite, weiter: ab + SEITENGROESSE < mappen.length ? ab + SEITENGROESSE : null };
  };
  return { vorhanden, ladeSeite, abfragen: () => abfragen };
}

/**
 * WOZU: endete ein Lauf nach 200 Mappen, koennte jemand, der schneller
 * anlegt, als 200 je Viertelstunde abfliessen, die Loeschung ALLER Mappen -
 * auch der echten Bewerber - hinter die zugesagte Stunde schieben.
 */
describe("raeumeAbgelaufeneAuf", () => {
  it("loescht in einem Lauf alle faelligen Mappen, nicht nur die erste Seite", async () => {
    const { vorhanden, ladeSeite, abfragen } = bestand(SEITENGROESSE * 3 + 17);
    const ergebnis = await raeumeAbgelaufeneAuf(
      ladeSeite,
      async (id) => {
        vorhanden.delete(id);
      },
      JETZT,
      () => false,
    );
    expect(vorhanden.size).toBe(0);
    expect(ergebnis).toMatchObject({ geloescht: SEITENGROESSE * 3 + 17, fehlgeschlagen: 0, restOffen: false });
    expect(abfragen()).toBe(4);
  });

  it("dreht sich nicht um eine Mappe, deren Loeschung scheitert", async () => {
    const { vorhanden, ladeSeite, abfragen } = bestand(SEITENGROESSE + 5);
    const ergebnis = await raeumeAbgelaufeneAuf(
      ladeSeite,
      async (id) => {
        if (id === "m00000") throw new Error("Storage-Race");
        vorhanden.delete(id);
      },
      JETZT,
      () => false,
    );
    expect(ergebnis.fehlgeschlagen).toBe(1);
    expect(ergebnis.geloescht).toBe(SEITENGROESSE + 4);
    expect(abfragen()).toBe(2);
    expect([...vorhanden]).toEqual(["m00000"]);
  });

  it("hoert beim Zeitbudget auf und meldet, dass noch etwas offen ist", async () => {
    const { vorhanden, ladeSeite } = bestand(SEITENGROESSE * 3);
    let seiten = 0;
    const ergebnis = await raeumeAbgelaufeneAuf(
      async (weiter) => {
        seiten++;
        return ladeSeite(weiter);
      },
      async (id) => {
        vorhanden.delete(id);
      },
      JETZT,
      // Die erste Seite darf fertig werden, vor der zweiten ist Schluss.
      () => seiten >= 1 && vorhanden.size <= SEITENGROESSE * 2,
    );
    expect(ergebnis.restOffen).toBe(true);
    expect(ergebnis.geloescht).toBe(SEITENGROESSE);
  });

  it("prueft das Zeitbudget auch innerhalb einer Seite", async () => {
    const { vorhanden, ladeSeite } = bestand(SEITENGROESSE);
    let loeschungen = 0;
    const ergebnis = await raeumeAbgelaufeneAuf(
      ladeSeite,
      async (id) => {
        loeschungen++;
        vorhanden.delete(id);
      },
      JETZT,
      () => loeschungen >= 30,
    );
    expect(ergebnis.restOffen).toBe(true);
    expect(ergebnis.geloescht).toBe(30);
  });

  it("loescht keine Mappe, deren Frist noch laeuft", async () => {
    const geloescht: string[] = [];
    await raeumeAbgelaufeneAuf(
      async () => ({
        mappen: [
          { mappenId: "frisch", zipGebautAm: JETZT - 60_000, letzteAktivitaetAm: JETZT - 60_000 },
          { mappenId: "alt", zipGebautAm: null, letzteAktivitaetAm: JETZT - STUNDE - 1 },
        ],
        weiter: null,
      }),
      async (id) => {
        geloescht.push(id);
      },
      JETZT,
      () => false,
    );
    expect(geloescht).toEqual(["alt"]);
  });
});
