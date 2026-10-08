import { describe, it, expect } from "vitest";
import { baueKiSeite, begriffeInText, istGueltigePinstGuid, type KiSeiteWissen } from "./kiSeite";
import { bewerbungsablaufMarkdown } from "./mcp/knowledge/bewerbungsablauf";
import { parseRueckgabeblock } from "./konto/rueckgabeblock";
import { ersetzePlatzhalter, findePlatzhalter } from "./lib/platzhalter";
import type { DocumentRequirementsResult, BewerbungsbogenInfo } from "./mcp/tools/getDocumentRequirements";
import type { GlossaryTerm, JobRecord } from "./types";
import { BEWERBUNGSPORTAL_URL } from "./lib/einreichen";

const PINST_GUID = "FA163EC863931FD0B784040D13DA0705";

function job(over: Record<string, unknown> = {}): JobRecord {
  return {
    pinstGuid: PINST_GUID,
    refCode: "REF-2026-0042",
    title: "IT-Administrator (m/w/d)",
    contractTypeLabel: "Unbefristet",
    besOrt: "Bonn",
    region: "05",
    applicationEnd: "31.12.2026",
    active: true,
    companyDesc: "<p>Die Bundeswehr betreibt IT-Systeme im gesamten Bundesgebiet.</p>",
    jobDesc: "<p>Administration von <strong>Servern</strong> und Netzwerken.</p><ul><li>Betrieb</li><li>Wartung</li></ul>",
    requireDesc: "<p>Abgeschlossene IT-Ausbildung.</p>",
    remarcDesc: "",
    // WOZU: contactDesc traegt den Namen der Ansprechperson - die eine Angabe,
    // die diese Seite unter KEINEN Umstaenden ausgeben darf (s. instructions.ts).
    contactDesc: "<p>Ansprechpartner: Herr Mueller-Testmann, Tel. 0221-1234567</p>",
    ...over,
  } as unknown as JobRecord;
}

function anforderungen(over: Partial<DocumentRequirementsResult> = {}): DocumentRequirementsResult {
  return {
    documents: [],
    bewerbungsboegen: [],
    bewerbungsbogen: null,
    selbstAuszufuellen: [],
    geforderteUnterlagen: ["Lebenslauf", "Zeugniskopien"],
    unterlagenHinweise: "",
    ...over,
  };
}

function bogen(over: Partial<BewerbungsbogenInfo> = {}): BewerbungsbogenInfo {
  return {
    attHeader: "Bewerbungsbogen_Militärisch",
    docId: "doc1",
    downloadUrl: "https://storage.googleapis.com/better-bewerbungsportal/jobDocuments/abc.pdf",
    contentType: "application/pdf",
    sizeBytes: 1000,
    family: "militaerisch",
    ausfuellbar: true,
    benoetigteAngaben: ["nachname", "vorname"],
    ...over,
  };
}

function wissen(over: Partial<KiSeiteWissen> = {}): KiSeiteWissen {
  return {
    bewerbungsablauf:
      "# Wie eine Bewerbung abläuft\n\n## Der Ablauf\n\n1. Ausschreibung finden.\n2. Bewerbung einreichen.\n\n" +
      "## Quellen\n\n- https://www.bundeswehrkarriere.de/\n\n> Nicht amtlich.\n",
    glossar: [],
    ...over,
  };
}

const GLOSSAR_FIXTURE: GlossaryTerm[] = [
  { term: "Verwendungsreihe", slug: "verwendungsreihe", definition: "Berufliche Spezialisierung.", aliases: [] },
  { term: "Portepee", slug: "portepee", definition: "Degenquaste höherer Unteroffiziere.", aliases: [] },
];

