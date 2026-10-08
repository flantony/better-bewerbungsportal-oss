import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { buildOrtTokens, buildSuchTokens, haeufigeTitelwoerter, matchesRestTokens, planSuche } from "./suchTokens";

describe("buildSuchTokens", () => {
  it("zerlegt an Bindestrichen und Schraegstrichen", () => {
    const tokens = buildSuchTokens("IT-System-Elektronikerin / IT-System-Elektroniker (m/w/d)");
    expect(tokens).toContain("it");
    expect(tokens).toContain("system");
    expect(tokens).toContain("elektroniker");
  });

  // Das Kurzwort "IT" darf NICHT mitten in einem anderen Wort matchen, sonst
  // trifft es fast jede Stelle.
  it("erzeugt kein 'it' fuer Arbeitszeit oder Truppenversorgungsbearbeiter", () => {
    expect(buildSuchTokens("Truppenversorgungsbearbeiter/-in SK (m/w/d)")).not.toContain("it");
    expect(buildSuchTokens("Militärisches Nachrichtenwesen Feldwebel")).not.toContain("it");
  });

  // Deutsche Komposita: Suche nach dem Wortanfang muss greifen.
  it("legt Praefixe ab, damit 'software' auch 'softwareentwickler' findet", () => {
    const tokens = buildSuchTokens("Softwareentwicklerin / Softwareentwickler");
    expect(tokens).toContain("software");
    expect(tokens).toContain("softwareentwickler");
  });

  it("laesst Geschlechts- und Fuellwoerter weg", () => {
    const tokens = buildSuchTokens("Koch (m/w/d) und Köchin für die Marine");
    expect(tokens).not.toContain("m");
    expect(tokens).not.toContain("w");
    expect(tokens).not.toContain("und");
    expect(tokens).toContain("marine");
  });

  /**
   * DIE ANDERE HAELFTE DES KOMPOSITUMS. Praefixe allein decken nur die Faelle,
   * in denen das gesuchte Wort VORNE steht ("Software" -> "Softwareentwickler").
   * Deutsch haengt das Grundwort aber hinten an, und genau das ist das Wort,
   * das ein Bewerber benutzt: "Fahrer", "Sanitaeter", "Pflege".
   *
   * Ohne Grundwoerter findet "Fahrer" keine Kraftfahrer-Stelle und
   * "Sanitaeter" keinen Notfallsanitaeter - der Bewerber hoert "dazu gibt es
   * nichts" auf eine Stelle, die es vielfach gibt.
   */
  it("findet das Grundwort: 'fahrer' auch in 'kraftfahrer'", () => {
    const tokens = buildSuchTokens("Kraftfahrerin / Kraftfahrer (m/w/d)");
    expect(tokens).toContain("fahrer");
    expect(tokens).toContain("fahrerin");
    expect(tokens).toContain("kraftfahrer");
  });

  it("findet das Grundwort auch in laengeren Komposita", () => {
    expect(buildSuchTokens("Notfallsanitäterin / Notfallsanitäter (m/w/d)")).toContain("sanitäter");
    expect(buildSuchTokens("Pflegefachkraft Intensivpflege")).toContain("pflege");
    expect(buildSuchTokens("Fachärztin/-arzt für Thoraxchirurgie")).toContain("chirurgie");
  });

  // Ab der Kompositionsfuge gilt dasselbe wie am Wortanfang: ein Wortanfang
  // ab vier Zeichen genuegt. Die Weboberflaeche sucht beim Tippen - "Fahr"
  // steht dort, bevor "Fahrer" dasteht.
  it("laesst das Grundwort wie ein eigenes Wort anfangen", () => {
    expect(buildSuchTokens("Kraftfahrer (m/w/d)")).toContain("fahr");
    expect(buildSuchTokens("Notfallsanitäter (m/w/d)")).toContain("sanität");
  });

  /**
   * WOZU: "Sport" darf nicht "Transport" treffen. Mit beliebigen Wortenden ab
   * fuenf Zeichen wird aus "transport" "sport", aus "Wilhelmshaven" "haven", aus
   * "Sachbearbeiter" "arbeiter". Ein Wortende ist nur dann ein Grundwort, wenn
   * es als solches bekannt ist; "trans|port" ist kein "tran|sport".
   */
  it("trifft 'sport' nicht in 'Transport'", () => {
    expect(buildSuchTokens("Helferin / Helfer Lagerwirtschaft / Transport (m/w/d)")).not.toContain("sport");
    expect(buildSuchTokens("Stabsoffizierin / Stabsoffizier Logistik, Transport, Materialbewirtschaftung(m/w/d)")).not.toContain("sport");
    expect(buildSuchTokens("Transportsoldat (m/w/d)")).not.toContain("sport");
  });

  it("findet 'sport' am Wortanfang und das Grundwort dahinter", () => {
    const tokens = buildSuchTokens("Sportsoldatin / Sportsoldat (m/w/d)");
    expect(tokens).toContain("sport");
    expect(tokens).toContain("soldat");
    expect(tokens).toContain("soldatin");
    expect(buildSuchTokens("Transportsoldat (m/w/d)")).toContain("soldat");
  });

  it("findet 'sanität' am Wortanfang, aber nicht mitten im Wort", () => {
    expect(buildSuchTokens("Sanitätsoffizierin / Sanitätsoffizier Arzt (m/w/d)")).toContain("sanität");
    expect(buildSuchTokens("Sachbearbeiter Zentralsanitätsdienst (m/w/d)")).not.toContain("sanität");
  });

  // Ein Unteroffizier ist kein Offizier - in der Bundeswehr zwei verschiedene
  // Laufbahnen. Das Wortende allein wuerde sie gleichsetzen.
  it("macht aus 'Unteroffizier' keinen 'Offizier'", () => {
    expect(buildSuchTokens("Stabsoffizierin / Stabsoffizier (m/w/d)")).toContain("offizier");
    expect(buildSuchTokens("Fachunteroffizierin / Fachunteroffizier (m/w/d)")).not.toContain("offizier");
    expect(buildSuchTokens("Transportunteroffizier (m/w/d)")).toContain("unteroffizier");
  });

  it("macht aus 'Sachbearbeiter' und 'Mitarbeiter' keinen 'Arbeiter'", () => {
    expect(buildSuchTokens("Sachbearbeiterin / Sachbearbeiter (m/w/d)")).not.toContain("arbeiter");
    expect(buildSuchTokens("Mitarbeiterin / Mitarbeiter (m/w/d)")).not.toContain("arbeiter");
    expect(buildSuchTokens("Lagerarbeiterin / Lagerarbeiter (m/w/d)")).toContain("arbeiter");
    expect(buildSuchTokens("Personalsachbearbeiter (m/w/d)")).toContain("sachbearbeiter");
  });

  // Die allgemeine Fassung: jedes Token beginnt an einem Wortanfang oder an
  // einer bekannten Kompositionsfuge. Bruchstuecke wie "nisch", "izinische"
  // oder "haven" gibt es nicht.
  it("erzeugt keine beliebigen Wortenden", () => {
    const tokens = buildSuchTokens("Veterinärmedizinisch-technische Assistentin");
    expect(tokens).not.toContain("nisch");
    expect(tokens).not.toContain("izinisch");
    expect(tokens).not.toContain("ische");
    expect(tokens).toContain("assistentin");
  });

  // Kurze Wortenden wuerden auf alles passen - die "IT"-Falle in der Gegenrichtung.
  it("erzeugt keine Wortenden, auch keine kurzen", () => {
    const tokens = buildSuchTokens("Sachbearbeiter");
    expect(tokens).not.toContain("iter");
    expect(tokens).not.toContain("ter");
    expect(tokens).not.toContain("er");
  });

  // Ein Bestimmungswort aus zwei Buchstaben waere Zufall, kein Kompositum.
  it("verlangt vor dem Grundwort ein Bestimmungswort von mindestens drei Buchstaben", () => {
    expect(buildSuchTokens("Kofahrer")).not.toContain("fahrer");
    expect(buildSuchTokens("Lkwfahrer")).toContain("fahrer");
    // Das Grundwort allein ist ein gewoehnliches Wort, keine Fuge.
    expect(buildSuchTokens("Feldwebel")).toEqual(["feldwebel", "feld", "feldw", "feldwe", "feldweb", "feldwebe"]);
  });

  it("kommt mit leeren Titeln klar", () => {
    expect(buildSuchTokens("")).toEqual([]);
  });

  // Die Grenze schuetzt die Dokumentgroesse.
  it("begrenzt die Tokenzahl", () => {
    const tokens = buildSuchTokens("Sachbearbeitung ".repeat(40));
    expect(tokens.length).toBeLessThanOrEqual(200);
  });
});

