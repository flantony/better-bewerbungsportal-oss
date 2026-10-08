import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  aendereSuchprofil,
  aktiveSuchfilter,
  entferneSuchprofil,
  filterKennung,
  fuegeSuchprofileHinzu,
  hatAktivenSuchfilter,
  neueSuchprofilId,
} from "./suchprofile";
import { SUCHPROFILE_MAX, type SuchprofilEintrag } from "./kontoTypen";

const T = Timestamp.fromMillis(1000);

function eintrag(id: string, over: Partial<SuchprofilEintrag> = {}): SuchprofilEintrag {
  return { id, filter: { suchbegriff: id }, aktiv: true, quelle: "hand", erstelltAm: T, ...over };
}

function zaehler() {
  let n = 0;
  return () => `id${++n}`;
}

describe("neueSuchprofilId", () => {
  it("ist URL-sicher und jedes Mal eine andere", () => {
    const a = neueSuchprofilId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(neueSuchprofilId()).not.toBe(a);
  });
});

/**
 * WOZU: Formular und KI schreiben denselben Filter unterschiedlich auf
 * (Reihenfolge, "beide" als Vorgabe, Leerzeichen). Die Dublettenpruefung
 * soll das als denselben Filter erkennen - sonst sammelt ein wiederholter
 * Import dieselben Filter bis zur Obergrenze an.
 */
describe("filterKennung", () => {
  it("ist unabhaengig von Schluessel- und Listenreihenfolge, neutralen Werten und Leerzeichen", () => {
    expect(
      filterKennung({ bundesland: ["Bayern", "Berlin"], taetigkeitsbereich: "beide", wunschort: " Köln ", vertragsarten: [] }),
    ).toBe(filterKennung({ wunschort: "Köln", bundesland: ["Berlin", "Bayern"] }));
  });

  it("unterscheidet tatsaechlich verschiedene Filter", () => {
    expect(filterKennung({ bundesland: ["Bayern"] })).not.toBe(filterKennung({ bundesland: ["Berlin"] }));
    expect(filterKennung({ taetigkeitsbereich: "zivil" })).not.toBe(filterKennung({}));
    expect(filterKennung({ mindestbesoldung: 9, besoldungstabelle: "A" })).not.toBe(
      filterKennung({ mindestbesoldung: 9, besoldungstabelle: "E" }),
    );
  });
});

