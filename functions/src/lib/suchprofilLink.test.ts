import { readFileSync } from "fs";
import { resolve } from "path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  baueSuchprofilLink,
  dekodiereSuchprofile,
  ENTPACKT_MAX_BYTES,
  kodiereSuchprofile,
  LINK_MAX_ZEICHEN,
  NAME_MAX_ZEICHEN,
  SuchprofilLinkFehler,
  SUCHPROFILE_MAX,
} from "./suchprofilLink";
import { suchprofilSchema, type Suchprofil } from "../konto/kontoTypen";

/**
 * Von `kodiereSuchprofile` erzeugt und eingefroren. DIESELBE Zeichenkette steht
 * in web/src/features/konto/lib/suchprofil-link.test.ts und wird dort vom
 * Browser-Dekodierer gelesen - der letzte Test hier prueft, dass beide gleich
 * sind. Aendert sich das Format, beide zusammen neu erzeugen.
 */
const FIXTURE =
  "v1.PZBBagMxDEWvMmg9OUC966YQCqWEQBdhFvbMt0dU4wmSnUCGXKsX6MWKG8hSQk96XxtFlgIld9rI6jgHJOUYydH-SD2JrzH4OSet5zPInegNMl0RIDT0VDwKp29wsQAFjzM5Wli4eCjbOFNPoeYJJj5PDf9YddIZnHdfsBK9IFNPh9ZpI7vP6OVGw73f6AIt6pN5LciNPcCgF0yMbKWdv9Zs47xqIUfvvz_SVoGzFUayK9K_sD6oNUa-MbRxCzelEmCrTDUnci89PSsrPkAE5OiV7kNP2S8Pgf2x82Ld8wUdL12L0TLkKjLc_wA";

const FIXTURE_FILTER: Suchprofil[] = [
  {
    suchbegriff: "IT",
    bundesland: ["Nordrhein-Westfalen", "Rheinland-Pfalz"],
    laufbahngruppe: ["Feldwebel"],
    taetigkeitsbereich: "militaerisch",
  },
  {
    vertragsarten: ["Reservedienst"],
    wunschort: "Köln",
    einstiegswege: ["reserveoffizier"],
    mindestbesoldung: 9,
    besoldungstabelle: "A",
  },
];
const FIXTURE_NAMEN = ["IT als Feldwebel im Westen", null];

/** Fragment aus beliebiger Nutzlast - fuer Faelle, die der Kodierer nie baut. */
function roh(nutzlast: unknown, version = "v1"): string {
  return `${version}.${deflateRawSync(Buffer.from(JSON.stringify(nutzlast))).toString("base64url")}`;
}

function fehlerVon(aufruf: () => unknown): SuchprofilLinkFehler {
  try {
    aufruf();
  } catch (fehler) {
    expect(fehler).toBeInstanceOf(SuchprofilLinkFehler);
    return fehler as SuchprofilLinkFehler;
  }
  throw new Error("kein Fehler geworfen");
}

