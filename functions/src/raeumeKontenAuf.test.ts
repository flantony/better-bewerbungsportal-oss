import { describe, expect, it } from "vitest";
import {
  waehleInaktive,
  verwaisteKonten,
  waehleVorzuwarnende,
  formatiereDeutschesDatum,
  tageDazwischenBerlin,
  uidAusPraefix,
  uidAusPrivatPfad,
  INAKTIV_TAGE,
  VORWARNUNG_TAGE_MIN,
  VORWARNUNG_TAGE_MAX,
} from "./raeumeKontenAuf";

const JETZT = Date.parse("2027-09-25T00:00:00Z");
const TAG = 86_400_000;
const vor = (tage: number) => new Date(JETZT - tage * TAG).toUTCString();

/**
 * WOZU: Die 365-Tage-Frist steht in DSFA.md. Massgeblich ist die letzte
 * Nutzung - ein Token-Refresh zaehlt als Nutzung, sonst loeschen wir
 * jemanden, der die Seite taeglich offen hat, sich aber nie neu anmeldet.
 */
describe("waehleInaktive", () => {
  it("waehlt, wer laenger als die Frist nichts getan hat", () => {
    const uids = waehleInaktive(
      [{ uid: "alt", creationTime: vor(900), lastSignInTime: vor(INAKTIV_TAGE + 1), lastRefreshTime: vor(INAKTIV_TAGE + 1) }],
      JETZT,
    );
    expect(uids).toEqual(["alt"]);
  });

  it("verschont, wer zuletzt per Token-Refresh aktiv war", () => {
    const uids = waehleInaktive(
      [{ uid: "aktiv", creationTime: vor(900), lastSignInTime: vor(800), lastRefreshTime: vor(3) }],
      JETZT,
    );
    expect(uids).toEqual([]);
  });

  it("nimmt das Erstellungsdatum, wenn es nie eine Anmeldung gab", () => {
    const uids = waehleInaktive([{ uid: "nie", creationTime: vor(INAKTIV_TAGE + 5) }], JETZT);
    expect(uids).toEqual(["nie"]);
  });

  it("verschont genau an der Grenze", () => {
    const uids = waehleInaktive([{ uid: "grenze", creationTime: vor(INAKTIV_TAGE) }], JETZT);
    expect(uids).toEqual([]);
  });

  /**
   * WOZU: Date.parse einer nicht auswertbaren, aber nicht-leeren Zeichenkette
   * liefert NaN. Math.max(...) mit einem NaN-Wert ergibt NaN, und jeder
   * Vergleich mit NaN (auch `<`) ist false - also wird NICHT geloescht. Ohne
   * diese Absicherung (z.B. durch einen fehlerhaften Spread der
   * UserMetadata-Klasse, der leere Felder liefert) waere das Gegenteil der
   * Fall, unbemerkt: "nie aktiv" loescht jedes Konto.
   */
  it("loescht niemanden mit unlesbaren Zeitangaben", () => {
    const uids = waehleInaktive(
      [{ uid: "kaputt", creationTime: "kein-datum", lastSignInTime: "auch-kein-datum", lastRefreshTime: undefined }],
      JETZT,
    );
    expect(uids).toEqual([]);
  });

  /**
   * WOZU: `Math.max()` ohne Argumente ist `-Infinity`, das ist IMMER kleiner
   * als jede Grenze. Ohne die explizite Laengenpruefung waere ein Datensatz
   * ganz ohne auswertbare Zeit (leerer String, keine Anmeldung, kein Refresh)
   * ausgerechnet der Fall, der zuerst geloescht wuerde - das Gegenteil von
   * "im Zweifel verschonen".
   */
  it("loescht niemanden ganz ohne auswertbare Zeitangabe", () => {
    const uids = waehleInaktive([{ uid: "ohne-zeit", creationTime: "" }], JETZT);
    expect(uids).toEqual([]);
  });
});

/**
 * WOZU: Ein Kontodokument ohne zugehoeriges Auth-Konto ist verwaist - z.B.
 * weil die Konto-Loeschung nach dem Firestore-`recursiveDelete` beim
 * Auth-Teil fehlgeschlagen ist (s. kontoStore.loescheKonto), oder weil ein
 * Konto ueber die Firebase-Konsole geloescht wurde, ohne unseren
 * Loeschpfad zu durchlaufen.
 */
