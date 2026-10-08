import { describe, it, expect } from "vitest";
import { paketVerzeichnis, wasNochZuTun } from "./paketVerzeichnis";
import { vonHandFuerFormulare, weitereAnhaenge } from "./merkzettel";
import type { MappenDokument } from "./mappeTypen";

function dok(over: Partial<MappenDokument>): MappenDokument {
  return {
    docId: "d1",
    art: "sonstiges",
    dateiname: "datei.pdf",
    storagePath: "p",
    contentType: "application/pdf",
    sizeBytes: 10,
    herkunft: "upload",
    hinzugefuegtAm: 1,
    ...over,
  };
}

/**
 * WOZU: Der Bewerber laedt EIN Paket herunter und muss darin ohne Nachdenken
 * erkennen, was er wem schickt. "dokument (3).pdf" ist keine Bewerbung.
 */
describe("paketVerzeichnis", () => {
  it("nummeriert in der Reihenfolge des Stapels, nicht des Uploads", () => {
    const namen = paketVerzeichnis([
      dok({ docId: "z", art: "zeugnis", dateiname: "Abitur.pdf", hinzugefuegtAm: 1 }),
      dok({ docId: "a", art: "anschreiben", dateiname: "Anschreiben.pdf", hinzugefuegtAm: 2 }),
      dok({ docId: "l", art: "lebenslauf", dateiname: "CV.pdf", hinzugefuegtAm: 3 }),
    ]).map((eintrag) => eintrag.nameImZip);

    expect(namen).toEqual(["01_Anschreiben.pdf", "02_Lebenslauf.pdf", "03_Zeugnis.pdf"]);
  });

  it("zaehlt mehrere Zeugnisse durch und behaelt ihre Namen", () => {
    const namen = paketVerzeichnis([
      dok({ docId: "z1", art: "zeugnis", dateiname: "Abitur.pdf", hinzugefuegtAm: 1 }),
      dok({ docId: "z2", art: "zeugnis", dateiname: "Praktikum.pdf", hinzugefuegtAm: 2 }),
    ]).map((eintrag) => eintrag.nameImZip);

    expect(namen).toEqual(["01_Zeugnis_Abitur.pdf", "02_Zeugnis_Praktikum.pdf"]);
  });

  /**
   * WOZU: Zwei Namen fuer zwei Adressaten. Im ZIP steht der Name des Bewerbers -
   * das Paket geht an ihn selbst, dort ist sein eigener Dateiname hilfreich.
   * `bezeichnung` ist das, was der Client (ein fremdes KI-Tool) zu sehen
   * bekommt, und darf den Klarnamen nicht tragen.
   */
  it("traegt neben dem ZIP-Namen eine Bezeichnung ohne den Dateinamen des Bewerbers", () => {
    const verzeichnis = paketVerzeichnis([
      dok({ docId: "z1", art: "zeugnis", dateiname: "Zeugnis_Mustermann_1998.pdf", hinzugefuegtAm: 1 }),
      dok({ docId: "z2", art: "zeugnis", dateiname: "Abschluss_Mustermann.pdf", hinzugefuegtAm: 2 }),
    ]);

    expect(verzeichnis.map((eintrag) => eintrag.nameImZip)).toEqual([
      "01_Zeugnis_Zeugnis_Mustermann_1998.pdf",
      "02_Zeugnis_Abschluss_Mustermann.pdf",
    ]);
    expect(verzeichnis.map((eintrag) => eintrag.bezeichnung)).toEqual(["Zeugnis 1", "Zeugnis 2"]);
  });

  it("haelt Dateinamen frei von Zeichen, die Entpacker stolpern lassen", () => {
    const [eintrag] = paketVerzeichnis([
      dok({ art: "zeugnis", dateiname: "Zeugnis 1/2 (Kopie).pdf", hinzugefuegtAm: 1 }),
      dok({ docId: "z2", art: "zeugnis", dateiname: "Zweites.pdf", hinzugefuegtAm: 2 }),
    ]);
    expect(eintrag.nameImZip).toBe("01_Zeugnis_Zeugnis_1_2_Kopie.pdf");
  });

  it("nimmt die Endung aus dem Inhaltstyp, nicht aus dem Dateinamen", () => {
    const [eintrag] = paketVerzeichnis([
      dok({ art: "zeugnis", dateiname: "scan", contentType: "image/jpeg", hinzugefuegtAm: 1 }),
    ]);
    expect(eintrag.nameImZip).toBe("01_Zeugnis.jpg");
  });

  it("faellt auf den Dateinamen zurueck, wenn der Typ unbekannt ist", () => {
    const [eintrag] = paketVerzeichnis([
      dok({ art: "sonstiges", dateiname: "notiz.txt", contentType: "text/plain", hinzugefuegtAm: 1 }),
    ]);
    expect(eintrag.nameImZip).toBe("01_Unterlage.txt");
  });
});