describe("buildOrtTokens", () => {
  // Ortsnamen werden nicht zerlegt: "Wilhelmshaven" ist kein Kompositum, nach
  // dessen Grundwort jemand sucht, und "haven" traefe auch "Bremerhaven".
  it("legt keine Wortenden ab", () => {
    const tokens = buildOrtTokens("Wilhelmshaven");
    expect(tokens).toContain("wilhelmshaven");
    expect(tokens).toContain("wilh");
    expect(tokens).not.toContain("haven");
    expect(tokens).not.toContain("shaven");
  });

  it("trennt an Bindestrichen und legt Praefixe ab", () => {
    const tokens = buildOrtTokens("Köln-Wahn");
    expect(tokens).toEqual(expect.arrayContaining(["köln", "wahn"]));
    expect(buildOrtTokens("München")).toContain("münch");
  });

  // Ein Ort, der zufaellig auf ein Grundwort endet, wird trotzdem nicht zerlegt.
  it("wendet die Grundwoerter der Titel nicht auf Orte an", () => {
    expect(buildOrtTokens("Bergmeister")).not.toContain("meister");
  });
});

describe("planSuche", () => {
  it("nimmt den laengsten Begriff in die Query", () => {
    // Firestore erlaubt nur ein array-contains - der trennschaerfste Begriff
    // gehoert hinein, der Rest wird nachgefiltert.
    expect(planSuche("IT Offizier")).toEqual({ queryToken: "offizier", restTokens: ["it"] });
  });

  it("nutzt bei einem Begriff keinen Nachfilter", () => {
    expect(planSuche("Marine")).toEqual({ queryToken: "marine", restTokens: [] });
  });

  it("gibt bei leerer Anfrage keinen Query-Token zurueck", () => {
    expect(planSuche("")).toEqual({ queryToken: null, restTokens: [] });
    expect(planSuche("  (m/w/d) ")).toEqual({ queryToken: null, restTokens: [] });
  });
});

