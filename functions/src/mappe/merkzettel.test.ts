import { describe, it, expect } from "vitest";
import { AUSWEISKOPIE_HINWEIS } from "./ausweiskopie";
import {
  abschnittAnhaenge,
  abschnittEinreichen,
  abschnittInformation,
  abschnittUnterschreiben,
  abschnittVordrucke,
  weitereAnhaenge,
  abschnittNochBeschaffen,
  abschnittPlatzhalter,
  abschnittVonHand,
  anhaengeNichtImPaket,
  laufbahngruppenDerStelle,
  vonHandFuerFormulare,
  VORDRUCK_PRUEFEN,
} from "./merkzettel";

/**
 * WOZU: Der Merkzettel im Paket ist das Einzige, was der Bewerber nach dem
 * Loeschen der Mappe noch in der Hand hat. Er darf nie "nach der
 * Unterlagenliste dieser Ausschreibung ist das Paket vollstaendig" sagen, wenn
 * es gar keine Unterlagenliste gibt - und muss "Anlage 1 zum Bewerbungsbogen"
 * und leere Pflichtfelder im Bogen nennen.
 */
describe("abschnittNochBeschaffen", () => {
  it("sagt NIE 'vollstaendig', wenn es keine Unterlagenliste gab", () => {
    const text = abschnittNochBeschaffen([], []);
    expect(text).not.toMatch(/vollständig/i);
    expect(text).not.toMatch(/Nichts/);
  });

  it("sagt ohne Liste, dass das nicht 'nichts noetig' heisst, nennt das Uebliche und das Verbindliche", () => {
    const text = abschnittNochBeschaffen([], []).replace(/\s+/g, " ");
    expect(text).toMatch(/nicht herauslesen/);
    expect(text).toMatch(/Unterlagen brauchst du trotzdem/);
    expect(text).toMatch(/Anschreiben/);
    expect(text).toMatch(/Lebenslauf/);
    expect(text).toMatch(/Zeugniskopien/);
    expect(text).toMatch(/Verbindlich/);
  });

  it("darf 'vollstaendig' sagen, wenn eine Liste da war und nichts daraus fehlt", () => {
    expect(abschnittNochBeschaffen(["Lebenslauf"], [])).toMatch(/vollständig/);
  });

  it("listet auf, was aus der Liste fehlt", () => {
    const text = abschnittNochBeschaffen(["Lebenslauf", "Führungszeugnis"], ["Führungszeugnis"]);
    expect(text).toContain("  - Führungszeugnis");
    expect(text).not.toMatch(/vollständig/);
  });

  // Wir nehmen keine Ausweiskopien entgegen - verlangt die
  // Ausschreibung eine, muss der Zettel sagen, dass der Bewerber sie selbst
  // beilegt. Sonst fehlt sie in der Bewerbung, ohne dass es jemand merkt.
  it("sagt, dass der Bewerber eine verlangte Ausweiskopie selbst beilegt", () => {
    const text = abschnittNochBeschaffen(["Lebenslauf", "Kopie des Personalausweises"], []);
    expect(text.replace(/\s+/g, " ")).toContain(AUSWEISKOPIE_HINWEIS);
    expect(text).not.toMatch(/vollständig/);
  });

  it("nennt die Ausweiskopie neben dem, was sonst noch fehlt", () => {
    const text = abschnittNochBeschaffen(["Führungszeugnis", "Kopie des Personalausweises"], ["Führungszeugnis"]);
    expect(text).toContain("  - Führungszeugnis");
    expect(text.replace(/\s+/g, " ")).toContain(AUSWEISKOPIE_HINWEIS);
  });

  it("erwaehnt keine Ausweiskopie, wenn die Ausschreibung keine verlangt", () => {
    expect(abschnittNochBeschaffen(["Lebenslauf", "Kopie des Schwerbehindertenausweises"], [])).not.toMatch(/Ausweiskopie/);
    expect(abschnittNochBeschaffen([], [])).not.toMatch(/Ausweiskopie/);
  });

  it("bricht lange Saetze um und rueckt sie ein wie den Rest des Zettels", () => {
    for (const geforderte of [[], ["Kopie des Personalausweises"]]) {
      for (const zeile of abschnittNochBeschaffen(geforderte, []).split("\n").slice(1)) {
        expect(zeile.startsWith("  ")).toBe(true);
        expect(zeile.length).toBeLessThanOrEqual(90);
      }
    }
  });
});

describe("anhaengeNichtImPaket", () => {
  const anhaenge = [
    { docId: "a", attHeader: "Factsheet_Fw_IT" },
    { docId: "b", attHeader: "Bewerbungsbogen_Militärisch" },
    { docId: "c", attHeader: "Anlage 1 zum Bewerbungsbogen" },
  ];

  it("nennt alle Anhaenge ausser den ausgefuellt beiliegenden Formularen", () => {
    expect(anhaengeNichtImPaket(anhaenge, ["b"])).toEqual(["Factsheet_Fw_IT", "Anlage 1 zum Bewerbungsbogen"]);
  });

  it("nennt einen Bogen, der NICHT ausgefuellt wurde, mit", () => {
    expect(anhaengeNichtImPaket(anhaenge, [])).toContain("Bewerbungsbogen_Militärisch");
  });
});