/**
 * WOZU: Die echten Vordrucke haben kein Unterschriftsfeld. Ausdrucken und Unterschreiben bleibt Nutzerarbeit - also gehoert
 * sie als Zettel ins Paket und nicht in einen Chatverlauf, der verloren geht.
 */
describe("wasNochZuTun", () => {
  const eingabe = {
    refCode: "2026-MSch-MKF-E",
    titel: "Kraftfahrerin / Kraftfahrer Panzer",
    bewerbungsschluss: "31.12.2026",
    bewerbungJederzeit: false,
    geforderteUnterlagen: ["Lebenslauf", "Kopie des letzten Schulzeugnisses"],
    fehlendeUnterlagen: ["Kopie des letzten Schulzeugnisses"],
    formulareImPaket: ["03_Bewerbungsbogen.pdf"],
    vonHand: [],
    weitereAnhaenge: weitereAnhaenge([], []),
    ansprechperson: "Karrierecenter Munster, 05192 12-3456",
  };

  it("nennt Kennung, Titel und Frist", () => {
    const text = wasNochZuTun(eingabe);
    expect(text).toContain("2026-MSch-MKF-E");
    expect(text).toContain("Bewerbungsschluss: 31.12.2026");
  });

  it("sagt ausdruecklich, dass unterschrieben werden muss", () => {
    expect(wasNochZuTun(eingabe)).toMatch(/unterschreiben/i);
  });

  it("fuehrt auf, was noch fehlt", () => {
    expect(wasNochZuTun(eingabe)).toContain("Kopie des letzten Schulzeugnisses");
  });

  it("sagt es auch, wenn aus einer vorhandenen Liste nichts fehlt", () => {
    expect(wasNochZuTun({ ...eingabe, fehlendeUnterlagen: [] })).toMatch(/vollständig/);
  });

  /** Keine Liste darf nicht als "vollstaendig" gelten. */
  it("sagt NIE 'vollstaendig', wenn es keine Unterlagenliste gab", () => {
    const text = wasNochZuTun({ ...eingabe, geforderteUnterlagen: [], fehlendeUnterlagen: [] });
    expect(text).not.toMatch(/vollständig/);
    expect(text.replace(/\s+/g, " ")).toMatch(/Unterlagen brauchst du trotzdem/);
  });

  it("nennt die Anhaenge der Ausschreibung, die nicht im Paket liegen", () => {
    const text = wasNochZuTun({
      ...eingabe,
      weitereAnhaenge: weitereAnhaenge([{ docId: "a", attHeader: "Anlage 1 zum Bewerbungsbogen" }], []),
    });
    expect(text).toContain("  - Anlage 1 zum Bewerbungsbogen");
  });

  /** Platzhalter stehen ganz oben, vor allem anderen - sonst geht ein Anschreiben mit "[Telefon]" hinaus. */
  it("stellt offene Platzhalter vor jeden anderen Abschnitt", () => {
    const text = wasNochZuTun({
      ...eingabe,
      platzhalter: [{ ort: "In 01_Anschreiben.pdf", platzhalter: ["[Adresse]"] }],
    });
    const abschnitte = text.split("\n").filter((zeile) => /^[A-ZÄÖÜ][A-ZÄÖÜ ()-]+$/.test(zeile));
    expect(abschnitte[0]).toBe("PLATZHALTER ERSETZEN");
  });

  it("nennt je Formular, was von Hand zu ergaenzen ist", () => {
    const text = wasNochZuTun({
      ...eingabe,
      vonHand: [{ formular: "Bewerbungsbogen_Militärisch", felder: ["Geschlecht und Anrede auswählen"] }],
    });
    expect(text).toMatch(/VON HAND ERGÄNZEN/);
    expect(text).toContain("Geschlecht und Anrede auswählen");
  });

  it("sagt bei leerem Datum und 'jederzeit' im Text: kein Bewerbungsschluss", () => {
    const text = wasNochZuTun({ ...eingabe, bewerbungsschluss: "", bewerbungJederzeit: true });
    expect(text).toContain("Bewerbungsschluss: keiner, Bewerbung jederzeit möglich");
  });

  it("sagt, dass das Paket nicht von der Bundeswehr kommt", () => {
    expect(wasNochZuTun(eingabe)).toMatch(/nicht von der Bundeswehr/);
  });

  /**
   * Der vollstaendige Zettel einer echten IT-Stelle
   * (FA163EC863931FD19AAFDDF869A2139B). Steht hier ausgeschrieben, damit jede
   * Aenderung am Zettel im Diff sichtbar wird.
   */
  it("rendert den Zettel fuer eine echte IT-Stelle", () => {
    const text = wasNochZuTun({
      refCode: "2026-1-CIR-Fw-IT-E",
      titel: "Expertin / Experte Informationstechnik (m/w/d)",
      bewerbungsschluss: "",
      bewerbungJederzeit: true,
      geforderteUnterlagen: [],
      fehlendeUnterlagen: [],
      formulareImPaket: ["04_Bewerbungsbogen.pdf"],
      vonHand: vonHandFuerFormulare(
        [{ attHeader: "Bewerbungsbogen_Militärisch", fehlendeAngaben: ["staatsangehoerigkeit"] }],
        ["Feldwebel"],
      ),
      weitereAnhaenge: weitereAnhaenge(
        [
          { docId: "fact", attHeader: "Factsheet_Fw_IT" },
          { docId: "beiblatt", attHeader: "Beiblatt Staatenliste" },
          {
            docId: "anlage",
            attHeader: "Anlage 1 zum Bewerbungsbogen",
            downloadUrl: "https://firebasestorage.googleapis.com/v0/b/better-bewerbungsportal.firebasestorage.app/o/jobDocuments%2Fanlage1.pdf?alt=media",
          },
          { docId: "bogen", attHeader: "Bewerbungsbogen_Militärisch" },
          { docId: "bfd", attHeader: "Berufsförderungsdienst - Die Zukunft im Blick" },
        ],
        ["bogen"],
      ),
      ansprechperson: "",
    });
    expect(text).toMatchInlineSnapshot(`
      "BEWERBUNG: Expertin / Experte Informationstechnik (m/w/d)
      Kennung der Ausschreibung: 2026-1-CIR-Fw-IT-E
      Bewerbungsschluss: keiner, Bewerbung jederzeit möglich

      UNTERSCHREIBEN
        Die amtlichen Vordrucke haben kein digitales Unterschriftsfeld. Druck sie aus,
        unterschreib sie von Hand und scanne sie dann ein oder schick sie mit:
        - 04_Bewerbungsbogen.pdf

      AUSFÜLLEN UND UNTERSCHREIBEN (gehört zur Bewerbung)
        Diese Vordrucke der Ausschreibung füllen wir nicht aus und sie liegen nicht im
        Paket. Lade sie herunter, fülle sie von Hand aus, unterschreibe sie und reiche sie
        mit der Bewerbung ein:
        - Anlage 1 zum Bewerbungsbogen
          Download: https://firebasestorage.googleapis.com/v0/b/better-bewerbungsportal.firebasestorage.app/o/jobDocuments%2Fanlage1.pdf?alt=media
        Zum Nachschlagen dafür (nicht ausfüllen):
        - Beiblatt Staatenliste
        Steht auf einem Vordruck, dass er nur in bestimmten Fällen gilt (z. B. bei
        Minderjährigen), richte dich danach.

      VON HAND ERGÄNZEN
        Diese Felder haben wir nicht ausgefüllt, weil du sie selbst entscheidest oder uns
        die Angabe fehlte:
        Bewerbungsbogen_Militärisch:
          - Staatsangehörigkeit eintragen (Pflichtangabe auf dem Bogen)
          - Laufbahn ankreuzen (Freiwilliger Wehrdienst / Soldat auf Zeit (Kurz) /
            Mannschaften / Unteroffiziere / Feldwebel / Offiziere), laut Ausschreibung:
            Feldwebel
          - Geschlecht und Anrede auswählen, Titel falls vorhanden
          - Staat beim Hauptwohnsitz und beim Geburtsort (z. B. Deutschland)
          - Weitere Wohnsitze, falls vorhanden
          - Freiwillig, falls nicht schon eingetragen: Akademischer Grad, Führerschein
            Klassen zivil, weitere oder frühere Staatsangehörigkeiten, Grad der
            Behinderung
          - Teil B (Einwilligung zur Erreichbarkeit per Telefon und E-Mail): Nein oder Ja
            ankreuzen, Ort und Datum
          - Teil C (Erklärung): Ort und Datum
          - Bei Minderjährigen zusätzlich: Ort, Datum, Vorname und Nachname der
            Sorgeberechtigten

      NOCH BESCHAFFEN
        Eine Liste der Unterlagen konnten wir aus dieser Ausschreibung nicht herauslesen.
        Unterlagen brauchst du trotzdem: üblich sind ein Anschreiben, ein tabellarischer
        Lebenslauf und Zeugniskopien. Verbindlich sind der Ausschreibungstext und die dort
        genannte Ansprechperson bzw. die Karriereberatung.

      ZUR INFORMATION
        Diese Dateien der Ausschreibung sind Informationsmaterial, das du nicht
        mitschicken musst:
        - Factsheet_Fw_IT
        - Berufsförderungsdienst - Die Zukunft im Blick

      EINREICHEN
        Die Bewerbung reichst du selbst bei der Bundeswehr ein:
        - Im offiziellen Bewerbungsportal der Bundeswehr
          (https://bewerbung.bundeswehr-karriere.de) auf „Karriere starten“ klicken und
          ein Profil anlegen.
        - Dort die Stelle über ihre Kennung 2026-1-CIR-Fw-IT-E suchen und die Unterlagen
          als PDF im Bewerbungsprofil hochladen. Unterschriebene Vordrucke vorher
          einscannen.
        - Das Portal fragt die persönlichen Angaben dort noch einmal selbst ab.
        - In der Regel meldet sich danach die Karriereberatung zur Terminvereinbarung.
        - Nennt die Ausschreibung einen anderen Weg, gilt dieser.
        Bei Fragen: die in der Ausschreibung genannte Ansprechperson

      Dieses Paket stammt von Better Bewerbungsportal, einem unabhängigen privaten
      Projekt, und nicht von der Bundeswehr. Prüfe die Angaben, bevor du sie einreichst."
    `);
    expect(text).not.toMatch(/vollständig/);
    expect(text.replace(/\s+/g, " ")).toContain("laut Ausschreibung: Feldwebel");
    expect(text).toContain("Anlage 1 zum Bewerbungsbogen");
  });
});