describe("fuegeSuchprofileHinzu", () => {
  it("haengt neue Filter mit Server-Kennung, aktiv und erstelltAm an", () => {
    const r = fuegeSuchprofileHinzu(
      [eintrag("a")],
      [{ filter: { wunschort: "Köln" }, name: "Köln", quelle: "ki" }],
      T,
      zaehler(),
    );
    expect(r).toEqual({
      ok: true,
      hinzugefuegt: ["id1"],
      uebersprungen: 0,
      liste: [eintrag("a"), { id: "id1", name: "Köln", filter: { wunschort: "Köln" }, aktiv: true, quelle: "ki", erstelltAm: T }],
    });
  });

  it("ueberspringt Dubletten - gegen den Bestand und innerhalb desselben Aufrufs - und zaehlt sie", () => {
    const r = fuegeSuchprofileHinzu(
      [eintrag("a", { filter: { bundesland: ["Bayern"] } })],
      [
        { filter: { bundesland: ["Bayern"], taetigkeitsbereich: "beide" }, quelle: "ki" },
        { filter: { suchbegriff: "IT" }, quelle: "ki" },
        { filter: { suchbegriff: "IT" }, quelle: "hand" },
      ],
      T,
      zaehler(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hinzugefuegt).toEqual(["id1"]);
    expect(r.uebersprungen).toBe(2);
    expect(r.liste).toHaveLength(2);
  });

  it("nimmt bis zu SUCHPROFILE_MAX Filter, beim elften wird nichts angehaengt", () => {
    const neun = Array.from({ length: SUCHPROFILE_MAX - 1 }, (_, i) => eintrag(`e${i}`));
    const zehnter = fuegeSuchprofileHinzu(neun, [{ filter: { suchbegriff: "neu" }, quelle: "hand" }], T, zaehler());
    expect(zehnter.ok).toBe(true);
    if (!zehnter.ok) return;
    expect(zehnter.liste).toHaveLength(SUCHPROFILE_MAX);

    const elfter = fuegeSuchprofileHinzu(zehnter.liste, [{ filter: { suchbegriff: "noch einer" }, quelle: "hand" }], T);
    expect(elfter).toEqual({ ok: false, frei: 0 });
  });

  it("lehnt einen Import, der nicht mehr ganz passt, komplett ab und nennt die freien Plaetze", () => {
    const acht = Array.from({ length: 8 }, (_, i) => eintrag(`e${i}`));
    const neue = ["x", "y", "z"].map((w) => ({ filter: { suchbegriff: w }, quelle: "ki" as const }));
    expect(fuegeSuchprofileHinzu(acht, neue, T)).toEqual({ ok: false, frei: 2 });
  });

  it("zaehlt uebersprungene Dubletten nicht gegen die Obergrenze", () => {
    const zehn = Array.from({ length: SUCHPROFILE_MAX }, (_, i) => eintrag(`e${i}`));
    const r = fuegeSuchprofileHinzu(zehn, [{ filter: { suchbegriff: "e3" }, quelle: "ki" }], T);
    expect(r).toMatchObject({ ok: true, hinzugefuegt: [], uebersprungen: 1 });
  });

  it("erzeugt eine neue Kennung, wenn die gezogene schon vergeben ist", () => {
    const ids = ["a", "a", "b"];
    const r = fuegeSuchprofileHinzu([eintrag("a")], [{ filter: { wunschort: "Ulm" }, quelle: "hand" }], T, () => ids.shift()!);
    expect(r.ok && r.hinzugefuegt).toEqual(["b"]);
  });
});

describe("aendereSuchprofil", () => {
  const liste = [eintrag("a", { name: "Alt" }), eintrag("b")];

  it("aendert Filter, Name und aktiv nur des Eintrags mit dieser Kennung", () => {
    const r = aendereSuchprofil(liste, "a", { filter: { wunschort: "Ulm" }, name: "Neu", aktiv: false });
    expect(r).toEqual({
      ok: true,
      liste: [{ ...eintrag("a"), name: "Neu", filter: { wunschort: "Ulm" }, aktiv: false }, eintrag("b")],
    });
  });

  it("laesst nicht genannte Felder unveraendert und entfernt den Namen bei leerem Namen", () => {
    const pausiert = aendereSuchprofil(liste, "a", { aktiv: false });
    expect(pausiert.ok && pausiert.liste[0]).toEqual({ ...eintrag("a", { name: "Alt" }), aktiv: false });

    const ohneName = aendereSuchprofil(liste, "a", { name: "" });
    expect(ohneName.ok && ohneName.liste[0]).toEqual(eintrag("a"));
    expect(ohneName.ok && "name" in ohneName.liste[0]).toBe(false);
  });

  it("meldet eine unbekannte Kennung", () => {
    expect(aendereSuchprofil(liste, "zzz", { aktiv: false })).toEqual({ ok: false, grund: "unbekannt" });
  });

  it("lehnt eine Aenderung ab, die den Filter zur Dublette eines anderen machen wuerde", () => {
    expect(aendereSuchprofil(liste, "a", { filter: { suchbegriff: "b" } })).toEqual({ ok: false, grund: "doppelt" });
    // Derselbe Filter auf sich selbst ist keine Dublette.
    expect(aendereSuchprofil(liste, "a", { filter: { suchbegriff: "a" } }).ok).toBe(true);
  });
});

describe("entferneSuchprofil", () => {
  it("entfernt genau den Eintrag mit dieser Kennung; eine unbekannte aendert nichts", () => {
    const liste = [eintrag("a"), eintrag("b")];
    expect(entferneSuchprofil(liste, "a")).toEqual([eintrag("b")]);
    expect(entferneSuchprofil(liste, "zzz")).toEqual(liste);
  });
});

describe("aktiveSuchfilter / hatAktivenSuchfilter", () => {
  it("laesst pausierte und nicht einschraenkende Filter weg", () => {
    const liste = [
      eintrag("a", { filter: { bundesland: ["Bayern"] } }),
      eintrag("b", { filter: { suchbegriff: "IT" }, aktiv: false }),
      eintrag("c", { filter: { taetigkeitsbereich: "beide" } }),
    ];
    expect(aktiveSuchfilter(liste)).toEqual([{ bundesland: ["Bayern"] }]);
    expect(hatAktivenSuchfilter(liste)).toBe(true);
  });

  it("ist false, wenn alle Filter pausiert sind oder keiner da ist", () => {
    expect(hatAktivenSuchfilter([eintrag("a", { aktiv: false })])).toBe(false);
    expect(hatAktivenSuchfilter([])).toBe(false);
  });
});