describe("abschnittAnhaenge", () => {
  it("listet nicht einzuordnende Dateien neutral und laesst den Bewerber pruefen", () => {
    const text = abschnittAnhaenge(["TD_Teil_1_31940726"]);
    expect(text?.replace(/\s+/g, " ")).toMatch(/können wir nicht sicher sagen\. Prüf das bitte selbst/);
    expect(text).toContain("  - TD_Teil_1_31940726");
  });

  it("laesst den Abschnitt weg, wenn es keine weiteren Anhaenge gibt", () => {
    expect(abschnittAnhaenge([])).toBeNull();
  });
});

/**
 * "Anlage 1 zum Bewerbungsbogen" (Erklaerung zur Verfassungstreue) darf nicht
 * gleichrangig neben einer Infobroschuere unter "Pruefe, ob eine davon
 * mitgeschickt werden muss" stehen. Ohne sie ist die Bewerbung unvollstaendig.
 */
describe("weitereAnhaenge / abschnittVordrucke / abschnittInformation", () => {
  const anhaenge = [
    { docId: "fact", attHeader: "Factsheet_Fw_IT" },
    { docId: "beiblatt", attHeader: "Beiblatt Staatenliste" },
    { docId: "anlage", attHeader: "Anlage 1 zum Bewerbungsbogen", downloadUrl: "https://example.org/a1.pdf" },
    { docId: "bogen", attHeader: "Bewerbungsbogen_Militärisch" },
    { docId: "bfd", attHeader: "Berufsförderungsdienst - Die Zukunft im Blick" },
  ];

  it("laesst den ausgefuellten Bogen weg und teilt den Rest nach Art auf", () => {
    const teile = weitereAnhaenge(anhaenge, ["bogen"]);
    expect(teile.ausfuellen.map((a) => a.attHeader)).toEqual(["Anlage 1 zum Bewerbungsbogen"]);
    expect(teile.beiblaetter.map((a) => a.attHeader)).toEqual(["Beiblatt Staatenliste"]);
    expect(teile.information.map((a) => a.attHeader)).toEqual([
      "Factsheet_Fw_IT",
      "Berufsförderungsdienst - Die Zukunft im Blick",
    ]);
    expect(teile.pruefen).toEqual([]);
  });

  it("sagt, dass wir den Vordruck nicht ausfuellen, und verlinkt ihn", () => {
    const text = abschnittVordrucke(weitereAnhaenge(anhaenge, ["bogen"])) ?? "";
    expect(text).toMatch(/^AUSFÜLLEN UND UNTERSCHREIBEN \(gehört zur Bewerbung\)/);
    expect(text.replace(/\s+/g, " ")).toMatch(/füllen wir nicht aus/);
    expect(text.replace(/\s+/g, " ")).toMatch(/von Hand aus, unterschreibe sie/);
    expect(text).toContain("  - Anlage 1 zum Bewerbungsbogen\n    Download: https://example.org/a1.pdf");
    expect(text).toMatch(/Nachschlagen[^\n]*\n {2}- Beiblatt Staatenliste/);
  });

  it("nennt den Vordruck auch ohne Link", () => {
    const text = abschnittVordrucke({ ausfuellen: [{ docId: "a", attHeader: "Anlage 1 zum Bewerbungsbogen" }], beiblaetter: [] });
    expect(text).toContain("  - Anlage 1 zum Bewerbungsbogen");
    expect(text).not.toContain("Download:");
  });

  it("laesst den Abschnitt weg, wenn kein solcher Vordruck da ist", () => {
    expect(abschnittVordrucke({ ausfuellen: [], beiblaetter: [] })).toBeNull();
  });

  it("nennt Informationsmaterial als nicht mitzuschicken", () => {
    const text = abschnittInformation(["Factsheet_Fw_IT"]) ?? "";
    expect(text).toMatch(/^ZUR INFORMATION/);
    expect(text.replace(/\s+/g, " ")).toMatch(/Informationsmaterial, das du nicht mitschicken musst/);
    expect(abschnittInformation([])).toBeNull();
  });
});

