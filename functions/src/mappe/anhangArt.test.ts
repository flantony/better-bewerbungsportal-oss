import { describe, it, expect } from "vitest";
import { anhangArt, istVerfassungstreueErklaerung, teileAnhaengeAuf } from "./anhangArt";

/**
 * WOZU: "Anlage 1 zum Bewerbungsbogen" - fuenf Seiten Erklaerung zur
 * Verfassungstreue, ohne die die Bewerbung unvollstaendig ist - darf nicht
 * gleichrangig neben einer Infobroschuere unter "Pruefe, ob eine davon
 * mitgeschickt werden muss" stehen. Die Titel unten sind echte
 * Anhangsnamen aus Ausschreibungen.
 */
describe("anhangArt — echte Anhangsnamen", () => {
  it.each([
    ["Anlage 1 zum Bewerbungsbogen"], // Bw-2053, Ort/Datum/Unterschrift
    ["Anlage 1 Erklärung politische Parteien u.a."], // derselbe Vordruck
    ["Erklärung über Mitgliedschaft_Erklärung Treuepflicht"], // derselbe Vordruck
    ["Fragebogen Stellenbörse"], // Reservisten, Ort/Datum/Unterschrift
    ["Antwortbogen"], // Reservisten, Formularfelder
    ["Datenschutzblatt"], // Informationsblatt mit Ort/Datum/Unterschrift
    ["Einverständnis Beorderung"],
    ["Einverständniserklärung für eine Beorderung"],
    ["EinverständniserklärungBwDLZ_LL"], // Erziehungsberechtigte
    ["Leistungsdatenübersicht gtD"], // "Bitte füllen Sie diese Übersicht ... aus"
    ["Notenuebersicht_Stipendiaten"],
  ])("'%s' ist ein Vordruck zum Ausfuellen und Unterschreiben", (titel) => {
    expect(anhangArt(titel)).toBe("ausfuellen");
  });

  it("'Beiblatt Staatenliste' ist ein Beiblatt zum Nachschlagen, kein Vordruck", () => {
    expect(anhangArt("Beiblatt Staatenliste")).toBe("beiblatt");
  });

  it.each([
    ["Berufsförderungsdienst - Die Zukunft im Blick"],
    ["Factsheet_Fw_IT"],
    ["Factsheet_Uffz+Fw_EloKa"],
    ["Infobroschuere-CIR"],
    ["InfobroschuereCIR"],
    ["Infobroschuere KdoCIR"],
    ["Reservisten Ihre zweite Karriere"],
    ["Broschüre Mittlerer Verwaltungsdienst"],
    ["Broschüre zivile Karriere BAAINBw  v1_5_k_DRUCK"],
    ["Flyer_Karrieremöglichkeiten_GeoInfoDBw"],
    ["Bezügebeispiele"],
    ["Bezügebeispiel htD WT"],
    ["Bezuege mtD-VD"],
    ["Förderliche Berufsabschlüsse_mntD"],
    ["Förderliche Ausbildungsberufe"],
    ["Info Seiteneinsteigende Militärmusik"],
    ["Info Studium Militärmusik"],
    ["Stellenbeschreibung"],
    ["Stellenbeschreibung MSch SAZ 2 Jahre"],
    ["Merkblatt zu 58 LHG BW"],
    // "Anlage 1 zur Ausschreibung": Liste der Verwendungen, kein Vordruck
    ["Anlage 1 OA-Führungskraft Reserve im Wehrdienst alle Laufbahnen Stand 15.07.2026"],
    // Stellenbeschreibungen, die "Anlage" nur hinten tragen
    ["2026_Fw_V1.1_Anlage"],
    ["IT-Unteroffizier Informationsverarbeitung Anlage"],
    ["Truppenversorgungsbearbeiter Anlage"],
    ["AssFüMGesV_Leer_Anlage"],
  ])("'%s' ist Informationsmaterial", (titel) => {
    expect(anhangArt(titel)).toBe("information");
  });

  it.each([
    ["Bewerbungsbogen_Militärisch"],
    ["Bewerbungsbogen Seiteneinstieg und ROB ab GEWET 2027 17.07.2026"],
    ["Karrierebogen Zivil"],
    ["Bewerbungsformular_ziv_25_07"],
  ])("'%s' ist ein Bewerbungsbogen (eigene Behandlung)", (titel) => {
    expect(anhangArt(titel)).toBe("bewerbungsbogen");
  });

  // Was wir nicht sicher zuordnen koennen, bleibt in der neutralen Liste -
  // falsch als "Information" einsortiert hiesse: der Bewerber laesst einen
  // Pflichtvordruck weg.
  it.each([
    ["TD_Teil_1_31940726"], // nicht lesbares XFA-PDF
    ["Zuordnung_gtD_miS_03_2027"], // Rueckantwort - am Namen nicht erkennbar
    ["BB_mntDDE_Maerz24"],
    ["6 Zustimmung GleiBziv BeschDSt O26_33"], // interne Mail, kein Vordruck
    ["Irgendein neuer Anhang"],
  ])("'%s' bleibt unbekannt", (titel) => {
    expect(anhangArt(titel)).toBe("unbekannt");
  });
});

