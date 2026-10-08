import { describe, it, expect, vi, beforeEach } from "vitest";

const queryJobsMock = vi.fn();
vi.mock("../lib/queryJobs", () => ({ queryJobs: (...args: unknown[]) => queryJobsMock(...args) }));

const zaehleAusschluesseMock = vi.fn();
vi.mock("../lib/ausschluesse", () => ({
  zaehleAusschluesse: (...args: unknown[]) => zaehleAusschluesseMock(...args),
}));

const { listJobs } = await import("./listJobs");

function summary(over: Record<string, unknown> = {}) {
  return {
    pinstGuid: "abc",
    refCode: "REF-4711",
    title: "Einstellung Offizierin/Offizier Schiffstechnik Fregatte (m/w/d)",
    besOrt: "Wilhelmshaven",
    contractTypeLabel: "Soldatin / Soldat auf Zeit",
    applicationEnd: "01.06.2027",
    vollzeit: true,
    besoldung: null,
    dokumente: [],
    ...over,
  };
}

beforeEach(() => {
  queryJobsMock.mockReset();
  queryJobsMock.mockResolvedValue({ results: [summary()], totalCount: 1, gelesen: 1 });
  zaehleAusschluesseMock.mockReset();
  zaehleAusschluesseMock.mockResolvedValue(null);
});

