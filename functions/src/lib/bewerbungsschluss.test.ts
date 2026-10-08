import { describe, it, expect } from "vitest";
import {
  bewerbungJederzeitFuerJob,
  bewerbungJederzeitLautText,
  bewerbungsschlussText,
  bewerbungsschlussZeile,
} from "./bewerbungsschluss";

/**
 * WOZU: Viele Stellen tragen kein `applicationEnd`, und die meisten davon
 * sagen im Text "Bewerbung und Einstellung jederzeit moeglich". Ein
 * leerer Wert ohne diese Deutung liest sich wie "Frist unbekannt" - oder
 * schlimmer, wie "abgelaufen".
 */
describe("bewerbungJederzeitLautText", () => {
  it("erkennt den Standardsatz der Bundeswehr-Ausschreibungen", () => {
    expect(
      bewerbungJederzeitLautText(["<p>Dienststelle: Kommando Cyber</p><p>Bewerbung und Einstellung jederzeit möglich</p>"]),
    ).toBe(true);
  });

  it("erkennt auch die umgekehrte Wortstellung", () => {
    expect(bewerbungJederzeitLautText(["Sie können sich laufend bewerben."])).toBe(true);
  });

  it("nimmt 'jederzeit' ohne Bezug auf die Bewerbung nicht als Aussage", () => {
    expect(bewerbungJederzeitLautText(["Sie sind jederzeit einsatzbereit. Ihre Bewerbung richten Sie an ..."])).toBe(false);
  });

  // "Die Einstellung erfolgt ganzjaehrig" sagt etwas ueber den Dienstantritt,
  // nicht ueber eine Bewerbungsfrist - als "jederzeit bewerben" gelesen waere es
  // eine Behauptung, die im Text nicht steht.
  it("liest 'Einstellung ganzjaehrig' nicht als Aussage zur Bewerbungsfrist", () => {
    expect(bewerbungJederzeitLautText(["Hinweis: Die Einstellung erfolgt ganzjährig und bedarfsorientiert"])).toBe(false);
  });

  it("nimmt 'laufende' nicht als 'laufend'", () => {
    expect(bewerbungJederzeitLautText(["Ihre Bewerbung für das laufende Verfahren"])).toBe(false);
  });
});

/**
 * WOZU: Ein falscher Treffer laesst uns "kein Bewerbungsschluss" behaupten -
 * der Bewerber verpasst dann eine echte Frist. Diese Saetze stehen so oder
 * aehnlich in Ausschreibungen und duerfen NICHT treffen.
 */
describe("bewerbungJederzeitLautText — Saetze, die nichts ueber eine Frist sagen", () => {
  it.each([
    ["Kontaktsatz", "Für Fragen zu Ihrer Bewerbung steht Ihnen Frau Müller jederzeit gern zur Verfügung."],
    ["Zurueckziehen", "Sie können Ihre Bewerbung jederzeit zurückziehen."],
    ["Verneinung", "Eine Bewerbung ist nicht jederzeit möglich."],
    ["Willkommen", "Bewerbungen von Frauen sind jederzeit willkommen."],
    ["Freude", "Wir freuen uns jederzeit über Bewerbungen."],
    ["Listenpunkte", "<ul><li>Bewerbung per Post</li><li>Rückfragen jederzeit</li></ul>"],
    ["Zeilenumbruch", "Ihre Bewerbung senden Sie an das Karrierecenter<br>Erreichbar jederzeit"],
    ["Absatz", "<p>Bewerbung bitte schriftlich</p><p>Wir sind laufend für Sie da</p>"],
  ])("%s", (_fall, satz) => {
    expect(bewerbungJederzeitLautText([satz])).toBe(false);
  });
});

describe("bewerbungJederzeitLautText — Saetze, die die Bewerbung jederzeit zulassen", () => {
  it.each([
    ["Standardsatz", "Bewerbung und Einstellung jederzeit möglich"],
    ["Bewerbung moeglich", "Eine Bewerbung ist jederzeit möglich."],
    ["jederzeit bewerben", "Sie können sich jederzeit bewerben."],
    ["Frist laufend", "Bewerbungsfrist: laufend"],
    ["Bewerbungen laufend", "Bewerbungen werden laufend entgegengenommen."],
  ])("%s", (_fall, satz) => {
    expect(bewerbungJederzeitLautText([satz])).toBe(true);
  });
});

/**
 * WOZU: Die Feldliste an EINER Stelle. `contactDesc` gehoert nicht hinein - dort
 * stehen die Kontaktsaetze ("jederzeit gern zur Verfuegung"), die Hauptquelle
 * falscher Treffer, und die Extraktion liest ihn aus demselben Grund nicht mit.
 */
describe("bewerbungJederzeitFuerJob", () => {
  const leer = { applicationEnd: "", companyDesc: "", jobDesc: "", requireDesc: "", remarcDesc: "", contactDesc: "" };

  it("liest die Volltextfelder der Stelle", () => {
    expect(bewerbungJederzeitFuerJob({ ...leer, companyDesc: "<p>Bewerbung und Einstellung jederzeit möglich</p>" })).toBe(true);
  });

  it("liest contactDesc nicht", () => {
    expect(bewerbungJederzeitFuerJob({ ...leer, contactDesc: "Bewerbung und Einstellung jederzeit möglich" })).toBe(false);
  });

  it("fragt gar nicht erst, wenn ein Datum da ist", () => {
    expect(
      bewerbungJederzeitFuerJob({ ...leer, applicationEnd: "31.12.2026", companyDesc: "Bewerbung jederzeit möglich" }),
    ).toBe(false);
  });
});

/**
 * WOZU: Derselbe leere Bewerbungsschluss darf nicht dreimal verschieden dastehen
 * - "keiner" im Paket, "in der Ausschreibung nicht angegeben" auf der
 * Paketseite, "keine Angabe" auf der KI-Seite. Ein Wortlaut, ein Helfer.
 */
describe("bewerbungsschlussText", () => {
  it("nennt das Datum, wenn es eines gibt", () => {
    expect(bewerbungsschlussText("31.12.2026", false)).toBe("31.12.2026");
  });

  it("sagt 'keiner', wenn der Text die Bewerbung jederzeit zulaesst", () => {
    expect(bewerbungsschlussText("", true)).toBe("keiner, Bewerbung jederzeit möglich");
  });

  it("verweist an die Karriereberatung, wenn weder Datum noch Aussage da sind", () => {
    expect(bewerbungsschlussText("", false)).toBe("nicht genannt, im Zweifel bei der Karriereberatung nachfragen");
  });
});

describe("bewerbungsschlussZeile", () => {
  it("nennt das Datum, wenn es eines gibt", () => {
    expect(bewerbungsschlussZeile("31.12.2026", false)).toBe("Bewerbungsschluss: 31.12.2026");
  });

  it("sagt 'keiner', wenn der Text die Bewerbung jederzeit zulaesst", () => {
    expect(bewerbungsschlussZeile("", true)).toBe("Bewerbungsschluss: keiner, Bewerbung jederzeit möglich");
  });

  it("verweist an die Karriereberatung, wenn weder Datum noch Aussage da sind", () => {
    expect(bewerbungsschlussZeile("", false)).toBe(
      "Bewerbungsschluss: nicht genannt, im Zweifel bei der Karriereberatung nachfragen",
    );
  });
});