describe("abschnittEinreichen / abschnittUnterschreiben", () => {
  it("nennt Portaladresse, Kennung und was mit den PDFs geschieht", () => {
    const text = abschnittEinreichen("2026-1-CIR-Fw-IT-E", "").replace(/\s+/g, " ");
    expect(text).toMatch(/^EINREICHEN/);
    expect(text).toContain("https://bewerbung.bundeswehr-karriere.de");
    expect(text).toContain("über ihre Kennung 2026-1-CIR-Fw-IT-E");
    expect(text).toMatch(/hochladen/);
    expect(text).toContain("Bei Fragen: die in der Ausschreibung genannte Ansprechperson");
  });

  it("listet die Vordrucke unter dem Namen, den der Aufrufer gibt", () => {
    expect(abschnittUnterschreiben(["03_Bewerbungsbogen.pdf"])).toContain("  - 03_Bewerbungsbogen.pdf");
    expect(abschnittUnterschreiben([])).toMatch(/kein Vordruck/);
  });
});

describe("vonHandFuerFormulare / abschnittVonHand", () => {
  it("baut je ausgefuelltem Bogen eine Feldliste aus der Vorlage", () => {
    const [eintrag] = vonHandFuerFormulare(
      [{ attHeader: "Bewerbungsbogen_Militärisch", fehlendeAngaben: ["telefon"] }],
      ["Feldwebel"],
    );
    expect(eintrag.formular).toBe("Bewerbungsbogen_Militärisch");
    expect(eintrag.felder.join("\n")).toMatch(/laut Ausschreibung: Feldwebel/);
    expect(eintrag.felder.join("\n")).toMatch(/Telefon/);
  });

  // Still weglassen hiesse, dass ein ausgefuellter Vordruck ohne jeden Hinweis
  // auf Handarbeit im Paket laege.
  it("erfindet bei unbekannter Vorlage keine Felder, laesst den Vordruck aber nicht still weg", () => {
    expect(vonHandFuerFormulare([{ attHeader: "Unbekannter Bogen", fehlendeAngaben: [] }], [])).toEqual([
      { formular: "Unbekannter Bogen", felder: [VORDRUCK_PRUEFEN] },
    ]);
    expect(vonHandFuerFormulare([{ attHeader: "", fehlendeAngaben: [] }], [])[0].formular).toBe("Ausgefüllter Vordruck");
  });

  it("schreibt je Formular eine Ueberschrift und darunter die Felder", () => {
    const text = abschnittVonHand([{ formular: "Bewerbungsbogen_Militärisch", felder: ["Geschlecht", "Anrede"] }]);
    expect(text).toMatch(/^VON HAND ERGÄNZEN/);
    expect(text).toContain("Bewerbungsbogen_Militärisch");
    expect(text).toContain("  - Geschlecht");
  });

  it("laesst den Abschnitt weg, wenn kein Formular im Paket ist", () => {
    expect(abschnittVonHand([])).toBeNull();
  });
});

describe("laufbahngruppenDerStelle", () => {
  it("nimmt die amtliche Facette in den Worten des Vordrucks", () => {
    expect(laufbahngruppenDerStelle({ laufbahngruppe: "0008" })).toEqual(["Feldwebel"]);
    expect(laufbahngruppenDerStelle({ laufbahngruppe: "0009" })).toEqual(["Offiziere"]);
  });

  it("faellt auf die Auswertung des Textes zurueck, wenn die Facette fehlt", () => {
    expect(
      laufbahngruppenDerStelle({ laufbahngruppe: "", jobAttributes: { laufbahngruppen: ["Mannschaften"] } as never }),
    ).toEqual(["Mannschaften"]);
  });

  it("liefert nichts fuer zivile Laufbahnen", () => {
    expect(laufbahngruppenDerStelle({ laufbahngruppe: "0003" })).toEqual([]);
  });
});

/**
 * "[Adresse]", "[Telefon]" usw. koennen unveraendert im Anschreiben-PDF
 * stehen. Was beim Paketbau noch in Klammern steht, nennt der Zettel -
 * nur die Platzhalter-Namen, nie Text oder Werte.
 */
describe("abschnittPlatzhalter", () => {
  it("nennt je Dokument die offenen Platzhalter und was zu tun ist", () => {
    const text = abschnittPlatzhalter([
      { ort: "Im Anschreiben", platzhalter: ["[Telefon]", "[Datum]"] },
      { ort: "Im Lebenslauf", platzhalter: ["[E-Mail]"] },
    ]);
    expect(text).toMatch(/^PLATZHALTER ERSETZEN/);
    const fliesstext = text?.replace(/\s+/g, " ");
    expect(fliesstext).toContain(
      "- Im Anschreiben stehen noch Platzhalter: [Telefon], [Datum]. Ersetze sie vor dem Einreichen.",
    );
    expect(fliesstext).toContain("- Im Lebenslauf stehen noch Platzhalter: [E-Mail]. Ersetze sie vor dem Einreichen.");
  });

  it("laesst den Abschnitt weg, wenn nirgends ein Platzhalter steht", () => {
    expect(abschnittPlatzhalter([])).toBeNull();
    expect(abschnittPlatzhalter([{ ort: "Im Anschreiben", platzhalter: [] }])).toBeNull();
  });
});