describe("listJobs", () => {
  // Ohne Kennzeichen kann der Bewerber keinen der genannten Treffer
  // wiederfinden - die Antwort sieht hilfreich aus und ist unbrauchbar.
  it("gibt zu jedem Treffer das Kennzeichen der Ausschreibung mit", async () => {
    const result = await listJobs({});
    expect(result.results[0].refCode).toBe("REF-4711");
  });

  it("uebersetzt die lesbaren Facettennamen in die API-Codes", async () => {
    await listJobs({ organisationsbereich: ["Marine"], laufbahngruppe: ["Offiziere"] });
    expect(queryJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({ organisationsbereich: ["0004"], laufbahngruppe: ["0009"] }),
    );
  });

  it("gibt die uebrigen Filter unveraendert weiter", async () => {
    await listJobs({
      suchbegriff: "Cyber",
      taetigkeitsbereich: "militaerisch",
      mindestbesoldung: 11,
      seiteneinstieg: true,
      limit: 5,
    });
    expect(queryJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        suchbegriff: "Cyber",
        taetigkeitsbereich: "militaerisch",
        mindestbesoldung: 11,
        seiteneinstieg: true,
        limit: 5,
      }),
    );
  });

  it("liefert eine kompakte Trefferzeile", async () => {
    const result = await listJobs({});
    expect(result.totalCount).toBe(1);
    expect(result.results[0]).toEqual({
      pinstGuid: "abc",
      refCode: "REF-4711",
      title: "Einstellung Offizierin/Offizier Schiffstechnik Fregatte (m/w/d)",
      besOrt: "Wilhelmshaven",
      bundesland: "",
      contractTypeLabel: "Soldatin / Soldat auf Zeit",
      applicationEnd: "01.06.2027",
      vollzeit: true,
      besoldung: "",
      dienstgrad: "",
      seiteneinstiegLautText: "unklar",
      einstiegsweg: "",
      einstiegswegBedeutung: "",
      hatBewerbungsbogen: false,
    });
  });

  it("nennt kein Feld, zu dem die Ausschreibung nichts sagt", async () => {
    const entry = (await listJobs({})).results[0] as Record<string, unknown>;
    for (const feld of ["mindestalter", "hoechstalter", "verpflichtungsdauer"]) {
      expect(entry, feld).not.toHaveProperty(feld);
    }
  });

  it("reicht das Alter als Filter an die Query durch", async () => {
    await listJobs({ alter: 34 });
    expect(queryJobsMock).toHaveBeenCalledWith(expect.objectContaining({ alter: 34 }));
  });

  // Eine bekannte und eine unbekannte Grenze an derselben Stelle: die bekannte
  // muss stehen bleiben, die unbekannte darf nicht als 0 mitfahren.
  it("laesst die unbekannte Grenze weg und behaelt die bekannte", async () => {
    queryJobsMock.mockResolvedValue({
      results: [summary({ jobAttributes: { mindestalter: 17, hoechstalter: 0, verpflichtungsdauer: "" } })],
      totalCount: 1,
      gelesen: 1,
    });
    const entry = (await listJobs({})).results[0] as Record<string, unknown>;
    expect(entry.mindestalter).toBe(17);
    expect(entry).not.toHaveProperty("hoechstalter");
    expect(entry).not.toHaveProperty("verpflichtungsdauer");
  });

  it("zeigt Altersgrenzen und Verpflichtungsdauer schon in der Trefferzeile", async () => {
    // K.-o.-Kriterien gehoeren in die Liste: wer sie erst ueber get_job
    // erfaehrt, hat die Auswahl auf einer Grundlage getroffen, die nicht galt.
    queryJobsMock.mockResolvedValue({
      results: [
        summary({
          jobAttributes: { mindestalter: 18, hoechstalter: 34, verpflichtungsdauer: "12 Jahre" },
        }),
      ],
      totalCount: 1,
      gelesen: 1,
      abgeschnitten: false,
    });
    const result = await listJobs({});
    expect(result.results[0]).toMatchObject({
      mindestalter: 18,
      hoechstalter: 34,
      verpflichtungsdauer: "12 Jahre",
    });
  });

  it("zeigt die Besoldungsspanne als Label", async () => {
    queryJobsMock.mockResolvedValue({
      results: [
        summary({
          besoldung: { von: "A10", bis: "A11", tabelle: "A", vonStufe: 10, bisStufe: 11, quelle: "ausschreibung" },
        }),
      ],
      totalCount: 1,
      gelesen: 1,
    });
    expect((await listJobs({})).results[0].besoldung).toBe("A10-A11");
  });

  it("meldet, ob ein Bewerbungsbogen anhaengt", async () => {
    queryJobsMock.mockResolvedValue({
      results: [summary({ dokumente: [{ docId: "x", attHeader: "Bewerbungsbogen_Militärisch" }] })],
      totalCount: 1,
      gelesen: 1,
    });
    expect((await listJobs({})).results[0].hatBewerbungsbogen).toBe(true);
  });

  // Eine Stelle mit "Antwortbogen" und "Datenschutzblatt" darf hier keinen
  // Bewerbungsbogen melden, wenn get_document_requirements zur selben Stelle
  // sagt, es haenge keiner an und es werde keiner verlangt. Zwei Werkzeuge,
  // zwei Antworten - der Client kann nicht entscheiden, welcher er glaubt.
  it("zaehlt einen beliebigen Anhang NICHT als Bewerbungsbogen", async () => {
    queryJobsMock.mockResolvedValue({
      results: [
        summary({
          dokumente: [
            { docId: "x", attHeader: "Antwortbogen" },
            { docId: "y", attHeader: "Datenschutzblatt" },
          ],
        }),
      ],
      totalCount: 1,
      gelesen: 1,
    });
    expect((await listJobs({})).results[0].hatBewerbungsbogen).toBe(false);
  });

  it("uebernimmt die extrahierten Anforderungen in die Kurzfassung", async () => {
    queryJobsMock.mockResolvedValue({
      results: [summary({ jobAttributes: { dienstgrad: "Hauptmann", seiteneinstieg: "ja" } })],
      totalCount: 1,
      gelesen: 1,
    });
    const entry = (await listJobs({})).results[0];
    expect(entry.dienstgrad).toBe("Hauptmann");
    expect(entry.seiteneinstiegLautText).toBe("ja");
  });
});

// Eine Anfrage wie "Ich moechte Panzerkommandant werden" endet leicht in
// einem nackten leeren Ergebnis. Die Regel "dann zuerst zaehle_treffer" in der
// Tool-Beschreibung wird uebergangen - sie wird gelesen, bevor die Situation
// eintritt. Deshalb steht sie im Rueckgabewert.
describe("listJobs — leeres Ergebnis", () => {
  beforeEach(() => {
    queryJobsMock.mockResolvedValue({ results: [], totalCount: 0, gelesen: 0 });
  });

  it("loest einen bekannten Berufswunsch in einen konkreten Suchvorschlag auf", async () => {
    const result = await listJobs({ suchbegriff: "Panzerkommandant" });
    expect(result.hinweis?.nurFuerDich).toMatch(/Panzer/);
    expect(result.hinweis?.nurFuerDich).toMatch(/Heer/);
  });

  it("weist auch ohne Registereintrag einen Weg aus der leeren Liste", async () => {
    const result = await listJobs({ suchbegriff: "Zonenschichtbeauftragter" });
    expect(result.hinweis?.nurFuerDich).toMatch(/zaehle_treffer/);
  });

  it("nennt bei einer reinen Filtersuche die Filter als Ursache", async () => {
    const result = await listJobs({ organisationsbereich: ["Marine"], wunschort: "Köln" });
    expect(result.hinweis?.nurFuerDich).toMatch(/Filter/);
  });
});