describe("kodiereSuchprofile / dekodiereSuchprofile", () => {
  it("Rundreise: was kodiert wird, kommt gleich wieder heraus", () => {
    const fragment = kodiereSuchprofile(FIXTURE_FILTER, FIXTURE_NAMEN);
    expect(fragment).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(dekodiereSuchprofile(fragment)).toEqual({ ok: true, filter: FIXTURE_FILTER, namen: FIXTURE_NAMEN });
  });

  it("liest das eingefrorene Fixture", () => {
    expect(dekodiereSuchprofile(FIXTURE)).toEqual({ ok: true, filter: FIXTURE_FILTER, namen: FIXTURE_NAMEN });
  });

  it("baut die volle URL mit den Filtern im Fragment, nicht in der Query", () => {
    const link = baueSuchprofilLink([{ bundesland: ["Bayern"] }]);
    expect(link).toMatch(/^https:\/\/better-bewerbungsportal\.de\/suchprofil\/uebernehmen#v1\./);
    expect(link).not.toContain("?");
  });

  it("wirft leere Listen und Texte weg und trimmt", () => {
    const fragment = kodiereSuchprofile([{ bundesland: [], suchbegriff: "  IT ", wunschort: "" }], ["  "]);
    expect(dekodiereSuchprofile(fragment)).toEqual({ ok: true, filter: [{ suchbegriff: "IT" }], namen: [null] });
  });

  it("nimmt das Fragment auch mit fuehrendem #", () => {
    expect(dekodiereSuchprofile(`#${FIXTURE}`).ok).toBe(true);
  });
});

describe("kodiereSuchprofile — gibt keinen Link heraus, den die Uebernahme ablehnen wuerde", () => {
  it("lehnt mehr als SUCHPROFILE_MAX Filter ab", () => {
    const filter = Array.from({ length: SUCHPROFILE_MAX + 1 }, () => ({ bundesland: ["Bayern"] as ["Bayern"] }));
    expect(fehlerVon(() => kodiereSuchprofile(filter)).code).toBe("zu-viele");
  });

  it("lehnt einen Filter ab, der nichts einschraenkt", () => {
    const f = fehlerVon(() => kodiereSuchprofile([{ bundesland: ["Bayern"] }, { taetigkeitsbereich: "beide" }]));
    expect(f.code).toBe("ungueltig");
    expect(f.filterNummer).toBe(2);
  });

  it("lehnt einen Link ueber LINK_MAX_ZEICHEN ab", () => {
    // Zufaellige Drei-Byte-Zeichen lassen sich nicht komprimieren.
    const zufall = () =>
      Array.from({ length: 100 }, () => String.fromCharCode(0x4e00 + Math.floor(Math.random() * 20000))).join("");
    const filter = Array.from({ length: SUCHPROFILE_MAX }, () => ({ suchbegriff: zufall(), wunschort: zufall() }));
    expect(fehlerVon(() => kodiereSuchprofile(filter)).code).toBe("zu-lang");
  });

  it("lehnt einen zu langen Namen ab", () => {
    const f = fehlerVon(() => kodiereSuchprofile([{ bundesland: ["Bayern"] }], ["x".repeat(NAME_MAX_ZEICHEN + 1)]));
    expect(f.code).toBe("ungueltig");
  });
});

describe("dekodiereSuchprofile — Ablehnungen", () => {
  it("leer", () => {
    expect(dekodiereSuchprofile("")).toMatchObject({ ok: false, code: "leer" });
    expect(dekodiereSuchprofile(roh({ filter: [] }))).toMatchObject({ ok: false, code: "leer" });
  });

  it("abgeschnitten oder beschaedigt", () => {
    expect(dekodiereSuchprofile(FIXTURE.slice(0, -5))).toMatchObject({ ok: false, code: "kaputt" });
    expect(dekodiereSuchprofile("v1.!!!")).toMatchObject({ ok: false, code: "kaputt" });
    expect(dekodiereSuchprofile("irgendwas")).toMatchObject({ ok: false, code: "kaputt" });
    expect(dekodiereSuchprofile(roh(["kein", "objekt"]))).toMatchObject({ ok: false, code: "kaputt" });
    expect(dekodiereSuchprofile(roh({ filter: [{ bundesland: ["Bayern"] }], extra: 1 }))).toMatchObject({
      ok: false,
      code: "kaputt",
    });
  });

  it("unbekannte Version", () => {
    expect(dekodiereSuchprofile(roh({ filter: [{ bundesland: ["Bayern"] }] }, "v2"))).toMatchObject({
      ok: false,
      code: "version",
    });
  });

  it("zu lang", () => {
    expect(dekodiereSuchprofile(`v1.${"A".repeat(LINK_MAX_ZEICHEN)}`)).toMatchObject({ ok: false, code: "zu-lang" });
  });

  it("Kompressionsbombe", () => {
    const fragment = roh({ filter: [{ suchbegriff: "x".repeat(ENTPACKT_MAX_BYTES * 3) }] });
    expect(fragment.length).toBeLessThan(LINK_MAX_ZEICHEN);
    expect(dekodiereSuchprofile(fragment)).toMatchObject({ ok: false, code: "kaputt" });
  });

  it("zu viele Filter", () => {
    const filter = Array.from({ length: SUCHPROFILE_MAX + 1 }, () => ({ bundesland: ["Bayern"] }));
    expect(dekodiereSuchprofile(roh({ filter }))).toMatchObject({ ok: false, code: "zu-viele" });
  });

  it("ungueltiger Filter nennt Nummer und Feld, nie den Wert", () => {
    const ergebnis = dekodiereSuchprofile(roh({ filter: [{ bundesland: ["Bayern"] }, { bundesland: ["Atlantis"] }] }));
    expect(ergebnis).toMatchObject({ ok: false, code: "ungueltig", filterNummer: 2 });
    expect(ergebnis.ok ? "" : ergebnis.grund).toContain("bundesland");
    expect(ergebnis.ok ? "" : ergebnis.grund).not.toContain("Atlantis");
  });

  it("lehnt das Alter ab - es ist eine Bewerberangabe, kein Suchfilter", () => {
    expect(dekodiereSuchprofile(roh({ filter: [{ bundesland: ["Bayern"], alter: 35 }] }))).toMatchObject({
      ok: false,
      code: "ungueltig",
    });
  });
});

describe("Spiegel in der Weboberflaeche (web/src/features/konto/lib/suchprofil-link.ts)", () => {
  const webLib = readFileSync(resolve(__dirname, "../../../web/src/features/konto/lib/suchprofil-link.ts"), "utf8");
  const webTest = readFileSync(
    resolve(__dirname, "../../../web/src/features/konto/lib/suchprofil-link.test.ts"),
    "utf8",
  );
  const webTypen = readFileSync(resolve(__dirname, "../../../web/src/features/konto/api/types.ts"), "utf8");
  const webSchema = readFileSync(resolve(__dirname, "../../../web/src/features/konto/api/schema.ts"), "utf8");

  /** Zahl oder Produkt von Zahlen ("64 * 1024") - mehr steht dort nicht. */
  function zahl(quelle: string, name: string): number {
    const treffer = new RegExp(`export const ${name} = ([\\d\\s*]+);`).exec(quelle);
    expect(treffer, name).not.toBeNull();
    return treffer![1].split("*").map(Number).reduce((a, b) => a * b, 1);
  }

  it("fuehrt dieselben Grenzen", () => {
    expect(zahl(webTypen, "SUCHPROFILE_MAX")).toBe(SUCHPROFILE_MAX);
    expect(zahl(webLib, "LINK_MAX_ZEICHEN")).toBe(LINK_MAX_ZEICHEN);
    expect(zahl(webLib, "NAME_MAX_ZEICHEN")).toBe(NAME_MAX_ZEICHEN);
    expect(zahl(webLib, "ENTPACKT_MAX_BYTES")).toBe(ENTPACKT_MAX_BYTES);
  });

  it("dekodiert im Browser dasselbe Fixture", () => {
    expect(webTest).toContain(`'${FIXTURE}'`);
  });

  it("prueft im Browser dieselben Felder wie suchprofilSchema", () => {
    const anfang = webSchema.indexOf("export const suchprofilFilterSchema = z.strictObject({");
    expect(anfang).toBeGreaterThanOrEqual(0);
    const block = webSchema.slice(anfang, webSchema.indexOf("});", anfang));
    const felder = [...block.matchAll(/^\s+(\w+):/gm)].map(([, feld]) => feld).sort();
    expect(felder).toEqual(Object.keys(suchprofilSchema.shape).sort());
  });
});