describe("baueKiSeite — DSGVO/Sicherheit", () => {
  /** WOZU: contactDesc trägt den Namen der Ansprechperson - genau das darf keine
   *  öffentlich abrufbare Seite je ausgeben (s. instructions.ts HANDOFF). */
  it("gibt niemals den Inhalt von contactDesc aus", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen());
    expect(seite).not.toMatch(/Mueller-Testmann/);
    expect(seite).not.toMatch(/0221-1234567/);
    expect(seite).toMatch(/die in der Ausschreibung genannte Ansprechperson/);
  });

  it("enthält kein HTML - die Volltextfelder sind HTML, die Seite ist Klartext", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen());
    expect(seite).not.toMatch(/<[a-z][^>]*>/i);
    expect(seite).toMatch(/Administration von Servern/);
  });

  // Genau eine Bundeswehr-Adresse steht drin: das Bewerbungsportal,
  // das die Ausschreibungen selbst nennen (lib/einreichen.ts). Erfunden wird keine.
  it("nennt keine erfundene Bundeswehr-URL - nur better-bewerbungsportal.de, Anhangslinks und das Portal", () => {
    const seite = baueKiSeite(job(), anforderungen({ bewerbungsboegen: [bogen()] }), wissen());
    const urls = seite.match(/https?:\/\/[^\s)]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const bereinigt = url.replace(/[).,]+$/, "");
      const erlaubt =
        bereinigt.includes("better-bewerbungsportal.de") ||
        bereinigt.startsWith("https://storage.googleapis.com/") ||
        bereinigt === BEWERBUNGSPORTAL_URL;
      expect(erlaubt).toBe(true);
    }
    // Die Quellenliste des Ablauf-Registers traegt einen echten Bundeswehr-Link -
    // der muss beim Einbetten herausfallen (s. alsUnterabschnitt).
    expect(seite).not.toMatch(/bundeswehrkarriere\.de/);
  });

  /**
   * WOZU: derselbe Check gegen den ECHTEN Registertext, nicht nur die
   * Test-Fixture oben - die Quellenliste in `bewerbungsablauf.ts` kann sich
   * ändern, ohne dass jemand an diesen Test denkt.
   */
  it("filtert die Bundeswehr-Quellenlinks auch aus dem echten Ablauf-Register (Chat-Kanal)", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen({ bewerbungsablauf: bewerbungsablaufMarkdown("chat") }));
    expect(seite).not.toMatch(/bundeswehrkarriere\.de|bundeswehr\.de\//);
  });

  /**
   * WOZU: `bewerbungsablaufMarkdown()` (ohne Kanal) ist fuer MCP-Clients
   * geschrieben - "Dieser Server", Werkzeugnamen, interne Feldnamen in
   * Backticks. Eine Seite ohne MCP-Verbindung kann keins davon aufrufen, und
   * `contactDesc` als Wort laedt dazu ein, nach dem Namen der Ansprechperson
   * zu suchen. `baueKiSeite` muss deshalb IMMER den "chat"-Kanal verwenden -
   * dieser Test faellt durch, sobald kiSeite.ts den MCP-Standardtext
   * einbettet.
   */
  it("bettet den chat-Kanal ein, nie den MCP-Text mit Werkzeugnamen und internen Feldern", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen({ bewerbungsablauf: bewerbungsablaufMarkdown("chat") }));
    for (const verboten of ["get_document_requirements", "fuelle_formular", "contactDesc", "applicationEnd", "Dieser Server"]) {
      expect(seite).not.toContain(verboten);
    }
  });

  // Eine KI liest "Automatisch ausfüllbar: ja" als eigene Faehigkeit und
  // bietet an, den Bogen selbst auszufuellen.
  it("verspricht der Chat-KI nicht, das PDF-Formular selbst ausfuellen zu koennen", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen());
    expect(seite).not.toContain("Automatisch ausfüllbar");
    expect(seite).toContain("Das PDF-Formular selbst kannst du hier nicht ausfüllen");
  });

  // Ohne diese Liste fragt eine KI nach dem Geburtsort, fuer den der Bogen kein Feld hat.
  it("nennt die Angaben, nach denen nicht gefragt werden soll", () => {
    const seite = baueKiSeite(
      job(),
      anforderungen({ bewerbungsboegen: [bogen({ nichtVerwendeteAngaben: ["geburtsort", "fuehrerschein"] })] }),
      wissen(),
    );
    expect(seite).toContain("**Nicht erfragen** (dieser Bogen hat kein Feld dafür): Geburtsort, Führerschein");
  });
});

