import { describe, it, expect } from "vitest";
import { trefferMail, vorwarnMail } from "./trefferMail";
import type { MailStelle } from "./trefferMail";
import { BEWERBERDATEN_IM_KONTO } from "../lib/funktionsschalter";

const BASIS = "https://better-bewerbungsportal.de";
const ABBESTELLEN = `${BASIS}/abbestellen?konto=xyz&token=abc123`;

function stelle(over: Partial<MailStelle> = {}): MailStelle {
  return {
    pinstGuid: "abc123",
    titel: "Elektroniker/-in Fachrichtung Energie- und Gebäudetechnik",
    ort: "Köln",
    bewerbungsschluss: "01.06.2027",
    ...over,
  };
}

describe("trefferMail - Betreff", () => {
  it("nennt bei genau einer Stelle die Einzahl", () => {
    const mail = trefferMail([stelle()], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.betreff).toBe("Eine neue Stelle passt zu deinem Suchprofil");
  });

  it("nennt bei mehreren Stellen die Mehrzahl mit Anzahl", () => {
    const mail = trefferMail([stelle(), stelle({ pinstGuid: "def456" })], 0, {
      basis: BASIS,
      abbestellen: ABBESTELLEN,
    });
    expect(mail.betreff).toBe("2 neue Stellen passen zu deinem Suchprofil");
  });

  it("zaehlt bei 'und N weitere' auch die weiteren mit", () => {
    const mail = trefferMail([stelle()], 3, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.betreff).toBe("4 neue Stellen passen zu deinem Suchprofil");
  });
});