describe("matchesRestTokens", () => {
  const tokens = buildSuchTokens("Einstellung Offizier Cyber/IT Teilbereich IT-Management");

  it("verlangt alle restlichen Begriffe", () => {
    expect(matchesRestTokens(tokens, ["it"])).toBe(true);
    expect(matchesRestTokens(tokens, ["it", "cyber"])).toBe(true);
    expect(matchesRestTokens(tokens, ["marine"])).toBe(false);
  });

  it("ist ohne Restbegriffe immer wahr", () => {
    expect(matchesRestTokens(tokens, [])).toBe(true);
  });
});

describe("haeufigeTitelwoerter", () => {
  /**
   * WOZU: Wenn "Röntgen" null Treffer hat, ist die nuetzliche Auskunft nicht
   * "nichts gefunden", sondern WELCHE Woerter es bei uns gibt. Woerter wie
   * Roentgen, Kampfjet, Reparatur oder Akten kommen in keinem Titel vor - dort
   * hilft keine Tokenisierung, nur echtes Vokabular, aus dem die anfragende KI
   * selbst uebersetzen kann.
   */
  it("zaehlt die haeufigsten Titelwoerter", () => {
    const woerter = haeufigeTitelwoerter(["Kraftfahrer (m/w/d)", "Kraftfahrer Panzer", "Koch (m/w/d)"], 5);
    expect(woerter[0]).toEqual({ wort: "kraftfahrer", anzahl: 2 });
    expect(woerter.map((w) => w.wort)).toContain("koch");
  });

  it("laesst Fuellwoerter weg und zaehlt einen Titel nur einmal je Wort", () => {
    const woerter = haeufigeTitelwoerter(["Koch und Köchin (m/w/d) - Koch"], 10);
    expect(woerter.map((w) => w.wort)).not.toContain("und");
    expect(woerter.find((w) => w.wort === "koch")?.anzahl).toBe(1);
  });

  // Nur ganze Woerter, keine Praefix-/Suffix-Bruchstuecke: das Vokabular geht an
  // ein Modell, das daraus lesen soll, wie die Bundeswehr etwas nennt.
  it("liefert keine Wortbruchstuecke", () => {
    const woerter = haeufigeTitelwoerter(["Softwareentwickler"], 20);
    expect(woerter.map((w) => w.wort)).toEqual(["softwareentwickler"]);
  });

  it("begrenzt auf die gewuenschte Anzahl", () => {
    expect(haeufigeTitelwoerter(["Alpha Beta Gamma Delta Epsilon"], 3)).toHaveLength(3);
  });
});