describe("baueKiSeite — Kopf und Unabhängigkeit", () => {
  it("nennt sich unabhängig von der Bundeswehr und ohne Bewerberdaten", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen()).replace(/\s+/g, " ");
    expect(seite).toMatch(/privates Projekt von Florian Antony/);
    expect(seite).toMatch(/nicht von der Bundeswehr/);
    expect(seite).toMatch(/keine Daten von Bewerbern/);
    expect(seite).toMatch(/Kontaktangaben der Ansprechpersonen lassen wir weg/);
  });

  // Weggelassen wird nur contactDesc - die
  // Freitexte koennen Namen tragen. Die Seite darf also nicht pauschal "keine
  // personenbezogenen Daten von Ansprechpersonen" behaupten.
  it("behauptet nicht pauschal, frei von personenbezogenen Daten zu sein", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen());
    expect(seite).not.toMatch(/keine personenbezogenen Daten/);
  });
});

/**
 * WOZU: kann eine KI nicht pruefen, wer die Seite betreibt, raet sie davon
 * ab, dort persoenliche Daten einzugeben.
 */
describe("baueKiSeite — Betreiber", () => {
  it("nennt Betreiber, Kontakt und Impressum im Kopf", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen());
    const kopf = seite.slice(0, seite.indexOf("## So hilfst du")).replace(/\s+/g, " ");
    expect(kopf).toContain("Better Bewerbungsportal ist ein privates Projekt von Florian Antony");
    expect(kopf).toContain("Kontakt: florian.antony@mailbox.org");
    expect(kopf).toContain("Impressum: https://better-bewerbungsportal.de/impressum");
    expect(kopf).toMatch(/nicht von der Bundeswehr/);
  });

  it("nennt den Betreiber auch auf der Seite einer geschlossenen Stelle", () => {
    const seite = baueKiSeite(job({ active: false }), anforderungen(), wissen());
    expect(seite).toContain("https://better-bewerbungsportal.de/impressum");
  });
});

describe("baueKiSeite — archivierte Stelle", () => {
  it("stoppt nach dem Hinweis 'geschlossen', ohne Formulare oder Rückgabeformat zu zeigen", () => {
    const seite = baueKiSeite(job({ active: false }), anforderungen({ bewerbungsboegen: [bogen()] }), wissen());
    expect(seite).toMatch(/geschlossen/i);
    expect(seite).toMatch(/nicht mehr möglich/);
    expect(seite).not.toMatch(/Rückgabeformat/);
    expect(seite).not.toMatch(/## Formulare/);
    // Der Unabhaengigkeits-Kopf bleibt auch im Kurzfall stehen.
    expect(seite).toMatch(/privates Projekt von Florian Antony/);
  });
});

/** Rueckgabeblock und Platzhalter gibt es nur mit Paketseite (Funktionsschalter BEWERBERDATEN_IM_KONTO an). */
const MIT_PAKETSEITE = { gefuehrteBewerbung: true };

describe("baueKiSeite — Rückgabeblock", () => {
  it("enthält die Marker-Vorlage, die konto/rueckgabeblock.ts parst", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen(), MIT_PAKETSEITE);
    expect(seite).toMatch(/=== BEWERBUNG:ANSCHREIBEN ===/);
    expect(seite).toMatch(/=== BEWERBUNG:LEBENSLAUF ===/);
    expect(seite).toMatch(/=== ENDE ===/);
  });

  /**
   * WOZU: die Vorlage auf der Seite ist nur eine Beschreibung mit Platzhaltern -
   * dieser Test baut einen ECHTEN Beispielblock im selben Format und lässt ihn
   * vom tatsächlichen Parser laufen. Nur so ist belegt, dass Seite und Parser
   * wirklich dieselben Marker meinen.
   */
  it("rundtrip: ein Beispielblock im Seitenformat wird korrekt geparst", () => {
    const beispiel = [
      "=== BEWERBUNG:ANSCHREIBEN ===",
      "Sehr geehrte Damen und Herren,",
      "hiermit bewerbe ich mich um die ausgeschriebene Stelle.",
      "=== BEWERBUNG:LEBENSLAUF ===",
      "Max Mustermann",
      "Berufserfahrung: ...",
      "=== ENDE ===",
    ].join("\n");

    const ergebnis = parseRueckgabeblock(beispiel);
    expect(ergebnis.anschreiben).toMatch(/Sehr geehrte Damen und Herren/);
    expect(ergebnis.lebenslauf).toMatch(/Max Mustermann/);
    expect(ergebnis.unbekannteAbschnitte).toEqual([]);
  });
});