describe("istVerfassungstreueErklaerung", () => {
  it.each([
    ["Anlage 1 zum Bewerbungsbogen", true],
    ["Anlage 1 Erklärung politische Parteien u.a.", true],
    ["Erklärung über Mitgliedschaft_Erklärung Treuepflicht", true],
    ["Fragebogen Stellenbörse", false],
    ["Notenuebersicht_Stipendiaten", false],
    ["Einverständnis Beorderung", false],
  ])("'%s' -> %s", (titel, erwartet) => {
    expect(istVerfassungstreueErklaerung(titel)).toBe(erwartet);
  });
});

describe("teileAnhaengeAuf", () => {
  const anhang = (attHeader: string, downloadUrl?: string) => ({
    docId: attHeader,
    attHeader,
    ...(downloadUrl ? { downloadUrl } : {}),
  });

  it("teilt die echten Anhaenge von 2026-1-CIR-Fw-IT-E richtig auf", () => {
    const teile = teileAnhaengeAuf([
      anhang("Factsheet_Fw_IT"),
      anhang("Beiblatt Staatenliste"),
      anhang("Anlage 1 zum Bewerbungsbogen", "https://example.org/anlage1.pdf"),
      anhang("Berufsförderungsdienst - Die Zukunft im Blick"),
    ]);
    expect(teile.ausfuellen.map((a) => a.attHeader)).toEqual(["Anlage 1 zum Bewerbungsbogen"]);
    expect(teile.ausfuellen[0].downloadUrl).toBe("https://example.org/anlage1.pdf");
    expect(teile.beiblaetter.map((a) => a.attHeader)).toEqual(["Beiblatt Staatenliste"]);
    expect(teile.information.map((a) => a.attHeader)).toEqual([
      "Factsheet_Fw_IT",
      "Berufsförderungsdienst - Die Zukunft im Blick",
    ]);
    expect(teile.pruefen).toEqual([]);
  });

  it("legt ein Beiblatt ohne zugehoerigen Vordruck zum Informationsmaterial", () => {
    const teile = teileAnhaengeAuf([anhang("Beiblatt Staatenliste")]);
    expect(teile.beiblaetter).toEqual([]);
    expect(teile.information.map((a) => a.attHeader)).toEqual(["Beiblatt Staatenliste"]);
  });

  it("laesst Unbekanntes und nicht ausgefuellte Boegen in der neutralen Pruefliste", () => {
    const teile = teileAnhaengeAuf([anhang("TD_Teil_1_31940726"), anhang("Bewerbungsbogen_Militärisch")]);
    expect(teile.pruefen.map((a) => a.attHeader)).toEqual(["TD_Teil_1_31940726", "Bewerbungsbogen_Militärisch"]);
  });
});