describe("verwaisteKonten", () => {
  it("meldet Dokumente ohne zugehoeriges Auth-Konto", () => {
    expect(verwaisteKonten(["a", "b", "c"], new Set(["a", "c"]))).toEqual(["b"]);
  });

  it("meldet nichts, wenn zu jedem Dokument ein Auth-Konto existiert", () => {
    expect(verwaisteKonten(["a", "b"], new Set(["a", "b"]))).toEqual([]);
  });

  it("meldet nichts bei einer leeren Dokumentliste", () => {
    expect(verwaisteKonten([], new Set())).toEqual([]);
  });
});

/**
 * WOZU: 30 Tage vor der Loeschung (Tag 365) soll GENAU EIN woechentlicher Lauf
 * (alle 7 Tage) jeden Nutzer treffen - das Fenster ist deshalb selbst 7
 * KALENDERTAGE breit (Kalendertage in Europe/Berlin,
 * nicht Millisekunden - s. tageDazwischenBerlin): [335, 341], beide Enden
 * inklusiv.
 */
describe("waehleVorzuwarnende", () => {
  it("waehlt niemanden vor der unteren Grenze (334 Tage)", () => {
    const gewaehlt = waehleVorzuwarnende([{ uid: "zu-frisch", creationTime: vor(900), lastSignInTime: vor(334) }], JETZT);
    expect(gewaehlt.map((g) => g.uid)).toEqual([]);
  });

  it("waehlt genau an der unteren Grenze (335 Tage, inklusiv)", () => {
    const gewaehlt = waehleVorzuwarnende(
      [{ uid: "untere-grenze", creationTime: vor(900), lastSignInTime: vor(VORWARNUNG_TAGE_MIN) }],
      JETZT,
    );
    expect(gewaehlt.map((g) => g.uid)).toEqual(["untere-grenze"]);
  });

  it("waehlt in der Mitte des Fensters (338 Tage)", () => {
    const gewaehlt = waehleVorzuwarnende([{ uid: "mitte", creationTime: vor(900), lastSignInTime: vor(338) }], JETZT);
    expect(gewaehlt.map((g) => g.uid)).toEqual(["mitte"]);
  });

  it("waehlt genau an der oberen Grenze (341 Tage, inklusiv)", () => {
    const obereGrenze = waehleVorzuwarnende(
      [{ uid: "obere-grenze", creationTime: vor(900), lastSignInTime: vor(VORWARNUNG_TAGE_MAX) }],
      JETZT,
    );
    expect(obereGrenze.map((g) => g.uid)).toEqual(["obere-grenze"]);
  });

  it("waehlt niemanden knapp ueber der oberen Grenze (342 Tage)", () => {
    const knappDrueber = waehleVorzuwarnende(
      [{ uid: "knapp-drueber", creationTime: vor(900), lastSignInTime: vor(VORWARNUNG_TAGE_MAX + 1) }],
      JETZT,
    );
    expect(knappDrueber.map((g) => g.uid)).toEqual([]);
  });

  it("waehlt niemanden, der laengst ueber der Inaktivitaetsfrist ist (die Loeschung uebernimmt waehleInaktive)", () => {
    const gewaehlt = waehleVorzuwarnende(
      [{ uid: "laengst-inaktiv", creationTime: vor(900), lastSignInTime: vor(INAKTIV_TAGE + 10) }],
      JETZT,
    );
    expect(gewaehlt.map((g) => g.uid)).toEqual([]);
  });

  it("liefert die letzte Aktivitaet in Millisekunden mit, fuer die Loeschdatums-Berechnung", () => {
    const letzteAktivitaet = vor(VORWARNUNG_TAGE_MIN);
    const gewaehlt = waehleVorzuwarnende([{ uid: "mit-zeit", creationTime: vor(900), lastSignInTime: letzteAktivitaet }], JETZT);
    expect(gewaehlt).toEqual([{ uid: "mit-zeit", letzteAktivitaetMs: Date.parse(letzteAktivitaet) }]);
  });

  it("nimmt das Erstellungsdatum, wenn es nie eine Anmeldung gab", () => {
    const gewaehlt = waehleVorzuwarnende([{ uid: "nie-angemeldet", creationTime: vor(338) }], JETZT);
    expect(gewaehlt.map((g) => g.uid)).toEqual(["nie-angemeldet"]);
  });

  it("waehlt niemanden mit unlesbaren Zeitangaben", () => {
    const gewaehlt = waehleVorzuwarnende(
      [{ uid: "kaputt", creationTime: "kein-datum", lastSignInTime: "auch-kein-datum", lastRefreshTime: undefined }],
      JETZT,
    );
    expect(gewaehlt).toEqual([]);
  });

  it("waehlt niemanden ganz ohne auswertbare Zeitangabe", () => {
    expect(waehleVorzuwarnende([{ uid: "ohne-zeit", creationTime: "" }], JETZT)).toEqual([]);
  });
});