/**
 * WOZU: ohne Adresse schreibt eine KI "[Adresse]", "[PLZ Ort]" usw. in den
 * Briefkopf - frei gewaehlte Namen. Die Seite bittet deshalb um genau die
 * Namen, die die Paketseite aus dem Konto einsetzt.
 */
describe("baueKiSeite — Platzhalter fuer fehlende persoenliche Angaben", () => {
  const rueckgabeAbschnitt = (seite: string) => seite.slice(seite.indexOf("## Rückgabeformat"));

  it("nennt die vier Platzhalter fuer den Briefkopf und sagt, wer sie einsetzt", () => {
    const abschnitt = rueckgabeAbschnitt(baueKiSeite(job(), anforderungen(), wissen(), MIT_PAKETSEITE));
    for (const name of ["[Adresse]", "[PLZ Ort]", "[Telefon]", "[E-Mail]"]) {
      expect(abschnitt).toContain(name);
    }
    expect(abschnitt.replace(/\s+/g, " ")).toMatch(/die Paketseite setzt sie aus dem Konto ein/);
  });

  it("nennt nur Platzhalter, die die Paketseite auch tatsaechlich einsetzen kann", () => {
    const abschnitt = rueckgabeAbschnitt(baueKiSeite(job(), anforderungen(), wissen(), MIT_PAKETSEITE));
    const genannt = findePlatzhalter(abschnitt.slice(0, abschnitt.indexOf("Andere fehlende")));
    expect(genannt.length).toBeGreaterThanOrEqual(4);
    const voll = { vorname: "A", nachname: "B", telefon: "1", email: "e", strasse: "s", plz: "p", ort: "o" };
    expect(ersetzePlatzhalter(genannt.join(" "), voll).offen).toEqual([]);
  });
});

/**
 * WOZU: dieselbe Stelle darf nicht hier "keine Angabe", auf der Paketseite
 * "nicht angegeben" und im Paket "keiner" heissen.
 */
describe("baueKiSeite — Bewerbungsschluss", () => {
  it("sagt 'keiner', wenn der Text die Bewerbung jederzeit zulaesst", () => {
    const seite = baueKiSeite(
      job({ applicationEnd: "", companyDesc: "<p>Bewerbung und Einstellung jederzeit möglich</p>" }),
      anforderungen(),
      wissen(),
    );
    expect(seite).toContain("**Bewerbungsschluss:** keiner, Bewerbung jederzeit möglich");
  });

  it("verweist an die Karriereberatung, wenn weder Datum noch Aussage da sind", () => {
    const seite = baueKiSeite(job({ applicationEnd: "" }), anforderungen(), wissen());
    expect(seite).toContain("**Bewerbungsschluss:** nicht genannt, im Zweifel bei der Karriereberatung nachfragen");
  });

  it("nennt ein vorhandenes Datum", () => {
    expect(baueKiSeite(job(), anforderungen(), wissen())).toContain("**Bewerbungsschluss:** 31.12.2026");
  });
});