describe("trefferMail - Inhalt je Stelle", () => {
  it("nennt Titel, Ort und Bewerbungsschluss", () => {
    const mail = trefferMail([stelle()], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text).toContain("Elektroniker/-in Fachrichtung Energie- und Gebäudetechnik");
    expect(mail.text).toContain("Köln");
    expect(mail.text).toContain("01.06.2027");
  });

  it("verlinkt 'Stelle ansehen' absolut mit basis und pinstGuid", () => {
    const mail = trefferMail([stelle({ pinstGuid: "xyz789" })], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.html).toContain(`${BASIS}/dashboard/jobs/xyz789`);
    expect(mail.text).toContain(`${BASIS}/dashboard/jobs/xyz789`);
  });

  it("verlinkt 'Bewerben' auf die gefuehrte Bewerbung, solange es sie gibt", () => {
    const mail = trefferMail(
      [stelle({ pinstGuid: "xyz789" })],
      0,
      { basis: BASIS, abbestellen: ABBESTELLEN },
      { bewerbenLink: true },
    );
    expect(mail.html).toContain(`${BASIS}/dashboard/bewerben/xyz789`);
    expect(mail.text).toContain(`${BASIS}/dashboard/bewerben/xyz789`);
    expect(mail.text).toMatch(/Bewerben:/);
  });

  // Funktionsschalter BEWERBERDATEN_IM_KONTO aus:
  // die gefuehrte Bewerbung gibt es nicht, ein Link dorthin waere eine Sackgasse.
  it("laesst den 'Bewerben'-Link weg, wenn es die gefuehrte Bewerbung nicht gibt - Stelle und KI bleiben", () => {
    const mail = trefferMail(
      [stelle({ pinstGuid: "xyz789" })],
      0,
      { basis: BASIS, abbestellen: ABBESTELLEN },
      { bewerbenLink: false },
    );
    for (const fassung of [mail.text, mail.html]) {
      expect(fassung).not.toContain("/dashboard/bewerben/");
      expect(fassung).toContain(`${BASIS}/dashboard/jobs/xyz789`);
      expect(fassung).toContain(`${BASIS}/k/xyz789`);
    }
    expect(mail.text).not.toMatch(/^Bewerben:/m);
    expect(mail.html).toContain("Stelle ansehen");
    expect(mail.html).toContain("Für deine KI");
    expect(mail.html).not.toMatch(/>\s*Bewerben\s*</);
  });

  it("folgt ohne Angabe dem Funktionsschalter BEWERBERDATEN_IM_KONTO", () => {
    const mail = trefferMail([stelle({ pinstGuid: "xyz789" })], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text.includes("/dashboard/bewerben/")).toBe(BEWERBERDATEN_IM_KONTO);
  });

  // Je Stelle EIN Link, den der Bewerber in seine
  // eigene KI kopiert - der Kurzlink /k/{id} zeigt auf die KI-Seite der Stelle.
  it("gibt je Stelle den Kurzlink /k/{id} fuer die eigene KI - sichtbar, damit man ihn kopieren kann", () => {
    const mail = trefferMail([stelle({ pinstGuid: "AAA111" }), stelle({ pinstGuid: "BBB222" })], 0, {
      basis: BASIS,
      abbestellen: ABBESTELLEN,
    });
    expect(mail.text).toContain(`Für deine KI: ${BASIS}/k/AAA111`);
    expect(mail.text).toContain(`Für deine KI: ${BASIS}/k/BBB222`);
    expect(mail.html).toContain(`href="${BASIS}/k/AAA111"`);
    // Linktext nennt die Stelle (Screenreader), die Adresse steht sichtbar darunter.
    expect(mail.html).toContain(`>Für deine KI: ${stelle().titel}</a>`);
    expect(mail.html).toContain(`${BASIS}/k/BBB222</span>`);
  });

  it("erklaert einmal, wozu der KI-Link da ist und wie man ihn kopiert - mit Verweis auf /ki", () => {
    const mail = trefferMail([stelle(), stelle({ pinstGuid: "def456" })], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    const satz = "füge ihn in den Chat deiner KI ein, zum Beispiel ChatGPT, Claude oder Gemini";
    expect(mail.text.split(satz)).toHaveLength(2);
    expect(mail.html.split(satz)).toHaveLength(2);
    for (const fassung of [mail.text, mail.html]) {
      expect(fassung).toContain("Link gedrückt halten");
      expect(fassung).toContain("siehst du nur die Textfassung für die KI");
    }
    expect(mail.text).toContain(`Wie das geht: ${BASIS}/ki`);
    expect(mail.html).toContain(`href="${BASIS}/ki"`);
  });

  it("maskiert eine pinstGuid mit Sonderzeichen im KI-Link", () => {
    const mail = trefferMail([stelle({ pinstGuid: 'a"b<c' })], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.html).not.toContain('a"b<c');
    expect(mail.text).toContain(`${BASIS}/k/a%22b%3Cc`);
  });

  it("maskiert einen Titel mit <script> und & im HTML", () => {
    const mail = trefferMail(
      [stelle({ titel: '<script>alert("x")</script> Referat A & B' })],
      0,
      { basis: BASIS, abbestellen: ABBESTELLEN },
    );
    expect(mail.html).not.toContain("<script>alert");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("Referat A &amp; B");
  });
});

describe("trefferMail - weitere Stellen", () => {
  it("nennt 'und N weitere' und verweist auf die Merkliste, wo sie stehen", () => {
    const mail = trefferMail([stelle()], 5, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text).toContain("und 5 weitere");
    expect(mail.html).toContain("und 5 weitere");
    expect(mail.text).toContain(`${BASIS}/dashboard/merkliste`);
    expect(mail.html).toContain(`${BASIS}/dashboard/merkliste`);
  });

  it("erwaehnt keine weiteren Stellen, wenn weitere 0 ist", () => {
    const mail = trefferMail([stelle()], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text).not.toContain("weitere");
  });
});

describe("trefferMail - Merkliste", () => {
  it("sagt in Text und HTML, dass die Stellen auch auf der Merkliste stehen - als ganzer Satz mit eigenem Link", () => {
    const mail = trefferMail([stelle(), stelle({ pinstGuid: "def456" })], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    const satz = "Du findest diese Stellen auch auf deiner Merkliste, solange sie ausgeschrieben sind.";
    expect(mail.text).toContain(`${satz}\nZur Merkliste: ${BASIS}/dashboard/merkliste`);
    expect(mail.html).toContain(satz);
    expect(mail.html).toContain(`href="${BASIS}/dashboard/merkliste"`);
  });

  it("nennt bei genau einer Stelle die Einzahl", () => {
    const mail = trefferMail([stelle()], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text).toContain("Du findest diese Stelle auch auf deiner Merkliste, solange sie ausgeschrieben ist.");
  });

  it("sagt bei 'und N weitere', dass auch die weiteren auf der Merkliste stehen", () => {
    const mail = trefferMail([stelle()], 4, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text).toContain("Alle neuen Stellen, auch die weiteren, stehen auf deiner Merkliste");
    expect(mail.text).not.toContain("Alle Stellen durchsuchen");
  });

  it("verspricht bei voller Merkliste nicht, dass alle dort stehen, und haelt die weiteren ueber die Suche erreichbar", () => {
    const mail = trefferMail([stelle()], 3, { basis: BASIS, abbestellen: ABBESTELLEN }, { merklisteVoll: true });
    for (const fassung of [mail.text, mail.html]) {
      expect(fassung).not.toContain("auch auf deiner Merkliste");
      expect(fassung).toContain("Deine Merkliste ist voll (200 Stellen), deshalb stehen dort nicht alle neuen Stellen.");
      expect(fassung).toContain(`${BASIS}/dashboard/merkliste`);
      expect(fassung).toContain(`${BASIS}/dashboard/jobs"`.replace('"', ""));
    }
    expect(mail.text).toContain(`Alle Stellen durchsuchen: ${BASIS}/dashboard/jobs`);
  });
});

describe("trefferMail - Fuss", () => {
  it("enthaelt Text- und HTML-Fassung mit dem Abbestell-Link", () => {
    const mail = trefferMail([stelle()], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text).toContain(ABBESTELLEN);
    // Im HTML-Attribut ist "&" gemaess Spezifikation als "&amp;" zu schreiben.
    expect(mail.html).toContain(ABBESTELLEN.replace(/&/g, "&amp;"));
  });

  it("erklaert, warum die Mail kommt, und verlinkt das Suchprofil", () => {
    const mail = trefferMail([stelle()], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text).toContain("Benachrichtigungen in deinem Konto eingeschaltet");
    expect(mail.text).toContain(`${BASIS}/dashboard/konto`);
  });

  it("nennt sich nirgends ein Angebot der Bundeswehr", () => {
    const mail = trefferMail([stelle()], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text.toLowerCase()).not.toMatch(/im auftrag der bundeswehr|von der bundeswehr/);
    expect(mail.text).toMatch(/unabhängiges privates Projekt/);
    expect(mail.text).toMatch(/kein( offizielles)? Angebot der Bundeswehr/);
  });

  it("Du-Form statt Sie-Form", () => {
    const mail = trefferMail([stelle()], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.text).not.toMatch(/\bSie\b|\bIhr(e|em|er)?\b/);
  });
});

describe("trefferMail - keine externen Ressourcen", () => {
  it("laedt kein externes Bild oder Skript und traegt kein Tracking-Pixel", () => {
    const mail = trefferMail([stelle()], 0, { basis: BASIS, abbestellen: ABBESTELLEN });
    expect(mail.html).not.toMatch(/<img/i);
    expect(mail.html).not.toMatch(/<script/i);
    expect(mail.html).not.toMatch(/https?:\/\/(?!better-bewerbungsportal\.de)/);
  });
});

describe("vorwarnMail", () => {
  const LINKS = { basis: BASIS, loeschtAm: "12. Oktober 2027" };

  it("nennt das Loeschdatum im Text", () => {
    const mail = vorwarnMail(LINKS);
    expect(mail.text).toContain("12. Oktober 2027");
    expect(mail.html).toContain("12. Oktober 2027");
  });

  it("nennt den Grund und den Anmelde-Link", () => {
    const mail = vorwarnMail(LINKS);
    expect(mail.text).toContain("ein Jahr nicht angemeldet");
    expect(mail.text).toContain(`${BASIS}/anmelden`);
    expect(mail.html).toContain(`${BASIS}/anmelden`);
  });

  it("hat einen nicht-leeren Betreff", () => {
    const mail = vorwarnMail(LINKS);
    expect(mail.betreff.length).toBeGreaterThan(0);
  });

  it("nennt sich nirgends ein Angebot der Bundeswehr", () => {
    const mail = vorwarnMail(LINKS);
    expect(mail.text).toMatch(/unabhängiges privates Projekt/);
  });

  it("laedt keine externen Ressourcen", () => {
    const mail = vorwarnMail(LINKS);
    expect(mail.html).not.toMatch(/<img/i);
    expect(mail.html).not.toMatch(/<script/i);
  });
});