describe("haeufigeTitelwoerter — Rauschen", () => {
  // Der gefilterte Ort steht in jedem Titel des Ausschnitts und sagt dem
  // Client nichts: nach ihm wurde ja gerade gefiltert.
  it("laesst ausgeschlossene Woerter weg", () => {
    const woerter = haeufigeTitelwoerter(["Bürokraft Koblenz", "Sanitäter Koblenz"], 5, ["Koblenz"]);
    expect(woerter.map((w) => w.wort)).not.toContain("koblenz");
    expect(woerter.map((w) => w.wort)).toContain("sanitäter");
  });

  it("laesst reine Zahlen weg", () => {
    expect(haeufigeTitelwoerter(["Ausbildung 2027", "Ausbildung 2026"], 5).map((w) => w.wort)).toEqual(["ausbildung"]);
  });
});

describe("Spiegel in der Weboberflaeche", () => {
  /**
   * Die Stellenliste filtert im Browser mit einer Kopie dieser Regel
   * (web/src/features/jobs/lib/titel-suche.ts, eigenes Paket). Laufen
   * Grundwoerter, Endungen oder Grenzen auseinander, findet ein Bewerber im
   * Browser andere Stellen als seine KI ueber list_jobs - und keiner merkt es.
   */
  const hier = readFileSync(resolve(__dirname, "suchTokens.ts"), "utf8");
  const web = readFileSync(resolve(__dirname, "../../../web/src/features/jobs/lib/titel-suche.ts"), "utf8");

  function block(quelle: string, anfang: string, ende: string): string {
    const start = quelle.indexOf(anfang);
    expect(start, anfang).toBeGreaterThanOrEqual(0);
    return quelle.slice(start + anfang.length, quelle.indexOf(ende, start + anfang.length));
  }

  function grundwoerter(quelle: string): string[] {
    const liste = block(quelle, "GRUNDWOERTER: Grundwort[] = [", "\n];");
    const eintraege = [...liste.matchAll(/\{\s*wort:\s*["']([^"']+)["'](?:,\s*nichtNach:\s*\[([^\]]*)\])?\s*\}/g)];
    // Jeder Eintrag muss vom Muster erfasst sein - sonst fiele ein anders
    // formatierter in beiden Dateien still heraus.
    expect(eintraege.length).toBe((liste.match(/wort:/g) ?? []).length);
    return eintraege.map(([, wort, nichtNach]) => `${wort}|${(nichtNach ?? "").replace(/["'\s]/g, "")}`);
  }

  function zeichenketten(quelle: string, anfang: string): string[] {
    return [...block(quelle, anfang, "]").matchAll(/["']([^"']*)["']/g)].map(([, wert]) => wert);
  }

  function zahl(quelle: string, name: string): number {
    const treffer = new RegExp(`const ${name} = (\\d+);`).exec(quelle);
    expect(treffer, name).not.toBeNull();
    return Number(treffer![1]);
  }

  it("fuehrt dieselben Grundwoerter", () => {
    expect(grundwoerter(hier).length).toBeGreaterThan(20);
    expect(grundwoerter(web)).toEqual(grundwoerter(hier));
  });

  it("fuehrt dieselben Endungen, Fuellwoerter und Grenzen", () => {
    expect(zeichenketten(web, "const ENDUNGEN = [")).toEqual(zeichenketten(hier, "const ENDUNGEN = ["));
    expect(zeichenketten(web, "const STOPP = new Set([")).toEqual(zeichenketten(hier, "const STOPP = new Set(["));
    expect(zahl(web, "MIN_BESTIMMUNGSWORT")).toBe(zahl(hier, "MIN_BESTIMMUNGSWORT"));
  });
});