describe("listJobs — Treffer vorhanden", () => {
  it("haengt keinen Suchhinweis an eine gefuellte Liste", async () => {
    const result = await listJobs({ suchbegriff: "Panzerkommandant" });
    expect(result.hinweis).toBeUndefined();
  });

  // "Sag mir Bescheid, wenn so etwas Neues kommt" faellt NACH einer
  // Suche - dort, im Rueckgabewert, muss der Weg zu erstelle_suchprofil_link stehen.
  // Eigenes Feld, damit `hinweis` an einer gefuellten Liste leer bleibt.
  it("zeigt bei Treffern den Weg zur E-Mail-Benachrichtigung", async () => {
    const result = await listJobs({ suchbegriff: "Panzer" });
    expect(result.neueStellenPerMail?.nurFuerDich).toMatch(/erstelle_suchprofil_link/);
    expect(result.neueStellenPerMail?.nurFuerDich).toMatch(/alter/);
    expect(result.neueStellenPerMail?.fuerDenBewerber).toBeUndefined();
  });

  it("zeigt ihn nicht bei einer leeren Suche - dort ist eine bessere Suche dran", async () => {
    queryJobsMock.mockResolvedValue({ results: [], totalCount: 0, gelesen: 0 });
    const result = await listJobs({ suchbegriff: "Panzer" });
    expect(result.neueStellenPerMail).toBeUndefined();
  });
});

/**
 * Beispiel: ein Bewerber bittet um "eine Liste aller passenden Stellen" fuer
 * einen Seiteneinstieg als Reserveoffizier. Filtert der Client
 * `taetigkeitsbereich: "militaerisch"` plus `vertragsarten: ["Soldatin / Soldat
 * auf Zeit"]`, schliesst er genau die gefragte Kategorie aus - kein
 * Reserveoffizier-Dienstposten traegt diese Vertragsart. Ohne Zahl dazu
 * antwortet er, es gebe keinen.
 */