describe("baueKiSeite — Glossar nur passend zur Stelle", () => {
  it("listet nur Begriffe, die im Text dieser Stelle tatsächlich vorkommen", () => {
    const seite = baueKiSeite(
      job({ jobDesc: "<p>Arbeiten in der Verwendungsreihe Systemtechnik.</p>" }),
      anforderungen(),
      wissen({ glossar: GLOSSAR_FIXTURE }),
    );
    expect(seite).toMatch(/Verwendungsreihe/);
    expect(seite).not.toMatch(/Portepee/);
  });

  it("begriffeInText findet nichts, wenn kein Begriff im Text vorkommt", () => {
    expect(begriffeInText(GLOSSAR_FIXTURE, "Ein Text ohne jeden Fachbegriff.")).toEqual([]);
  });
});

describe("istGueltigePinstGuid", () => {
  it("akzeptiert 32 Hex-Zeichen", () => {
    expect(istGueltigePinstGuid(PINST_GUID)).toBe(true);
  });

  it("lehnt alles andere ab", () => {
    expect(istGueltigePinstGuid("")).toBe(false);
    expect(istGueltigePinstGuid("nicht-hex-und-zu-kurz")).toBe(false);
    expect(istGueltigePinstGuid(`${PINST_GUID}00`)).toBe(false);
  });
});

// WOZU: die Webseite prueft die Kennung aus der URL mit einer eigenen Kopie
// (web/src/lib/pinst-guid.ts, kein gemeinsames Paket), bevor sie Firestore
// liest. Weichen beide ab, findet /k/{id} oder die Stellenseite echte Stellen
// nicht - oder liest mit beliebigen Kennungen.
describe("istPinstGuid im Web", () => {
  it("entscheidet wie istGueltigePinstGuid", async () => {
    const { istPinstGuid } = await import("../../web/src/lib/pinst-guid");
    for (const id of [PINST_GUID, PINST_GUID.toLowerCase(), "", "nicht-hex-und-zu-kurz", `${PINST_GUID}00`, `../${PINST_GUID.slice(3)}`]) {
      expect(istPinstGuid(id)).toBe(istGueltigePinstGuid(id));
    }
  });
});

/**
 * WOZU: "offizielles Portal ... Kennung suchen" braucht
 * eine Adresse, Anschreiben duerfen nicht alle gleich klingen, "Vertragsart:
 * keine Angabe" darf nicht neben einem Text stehen, der "Soldat auf Zeit, 3 bis
 * 13 Jahre" sagt, und Anlage 1 zum Bewerbungsbogen muss auf der Seite vorkommen.
 */