/**
 * WOZU: `JETZT` (2027-09-25) liegt so, dass die
 * 335-341-Tage-Grenze zufaellig genau auf die Woche der Sommer-/
 * Winterzeitumstellung 2026 faellt (335 Tage zurueck = 25.10.2026, der
 * damalige Umstellungssonntag). Eine ms-basierte Rechnung waere hier anfaellig
 * fuer eine um eine Stunde verschobene Grenze - die Kalendertag-Rechnung
 * (Europe/Berlin) bleibt exakt, unabhaengig von der Umstellung.
 */
describe("waehleVorzuwarnende - Kalendertage ueber eine DST-Umstellungswoche hinweg", () => {
  it("waehlt bei genau 335 Kalendertagen, obwohl dieser Tag der Umstellungstag (Winterzeit) ist", () => {
    const gewaehlt = waehleVorzuwarnende(
      [{ uid: "dst-untere-grenze", creationTime: vor(900), lastSignInTime: "2026-10-25T10:00:00Z" }],
      JETZT,
    );
    expect(gewaehlt.map((g) => g.uid)).toEqual(["dst-untere-grenze"]);
  });

  it("waehlt NICHT bei 334 Kalendertagen (einen Tag nach der Umstellung)", () => {
    const gewaehlt = waehleVorzuwarnende(
      [{ uid: "dst-zu-frisch", creationTime: vor(900), lastSignInTime: "2026-10-26T10:00:00Z" }],
      JETZT,
    );
    expect(gewaehlt.map((g) => g.uid)).toEqual([]);
  });

  it("waehlt bei genau 341 Kalendertagen (obere Grenze)", () => {
    const gewaehlt = waehleVorzuwarnende(
      [{ uid: "dst-obere-grenze", creationTime: vor(900), lastSignInTime: "2026-10-19T10:00:00Z" }],
      JETZT,
    );
    expect(gewaehlt.map((g) => g.uid)).toEqual(["dst-obere-grenze"]);
  });

  it("waehlt NICHT bei 342 Kalendertagen", () => {
    const gewaehlt = waehleVorzuwarnende(
      [{ uid: "dst-zu-alt", creationTime: vor(900), lastSignInTime: "2026-10-18T10:00:00Z" }],
      JETZT,
    );
    expect(gewaehlt.map((g) => g.uid)).toEqual([]);
  });
});

describe("tageDazwischenBerlin", () => {
  it("zaehlt 0 fuer denselben Zeitpunkt", () => {
    expect(tageDazwischenBerlin(JETZT, JETZT)).toBe(0);
  });

  it("zaehlt negative Werte, wenn `spaeter` vor `frueher` liegt", () => {
    expect(tageDazwischenBerlin(JETZT, JETZT - 3 * TAG)).toBe(-3);
  });

  /**
   * "10:00 Uhr Berliner Ortszeit" liegt am 21.03. noch in der Winterzeit
   * (CET, UTC+1 -> 09:00 UTC), am 28.03. (Umstellungssonntag) bereits in der
   * Sommerzeit (CEST, UTC+2 -> 08:00 UTC). Kalendarisch liegen exakt 7 Tage
   * dazwischen - real vergehen aber nur 6 Tage 23 Stunden, weil dieser Tag in
   * Berlin nur 23 Stunden hat.
   */
  it("zaehlt 7 Kalendertage ueber die Sommerzeitumstellung (letzter Sonntag im Maerz), obwohl real nur 6d23h vergehen", () => {
    const frueher = Date.parse("2027-03-21T09:00:00Z"); // 10:00 Berlin (CET)
    const spaeter = Date.parse("2027-03-28T08:00:00Z"); // 10:00 Berlin (CEST)
    expect(tageDazwischenBerlin(frueher, spaeter)).toBe(7);
    expect(spaeter - frueher).not.toBe(7 * TAG); // genau die Differenz, an der eine ms-Rechnung scheitert
  });

  /**
   * Umgekehrt am letzten Sonntag im Oktober: der Tag hat 25 Stunden, real
   * vergehen 7 Tage 1 Stunde - kalendarisch bleiben es trotzdem 7 Tage.
   */
  it("zaehlt 7 Kalendertage ueber die Winterzeitumstellung (letzter Sonntag im Oktober), obwohl real 7d1h vergehen", () => {
    const frueher = Date.parse("2027-10-24T08:00:00Z"); // 10:00 Berlin (CEST)
    const spaeter = Date.parse("2027-10-31T09:00:00Z"); // 10:00 Berlin (CET)
    expect(tageDazwischenBerlin(frueher, spaeter)).toBe(7);
    expect(spaeter - frueher).not.toBe(7 * TAG);
  });
});