describe("listJobs — was die Filter ausschliessen", () => {
  function messung(over: Record<string, unknown> = {}) {
    zaehleAusschluesseMock.mockResolvedValue({
      je: [{ filter: "vertragsarten", anzahl: 310, ohneAngabe: 186 }],
      nichtEingerechnet: [],
      ...over,
    });
  }

  it("gibt Filter, Zahl und Datenluecke als eigenes Feld zurueck", async () => {
    messung();
    const ergebnis = await listJobs({
      taetigkeitsbereich: "militaerisch",
      vertragsarten: ["Soldatin / Soldat auf Zeit"],
    });
    expect(ergebnis.ausgeschlosseneStellen?.je).toEqual([
      { filter: "vertragsarten", anzahl: 310, ohneAngabe: 186 },
    ]);
  });

  // Eine nackte Zahl kann als "so viele passen auch" gelesen werden. Der Rahmen
  // sagt, was sie bedeutet - und dass die Liste nicht der Bestand ist.
  it("rahmt die Zahlen mit einem Satz an das Modell", async () => {
    messung();
    const ergebnis = await listJobs({ vertragsarten: ["Soldatin / Soldat auf Zeit"] });
    expect(ergebnis.ausgeschlosseneStellen?.nurFuerDich).toMatch(/nicht der Bestand/i);
    expect(ergebnis.ausgeschlosseneStellen?.nurFuerDich).toMatch(/ohneAngabe/);
  });

  // Ein Hinweis, der den naechsten Aufruf ausschreibt, wird befolgt; einer, der
  // "die Suche weiten" verlangt, bleibt Auslegungssache.
  it("schreibt den naechsten Aufruf ohne den luecken-behafteten Filter aus", async () => {
    messung();
    const ergebnis = await listJobs({
      taetigkeitsbereich: "militaerisch",
      vertragsarten: ["Soldatin / Soldat auf Zeit"],
    });
    const satz = ergebnis.ausgeschlosseneStellen?.nurFuerDich ?? "";
    expect(satz).toMatch(/taetigkeitsbereich: "militaerisch"/);
    expect(satz).toMatch(/ohne `vertragsarten`/);
    expect(satz).not.toMatch(/vertragsarten: \[/);
  });

  // Ohne Datenluecke gibt es keinen belegten "lass ihn weg"-Rat: die Zahl steht
  // da, das Urteil bleibt beim Modell.
  it("schlaegt ohne Datenluecke keinen naechsten Aufruf vor", async () => {
    messung({ je: [{ filter: "suchbegriff", anzahl: 1290 }] });
    const ergebnis = await listJobs({ suchbegriff: "Informatiker" });
    expect(ergebnis.ausgeschlosseneStellen?.nurFuerDich).not.toMatch(/erneut aufrufen/);
    expect(ergebnis.ausgeschlosseneStellen?.nurFuerDich).not.toMatch(/ohneAngabe/);
  });

  it("nennt die Filter, die erst nach der Abfrage wirken", async () => {
    messung({ nichtEingerechnet: ["alter"] });
    const ergebnis = await listJobs({ vertragsarten: ["Soldatin / Soldat auf Zeit"], alter: 45 });
    expect(ergebnis.ausgeschlosseneStellen?.nichtEingerechnet).toEqual(["alter"]);
    expect(ergebnis.ausgeschlosseneStellen?.nurFuerDich).toMatch(/zu hoch/);
  });

  // Kein Alarm ohne Anlass.
  it("schweigt, wenn nichts ausgeschlossen wurde", async () => {
    const ergebnis = await listJobs({ vertragsarten: ["Soldatin / Soldat auf Zeit"] });
    expect(ergebnis.ausgeschlosseneStellen).toBeUndefined();
  });

  /**
   * EIGENES FELD statt eines weiteren `hinweis`: der Ausschluss trifft auf fast
   * jede gefilterte Suche zu und wuerde die situativen Hinweise (Leerfall,
   * Lesedeckel) sonst dauerhaft verdraengen - die zeigen auf eine Handlung und
   * sind dringender. Ausserdem sind das Zahlen, keine Regieanweisung.
   */
  it("laesst den Hinweis auf abgeschnittene Treffer unberuehrt", async () => {
    messung();
    queryJobsMock.mockResolvedValue({
      results: [summary()],
      totalCount: 3000,
      gelesen: 3000,
      abgeschnitten: true,
    });
    const ergebnis = await listJobs({ vertragsarten: ["Soldatin / Soldat auf Zeit"] });
    expect(ergebnis.hinweis?.nurFuerDich).toMatch(/eingrenzen/);
    expect(ergebnis.hinweis?.nurFuerDich).not.toMatch(/ohneAngabe/);
  });

  // Nur an das Modell: "dein Ergebnis ist unvollstaendig" hilft dem Bewerber
  // nicht, die zweite Suche muss die KI machen.
  it("traegt keine Bewerberhaelfte", async () => {
    messung();
    const ergebnis = await listJobs({ vertragsarten: ["Soldatin / Soldat auf Zeit"] });
    expect(JSON.stringify(ergebnis.ausgeschlosseneStellen)).not.toMatch(/fuerDenBewerber/);
  });

  // Die Zaehlung startet, BEVOR die Hauptabfrage fertig ist - sonst kostet sie
  // eine zusaetzliche Wartezeit auf dem haeufigsten Aufruf des Servers.
  it("bekommt die Trefferzahl als noch laufendes Promise", async () => {
    messung();
    await listJobs({ vertragsarten: ["Soldatin / Soldat auf Zeit"] });
    expect(zaehleAusschluesseMock.mock.calls[0][1]).toBeInstanceOf(Promise);
  });
});

// Ohne diesen Filter: Region genannt, Stadt gefordert, Antwort "es gibt
// nichts". Das Bundesland liefert die API frei mit.
describe("listJobs — Bundesland", () => {
  it("uebersetzt den Bundeslandnamen in den Code der API", async () => {
    await listJobs({ bundesland: ["Brandenburg"] });
    expect(queryJobsMock).toHaveBeenCalledWith(expect.objectContaining({ bundesland: ["12"] }));
  });

  it("gibt das Bundesland im Klartext zurueck, nicht als Code", async () => {
    queryJobsMock.mockResolvedValue({ results: [summary({ region: "12" })], totalCount: 1, gelesen: 1 });
    expect((await listJobs({})).results[0].bundesland).toBe("Brandenburg");
  });

  it("laesst das Feld leer, wenn die Stelle kein Bundesland traegt", async () => {
    queryJobsMock.mockResolvedValue({ results: [summary({ region: "" })], totalCount: 1, gelesen: 1 });
    expect((await listJobs({})).results[0].bundesland).toBe("");
  });
});

/**
 * Der Fall, den weder Wortanfaenge noch Grundwoerter loesen: das gesuchte Wort
 * kommt in KEINEM Titel vor, etwa "Roentgen", "Kampfjet", "Reparatur" oder
 * "Akten". Uebersetzen kann nur die anfragende KI -
 * aber nur, wenn sie sieht, welche Woerter es stattdessen gibt.
 */
describe("listJobs — Vokabular bei null Treffern", () => {
  const leer = { results: [], totalCount: 0, gelesen: 0 };

  it("liefert die vorhandenen Titelwoerter, wenn ein Filter den Bereich eingrenzt", async () => {
    queryJobsMock
      .mockResolvedValueOnce(leer)
      .mockResolvedValueOnce({ results: [summary({ title: "Radiologie Assistentin" }), summary({ title: "Radiologie Fachkraft" })], totalCount: 2, gelesen: 2 });

    const ergebnis = await listJobs({ suchbegriff: "Röntgen", wunschort: "Koblenz" });
    expect(ergebnis.totalCount).toBe(0);
    expect(ergebnis.vorhandeneTitelwoerter?.[0]).toEqual({ wort: "radiologie", anzahl: 2 });
  });

  it("fragt die Stichprobe ohne den Suchbegriff ab - sonst waere sie wieder leer", async () => {
    queryJobsMock.mockResolvedValueOnce(leer).mockResolvedValueOnce(leer);
    await listJobs({ suchbegriff: "Röntgen", wunschort: "Koblenz" });
    const stichprobe = queryJobsMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(stichprobe.suchbegriff).toBeUndefined();
    expect(stichprobe.wunschort).toBe("Koblenz");
  });

  // Ohne eingrenzenden Filter waere die Stichprobe ein beliebiger Ausschnitt aus
  // dem ganzen Bestand - die haeufigsten Woerter waeren "einstellung" und
  // "feldwebel": richtig, aber fuer den Bewerber wertlos.
  it("liefert kein Vokabular ohne weiteren Filter", async () => {
    queryJobsMock.mockResolvedValue(leer);
    const ergebnis = await listJobs({ suchbegriff: "Röntgen" });
    expect(ergebnis.vorhandeneTitelwoerter).toBeUndefined();
    expect(queryJobsMock).toHaveBeenCalledTimes(1);
  });

  // Ein Zusatz darf die Antwort nie kosten.
  it("behaelt den Hinweis, wenn die Stichprobe scheitert", async () => {
    queryJobsMock.mockResolvedValueOnce(leer).mockRejectedValueOnce(new Error("kein Index"));
    const ergebnis = await listJobs({ suchbegriff: "Röntgen", wunschort: "Koblenz" });
    expect(ergebnis.vorhandeneTitelwoerter).toBeUndefined();
    expect(ergebnis.hinweis?.nurFuerDich).toBeTruthy();
  });
});

/**
 * Ohne Vermerk gibt ein Client "Verpflichtungszeit 8 bis 13 Jahre" und
 * "Altersgrenze 49" aus der Trefferliste an den Bewerber weiter und schreibt
 * sie "der offiziellen Bundeswehr-Seite" zu. Die Zahlen sind richtig, die
 * Herkunft ist falsch dargestellt - in `get_job` steht der Vermerk am
 * `anforderungen`-Block, die Trefferliste braucht ihn ebenso.
 *
 * EINMAL JE ANTWORT, nicht je Treffer: die Liste geht bei jeder Suche ueber die
 * Leitung, 50 gleichlautende Vermerke waeren Verschwendung.
 */
describe("listJobs — Herkunft der abgeleiteten Felder", () => {
  const mitAbgeleiteterAngabe = () => {
    queryJobsMock.mockResolvedValue({
      results: [summary({ jobAttributes: { dienstgrad: "Hauptmann", hoechstalter: 49 } })],
      totalCount: 1,
      gelesen: 1,
    });
  };

  it("vermerkt einmal an der Antwort, welche Felder nicht amtlich sind", async () => {
    mitAbgeleiteterAngabe();
    const ergebnis = await listJobs({});
    const vermerk = ergebnis.herkunftDerAngaben?.nurFuerDich ?? "";
    for (const feld of [
      "dienstgrad",
      "besoldung",
      "mindestalter",
      "hoechstalter",
      "verpflichtungsdauer",
      "seiteneinstiegLautText",
    ]) {
      expect(vermerk, feld).toContain(feld);
    }
    expect(vermerk).toMatch(/nicht amtlich/i);
    expect(vermerk).toMatch(/belegstelle/);
    expect(vermerk).toMatch(/get_job/);
    // Genau dieser Fehler: Zuschreibung an "die Bundeswehr-Seite".
    expect(vermerk).toMatch(/Bundeswehr/);
  });

  it("haengt den Vermerk nicht an jeden einzelnen Treffer", async () => {
    mitAbgeleiteterAngabe();
    const entry = (await listJobs({})).results[0] as Record<string, unknown>;
    expect(entry).not.toHaveProperty("herkunftDerAngaben");
    expect(entry).not.toHaveProperty("hinweis");
  });

  it("gibt dem Bewerber einen Satz ohne Feldnamen mit", async () => {
    mitAbgeleiteterAngabe();
    const fuerDenBewerber = (await listJobs({})).herkunftDerAngaben?.fuerDenBewerber ?? "";
    expect(fuerDenBewerber).toMatch(/Ausschreibung/);
    expect(fuerDenBewerber).not.toMatch(/`/);
  });

  // Der Grund fuer ein eigenes Feld statt eines weiteren `hinweis`: dieser
  // Vermerk trifft bei JEDER Suche zu und wuerde die situativen Hinweise
  // (Leerfall, Lesedeckel) dauerhaft verdraengen.
  it("laesst den situativen Hinweis unberuehrt", async () => {
    queryJobsMock.mockResolvedValue({
      results: [summary({ jobAttributes: { hoechstalter: 42 } })],
      totalCount: 3000,
      gelesen: 3000,
      abgeschnitten: true,
    });
    const ergebnis = await listJobs({ mindestbesoldung: 11 });
    expect(ergebnis.hinweis?.nurFuerDich).toMatch(/eingrenzen/);
    expect(ergebnis.hinweis?.nurFuerDich).not.toMatch(/nicht amtlich/i);
    expect(ergebnis.herkunftDerAngaben?.nurFuerDich).toMatch(/nicht amtlich/i);
  });

  it("schweigt, wenn keine der abgeleiteten Angaben in der Liste steht", async () => {
    const ergebnis = await listJobs({});
    expect(ergebnis.results).toHaveLength(1);
    expect(ergebnis.herkunftDerAngaben).toBeUndefined();
  });

  it("schweigt bei leerer Trefferliste", async () => {
    queryJobsMock.mockResolvedValue({ results: [], totalCount: 0, gelesen: 0 });
    expect((await listJobs({ suchbegriff: "Panzerkommandant" })).herkunftDerAngaben).toBeUndefined();
  });
});

/**
 * WOZU: Die Trefferzeile hat den Volltext nicht (er liegt in einer eigenen
 * Subcollection, und ihn nachzuladen kostete je Treffer einen Read). Ob "leer"
 * hier "jederzeit" heisst, weiss erst get_job - aber ein nacktes "" darf der
 * Client nicht als "abgelaufen" oder "keine Frist" weitergeben.
 */
describe("listJobs — leerer Bewerbungsschluss", () => {
  it("erklaert ein leeres applicationEnd und verweist fuer die Einzelstelle auf get_job", async () => {
    queryJobsMock.mockResolvedValue({ results: [summary({ applicationEnd: "" })], totalCount: 1, gelesen: 1 });
    const result = await listJobs({});
    expect(result.hinweis?.nurFuerDich).toMatch(/applicationEnd/);
    expect(result.hinweis?.nurFuerDich).toMatch(/get_job/);
    expect(result.hinweis?.fuerDenBewerber).toMatch(/Bewerbungsschluss/);
  });

  it("schweigt, wenn alle Treffer ein Datum tragen", async () => {
    const result = await listJobs({});
    expect(result.hinweis).toBeUndefined();
  });
});