describe("baueKiSeite — Einreichweg, Anschreiben-Vorgaben, Vertragsart und Vordrucke", () => {
  it("nennt den Einreichweg mit Portaladresse und Kennung", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen()).replace(/\s+/g, " ");
    expect(seite).toContain(BEWERBUNGSPORTAL_URL);
    expect(seite).toContain("über ihre Kennung REF-2026-0042");
    expect(seite).toMatch(/hochladen/);
  });

  it("gibt fuer das Anschreiben eigene Worte, Ort/Datum, Adressat und Versetzbarkeit vor", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen()).replace(/\s+/g, " ");
    expect(seite).toMatch(/eigenen Worten/);
    expect(seite).toMatch(/konkreten Beispielen/);
    expect(seite).toMatch(/Floskeln/);
    expect(seite).toMatch(/Ort und Datum/);
    expect(seite).toMatch(/Karriereberatung/);
    expect(seite).toMatch(/keine erfundene Abteilung/);
    expect(seite).toMatch(/bundesweit/);
    expect(seite).toMatch(/Versetzbarkeit/);
  });

  it("faellt bei fehlender Vertragsart auf den Ausschreibungstext zurueck", () => {
    const seite = baueKiSeite(
      job({
        contractTypeLabel: null,
        companyDesc: "<p>Sie werden Soldatin bzw. Soldat auf Zeit.</p>",
        jobAttributes: { verpflichtungsdauer: "3 bis 13 Jahre" },
      }),
      anforderungen(),
      wissen(),
    );
    expect(seite).toContain(
      "- **Vertragsart:** Soldatin/Soldat auf Zeit, Verpflichtungsdauer 3 bis 13 Jahre (laut Ausschreibungstext)",
    );
  });

  it("sagt 'keine Angabe', wenn weder Feld noch Text etwas hergeben", () => {
    const seite = baueKiSeite(job({ contractTypeLabel: null }), anforderungen(), wissen());
    expect(seite).toContain("- **Vertragsart:** keine Angabe");
  });

  it("nennt das amtliche Feld, wenn es gesetzt ist, ohne Zusatz", () => {
    const seite = baueKiSeite(job(), anforderungen(), wissen());
    expect(seite).toContain("- **Vertragsart:** Unbefristet\n");
  });

  it("nennt Vordrucke zum Selbst-Ausfuellen mit Link - und dass die KI sie nicht abfragt", () => {
    const seite = baueKiSeite(
      job(),
      anforderungen({
        bewerbungsboegen: [bogen()],
        selbstAuszufuellen: [
          {
            attHeader: "Anlage 1 zum Bewerbungsbogen",
            docId: "a1",
            downloadUrl: "https://storage.googleapis.com/better-bewerbungsportal/jobDocuments/a1.pdf",
          },
        ],
      }),
      wissen(),
    );
    const abschnitt = seite.slice(seite.indexOf("### Selbst ausfüllen und unterschreiben"));
    expect(abschnitt).toContain("Anlage 1 zum Bewerbungsbogen");
    expect(abschnitt).toContain("https://storage.googleapis.com/better-bewerbungsportal/jobDocuments/a1.pdf");
    expect(abschnitt.replace(/\s+/g, " ")).toMatch(/ihre Fragen nicht im Chat stellen/);
  });
});

/**
 * Funktionsschalter BEWERBERDATEN_IM_KONTO: ohne
 * gefuehrte Bewerbung darf die Seite weder dorthin verlinken noch ein im Paket
 * ausgefuelltes Formular versprechen.
 */
describe("baueKiSeite — gefuehrte Bewerbung je nach Funktionsschalter", () => {
  it("verlinkt ausgeschaltet nicht auf /dashboard/bewerben und verspricht kein Paket", () => {
    const seite = baueKiSeite(job(), anforderungen({ bewerbungsboegen: [bogen()] }), wissen(), {
      gefuehrteBewerbung: false,
    });
    expect(seite).not.toContain("/dashboard/bewerben/");
    expect(seite).not.toContain("Wird im Bewerbungspaket ausgefüllt");
    expect(seite).not.toContain("Ausgefüllt wird es über das Bewerbungspaket");
    // Ohne Paketseite liest niemand Marker ein und setzt keine Platzhalter aus dem Konto.
    expect(seite).not.toContain("Paketseite");
    expect(seite).not.toContain("=== BEWERBUNG:ANSCHREIBEN ===");
    expect(seite).not.toMatch(/aus dem Konto/);
    const flach = seite.replace(/\s+/g, " ");
    expect(flach).toMatch(/füllt die Formulare selbst aus/);
    expect(flach).toContain(`Checkliste zum Herunterladen auf https://better-bewerbungsportal.de/dashboard/jobs/${PINST_GUID}`);
  });

  it("verlinkt eingeschaltet auf die gefuehrte Bewerbung dieser Stelle", () => {
    const seite = baueKiSeite(job(), anforderungen({ bewerbungsboegen: [bogen()] }), wissen(), {
      gefuehrteBewerbung: true,
    });
    expect(seite).toContain(`/dashboard/bewerben/${PINST_GUID}`);
    expect(seite).toContain("- **Wird im Bewerbungspaket ausgefüllt:** ja");
  });
});