/**
 * WOZU: `getFiles({ prefix: "konten/", delimiter: "/" })` liefert
 * in `apiResponse.prefixes` Werte wie "konten/abc/" - `uidAusPraefix` zieht
 * daraus die reine uid, ohne selbst Storage anzufassen. Ein unerwartetes
 * Format liefert `null` statt eine falsche uid zu raten - im Zweifel nicht
 * loeschen.
 */
describe("uidAusPraefix", () => {
  it("zieht die uid aus einem regulaeren Praefix", () => {
    expect(uidAusPraefix("konten/abc/")).toBe("abc");
  });

  it("liefert null ohne abschliessenden Schraegstrich", () => {
    expect(uidAusPraefix("konten/abc")).toBeNull();
  });

  it("liefert null bei einem verschachtelten Pfad (mehr als ein Segment)", () => {
    expect(uidAusPraefix("konten/abc/dokumente/")).toBeNull();
  });

  it("liefert null bei einem Praefix ausserhalb von konten/", () => {
    expect(uidAusPraefix("bewerbungsmappen/abc/")).toBeNull();
  });

  it("liefert null fuer den leeren String", () => {
    expect(uidAusPraefix("")).toBeNull();
  });
});

/**
 * WOZU: ein Dokument unter `konten/{uid}/privat/*`
 * kann existieren, OHNE dass das Elterndokument `konten/{uid}` selbst
 * existiert - die Iteration ueber die `konten`-Collection allein saehe ein
 * solches Konto nie, egal ob dazu ein Auth-Nutzer existiert oder nicht.
 */
describe("uidAusPrivatPfad", () => {
  it("zieht die uid aus einem privat/angaben-Pfad", () => {
    expect(uidAusPrivatPfad("konten/abc/privat/angaben")).toBe("abc");
  });

  it("zieht die uid aus einem privat/dokumente-Pfad", () => {
    expect(uidAusPrivatPfad("konten/abc/privat/dokumente")).toBe("abc");
  });

  it("liefert null fuer das Elterndokument selbst (kein privat/*-Pfad)", () => {
    expect(uidAusPrivatPfad("konten/abc")).toBeNull();
  });

  it("liefert null bei einem zu tief verschachtelten Pfad", () => {
    expect(uidAusPrivatPfad("konten/abc/privat/dokumente/irgendwas")).toBeNull();
  });

  it("liefert null bei einem Pfad ausserhalb von konten/", () => {
    expect(uidAusPrivatPfad("irgendwas/abc/privat/angaben")).toBeNull();
  });
});

describe("formatiereDeutschesDatum", () => {
  it("formatiert als TT.MM.JJJJ in der Zeitzone Europe/Berlin", () => {
    // 12:00 UTC liegt unabhaengig von Sommer-/Winterzeit sicher am selben
    // Kalendertag in Europe/Berlin - kein Flackern an der Zeitzonengrenze.
    expect(formatiereDeutschesDatum(Date.parse("2027-09-25T12:00:00Z"))).toBe("25.09.2027");
  });

  it("formatiert einen anderen Monat/Jahr korrekt", () => {
    expect(formatiereDeutschesDatum(Date.parse("2028-01-03T12:00:00Z"))).toBe("03.01.2028");
  });
});
