import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer, PUBLIC_SITE_URL } from "./server";
import { SERVER_INSTRUCTIONS } from "./instructions";
import { fuelleFormularInputSchema } from "./tools/fuelleFormular";

/**
 * Verbindet einen echten Client über einen In-Memory-Transport - prüft also das
 * tatsächliche Protokollverhalten (initialize/tools/list), nicht interne Felder.
 * Die Tool-Handler werden dabei nie aufgerufen, es braucht also kein Firestore.
 */
async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("buildMcpServer — Identität und Instructions", () => {
  it("liefert die Server-Instructions beim initialize mit", async () => {
    const client = await connect();
    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
  });

  it("gibt Titel, Beschreibung und Website an", async () => {
    const client = await connect();
    const info = client.getServerVersion();
    expect(info?.title).toBe("Bundeswehr-Bewerbung");
    expect(info?.description).toBeTruthy();
    expect(info?.websiteUrl).toBe(`${PUBLIC_SITE_URL}/ki`);
  });
});

describe("SERVER_INSTRUCTIONS — tragende Regeln", () => {
  // Diese Formulierungen sind der Grund, warum die KI den Ablauf einhält und
  // keine Bewerberdaten erfindet. Wer sie herauskürzt, soll das absichtlich
  // tun müssen.
  it.each([
    ["deutsche Antwort", /answer the user in German/i],
    ["keine erfundenen Daten", /never invent/i],
    // hole_formular kann base64 zurueckgeben: der Client schreibt keine
    // Binaerdaten in den Chat, sondern bietet eine Datei an.
    ["Datei-Handhabung ohne Base64-Dump im Chat", /never print it in the chat/i],
    ["Reihenfolge vor dem Ausfüllen", /get_document_requirements/],
    // Die transiente Mappe haelt echte PII (ausgefuellte PDFs, hochgeladene
    // Zeugnisse). Ein Satz wie "nothing about the applicant is stored" ginge
    // bei jedem Verbindungsaufbau an fremde Clients, die ihn dem Bewerber genau
    // dann weitererzaehlen, wenn er hochlaedt. Bewacht wird die wahre Aussage:
    // dieser Server sieht keine Konten (die gibt es nur auf der Website), aber
    // die Mappe liegt hier - und faellt nach einer Stunde weg.
    ["kein Zugriff auf Konten, keine Historie", /has no access to user accounts/i],
    ["Konten nur auf der Website", /accounts exist only on the website/i],
    ["Portaladresse beim Einreichen", /https:\/\/bewerbung\.bundeswehr-karriere\.de/],
    ["Mappe liegt wirklich beim Server", /DO sit on this server/],
    ["Stundenfrist wird dem Bewerber gesagt", /deleted one hour after the package/i],
    ["nicht behaupten, es werde nichts gespeichert", /do not tell them nothing is stored/i],
    // Ein Satz wie "ich behalte neue Ausschreibungen fuer dich im Blick und
    // melde mich" ist falsch: die KI hat hier kein Gedaechtnis und keine
    // Benachrichtigung - der Bewerber wartet auf eine Meldung, die nie kommt,
    // und bewirbt sich nicht.
    ["keine kuenftige Beobachtung versprechen", /Never promise to watch/i],
    // Beobachten kann die KI nicht, aber der Bewerber kann sich ueber sein
    // Konto benachrichtigen lassen. Der Satz oben zeigt dorthin, statt die
    // Frage als Sackgasse stehen zu lassen.
    ["Benachrichtigung ueber den Link statt Versprechen", /For alerts, erstelle_suchprofil_link/],
    ["Überblick vor dem Raten", /zaehle_treffer/],
    ["Blättern statt abschneiden", /naechsterCursor/],
    ["eigenes Wissen statt Modellwissen", /bw:\/\/wissen\//],
    ["Fachwort nie aus dem Gedächtnis erklären", /NEVER EXPLAIN A GERMAN ADMINISTRATIVE TERM FROM MEMORY/],
    ["Zahlen sind nicht die Antwort", /not an answer/i],
    ["eine Ausschreibung je Zeile", /ONE POSTING PER LINE/],
    ["Fristen nicht zusammenfassen", /Never merge several postings/i],
    ["hoechstens zwei Rueckfragen", /AT MOST TWO QUESTIONS/],
    ["Zaehlen ersetzt kein Suchen", /at least one list_jobs call/i],
    ["Einstiegsweg statt Textsuche", /einstiegswege/],
  ])("enthält die Regel: %s", (_label, pattern) => {
    expect(SERVER_INSTRUCTIONS).toMatch(pattern);
  });

  /**
   * Der Server sendet keine 0 fuer eine unbekannte Altersgrenze - das Feld
   * fehlt dann ganz. Eine Erklaerung der Null waere ueberfluessig und kostete
   * nur Platz; die Warnung selbst ("nie 'keine Grenze'") ist noetig, weil ein
   * Client auch aus dem FEHLEN des Feldes "keine Altersgrenze" schliessen kann.
   */
  it("erklaert keine Null, warnt aber vor 'keine Grenze'", () => {
    expect(SERVER_INSTRUCTIONS).not.toMatch(/of 0/);
    expect(SERVER_INSTRUCTIONS).toMatch(/no age limit/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/"no limit"/);
  });

  // Laufbahn- und Besoldungsfragen decken die Resources ab. Verweisen die
  // Instructions dafuer auf das Eigenwissen des Modells, greift ein Client zu
  // seinem Trainingsstand.
  it("schickt das Modell nicht auf sein eigenes Wissen", () => {
    expect(SERVER_INSTRUCTIONS).not.toMatch(/NOT covered by these tools/i);
  });

  // Der WORKFLOW ist eine Reihenfolge. Wird er durch eine eingeschobene
  // Ueberschrift zerrissen, liest ein Modell zwei Bruchstuecke statt einer
  // Abfolge.
  it("haelt die Schrittnummern luecken- und unterbrechungsfrei", () => {
    const schritte = SERVER_INSTRUCTIONS.split("\n")
      .map((zeile) => /^(\d+)\./.exec(zeile)?.[1])
      .filter((nummer): nummer is string => nummer !== undefined)
      .map(Number);
    expect(schritte).toEqual([0, 1, 2, 3, 4, 5, 6]);

    // Zwischen erstem und letztem Schritt darf keine Abschnitts-Ueberschrift stehen.
    const zeilen = SERVER_INSTRUCTIONS.split("\n");
    const ersterSchritt = zeilen.findIndex((z) => /^0\./.test(z));
    const letzterSchritt = zeilen.findIndex((z) => /^6\./.test(z));
    const dazwischen = zeilen.slice(ersterSchritt, letzterSchritt);
    // Ueberschriften sind durchgehend GROSSGESCHRIEBEN und stehen allein.
    const ueberschriften = dazwischen.filter((z) => /^[A-Z][A-Z ,—-]{6,}$/.test(z.trim()));
    expect(ueberschriften, `Ueberschrift im WORKFLOW: ${ueberschriften.join(" | ")}`).toEqual([]);
  });

  // Der Text geht bei JEDEM initialize erneut raus.
  it("bleibt in einer vertretbaren Groesse", () => {
    expect(SERVER_INSTRUCTIONS.length).toBeLessThan(12_000);
  });
});

describe("Wissens-Resources", () => {
  it("bietet alle vier Nachschlagewerke an", async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri).sort()).toEqual([
      "bw://wissen/besoldung",
      "bw://wissen/bewerbungsablauf",
      "bw://wissen/glossar",
      "bw://wissen/laufbahnen",
    ]);
  });

  it("beschreibt jede Resource, damit ein Client weiß, wann er sie liest", async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    for (const resource of resources) {
      expect(resource.title, `${resource.uri} braucht einen Titel`).toBeTruthy();
      expect(resource.description, `${resource.uri} braucht eine Beschreibung`).toBeTruthy();
    }
  });

  it("bietet das Blankoformular als Vorlage mit docId an", async () => {
    const client = await connect();
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toContain("bw://formular/{docId}");
  });
});

describe("Tool-Metadaten", () => {
  it("gibt jedem Tool einen deutschen Titel und Annotations", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "erklaere_begriff",
      "eroeffne_bewerbungsmappe",
      "erstelle_suchprofil_link",
      "fuege_dokument_hinzu",
      "fuelle_formular",
      "get_document_requirements",
      "get_job",
      "hole_formular",
      "list_jobs",
      "mappe_status",
      "schliesse_bewerbungsmappe",
      "zaehle_treffer",
    ]);

    for (const tool of tools) {
      expect(tool.title, `${tool.name} braucht einen Titel`).toBeTruthy();
      expect(tool.annotations, `${tool.name} braucht Annotations`).toBeDefined();
      expect(tool.description, `${tool.name} braucht eine Beschreibung`).toBeTruthy();
    }
  });

  // Wir nehmen keine Ausweiskopien entgegen. Ein Satz wie "ID copies always
  // go through that page" darf deshalb nirgends stehen.
  it("schickt keine KI mit einer Ausweiskopie auf die Upload-Seite", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, tool.name).not.toMatch(/ID cop(y|ies) (always )?go/i);
    }
    expect(SERVER_INSTRUCTIONS).not.toMatch(/upload[^.]*\b(ID|identity|passport)\b/i);
    const fuege = tools.find((tool) => tool.name === "fuege_dokument_hinzu");
    expect(fuege?.description).toMatch(/ID cop(y|ies)[^.]*not accepted/i);
    expect(fuege?.description).toMatch(/encloses/i);
    const status = tools.find((tool) => tool.name === "mappe_status");
    expect(status?.description).toMatch(/selbstBeilegen/);
  });

  // Zwei Organisationsbereiche enthalten selbst ein Komma. Kommagetrennt
  // aufgezaehlt liest ein Modell daraus mehr Werte als es gibt und schickt
  // anschliessend ungueltige Enum-Werte.
  it("zaehlt mehrdeutige Auswahlwerte in Anfuehrungszeichen auf", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    for (const tool of tools) {
      const props = (tool.inputSchema?.properties ?? {}) as Record<string, { enum?: string[]; items?: { enum?: string[] }; description?: string }>;
      for (const [feld, schema] of Object.entries(props)) {
        const werte = schema.enum ?? schema.items?.enum;
        const mitKomma = (werte ?? []).filter((wert) => wert.includes(","));
        for (const wert of mitKomma) {
          expect(
            schema.description ?? "",
            `${tool.name}.${feld} zaehlt "${wert}" ohne Anfuehrungszeichen auf`,
          ).toContain(`"${wert}"`);
        }
      }
    }
  });

  // Die Beschreibung ist das Einzige, was ein Client zum Tool liest, wenn er die
  // Parameter nicht einzeln durchgeht. Verschweigt sie das Blaettern, haelt er
  // die erste Seite fuer das ganze Ergebnis.
  it("nennt in der Beschreibung von list_jobs Reihenfolge und Blaettern", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const listJobs = tools.find((tool) => tool.name === "list_jobs");
    expect(listJobs?.description).toMatch(/naechsterCursor/);
    expect(listJobs?.description).toMatch(/sortierung/);
    expect(listJobs?.description).toMatch(/zaehle_treffer/);
  });

  // Ohne diesen Vermerk gibt ein Client die aus dem Fliesstext extrahierten
  // Zahlen der Trefferliste ("Verpflichtungszeit 8 bis 13 Jahre",
  // "Altersgrenze 49") an den Bewerber weiter und schreibt sie "der
  // offiziellen Bundeswehr-Seite" zu.
  it("sagt bei list_jobs, welche Felder abgeleitet und nicht amtlich sind", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const listJobs = tools.find((tool) => tool.name === "list_jobs");
    expect(listJobs?.description).toMatch(/herkunftDerAngaben/);
    expect(listJobs?.description).toMatch(/not official/i);
    // Die weggelassenen Felder muessen gedeutet werden, sonst raet der Client.
    expect(listJobs?.description).toMatch(/absent/i);
  });

  // Sagt die Beschreibung nur, WANN man zaehle_treffer aufruft, aber nicht,
  // was danach kommt, haelt ein schwaecheres Modell die Zahlen fuer die
  // Antwort und bleibt dort stehen.
  it("sagt bei zaehle_treffer, dass die Zahlen nicht die Antwort sind", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const zaehlen = tools.find((tool) => tool.name === "zaehle_treffer");
    expect(zaehlen?.description).toMatch(/list_jobs/);
    expect(zaehlen?.description).toMatch(/never the answer|not the answer/i);
  });

  // Ebenso: haelt ein Modell erklaere_begriff nur fuer Ausschreibungstexte
  // zustaendig, erfindet es Erklaerungen fuer Facettennamen.
  it("bindet erklaere_begriff nicht nur an Ausschreibungstexte", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const erklaeren = tools.find((tool) => tool.name === "erklaere_begriff");
    expect(erklaeren?.description).toMatch(/zaehle_treffer|filter list|career-group/i);
    expect(erklaeren?.description).toMatch(/training/i);
  });

  it("markiert nur eroeffne_bewerbungsmappe, fuelle_formular, fuege_dokument_hinzu und schliesse_bewerbungsmappe als nicht-lesend", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const writing = tools.filter((tool) => tool.annotations?.readOnlyHint !== true);
    expect(writing.map((tool) => tool.name).sort()).toEqual([
      "eroeffne_bewerbungsmappe",
      "fuege_dokument_hinzu",
      "fuelle_formular",
      "schliesse_bewerbungsmappe",
    ]);
  });

  // Reine Rechnung ohne Datenzugriff - die einzige Ausnahme vom
  // openWorldHint der Suchwerkzeuge.
  it("markiert erstelle_suchprofil_link als lesend, idempotent und geschlossen", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const link = tools.find((tool) => tool.name === "erstelle_suchprofil_link");
    expect(link?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    // "speichern" allein liest sich wie "erledigt" - das Werkzeug baut nur den Link.
    expect(link?.title).toMatch(/Link/);
    expect(link?.title).not.toMatch(/suchprofil/i);
  });

  it("bietet den Einstiegs-Prompt an", async () => {
    const client = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toContain("bewerbung_vorbereiten");
  });
});

/**
 * Beispiel: "Ich arbeite in der Personalabteilung und würde als Reservist gern
 * in dem Bereich in Magdeburg helfen." `einstiegswege: ["reserveoffizier"]`
 * findet nur Reserveoffizier-Dienstposten; die Reservistenstelle im
 * Personalbereich in Magdeburg steht unter `vertragsarten: ["Reservedienst"]`.
 *
 * Zwei Wege, dieselbe Frage zu stellen, und der prominentere ist der falsche.
 * Die Beschreibungen muessen deshalb AUFEINANDER zeigen, nicht nur je fuer sich
 * richtig sein.
 */
describe("Reservedienst vs. reserveoffizier — die beiden Begriffe werden nicht verwechselt", () => {
  it("verweist bei einstiegswege auf die Vertragsart Reservedienst", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const einstiegswege = tools.find((t) => t.name === "list_jobs")?.inputSchema.properties as
      | Record<string, { description?: string }>
      | undefined;
    expect(einstiegswege?.einstiegswege.description).toMatch(/Reservedienst/);
  });

  it("verweist bei der Vertragsart Reservedienst auf den Unterschied", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const name of ["list_jobs", "zaehle_treffer"]) {
      const props = tools.find((t) => t.name === name)?.inputSchema.properties as
        | Record<string, { description?: string }>
        | undefined;
      expect(props?.vertragsarten.description, name).toMatch(/Reservedienst/);
      expect(props?.vertragsarten.description, name).toMatch(/einstiegswege/);
    }
  });
});

/**
 * WOZU: Zod entfernt unbekannte Schluessel standardmaessig stillschweigend. Das
 * veroeffentlichte JSON-Schema sagt aber `additionalProperties:false` - ohne
 * Pruefung behauptete der Vertrag eine Strenge, die der Server nicht durchsetzt.
 *
 * Ein wortlos verworfener Filter liefert statt einer Fehlermeldung die
 * bundesweite Zahl - und die ist nicht als falsch erkennbar, weil sie
 * plausibel aussieht. Ein abgelehnter Aufruf schickt den Client zum richtigen
 * Werkzeug; die stille Zahl laesst ihn "in Brandenburg gibt es keine
 * IT-Stellen" schreiben.
 */
describe("Eingabepruefung — unbekannte Parameter", () => {
  it.each(["list_jobs", "zaehle_treffer", "get_job", "erklaere_begriff", "erstelle_suchprofil_link"])(
    "%s lehnt einen unbekannten Parameter ab, statt ihn zu verwerfen",
    async (name) => {
      const client = await connect();
      const antwort = await client.callTool({ name, arguments: { erfundenerFilter: "x" } });
      expect(antwort.isError, `${name} hat den Aufruf angenommen`).toBe(true);
      // Geprueft wird die Wegweisung, nicht das Echo des falschen Namens: Zods
      // eigene Meldung nennt zwar den Schluessel, laesst sich aber nicht um
      // eigenen Text ergaenzen - `.strict(text)` ersetzt sie ganz. Von beidem
      // ist die Liste der erlaubten Namen das Nuetzlichere; was der Client
      // geschickt hat, weiss er selbst.
      expect(JSON.stringify(antwort.content)).toMatch(/accepts only/);
    },
  );

  // Eine Ablehnung, die nur "unrecognized key" sagt, verlagert das Raten bloss.
  // Die erlaubten Namen gehoeren in die Meldung - der Client hat die
  // Werkzeugbeschreibung an dieser Stelle offensichtlich nicht parat.
  it("nennt in der Ablehnung die erlaubten Parameter", async () => {
    const client = await connect();
    const antwort = await client.callTool({ name: "zaehle_treffer", arguments: { bundeslaender: ["Bayern"] } });
    const text = JSON.stringify(antwort.content);
    expect(text).toMatch(/bundesland/);
    expect(text).toMatch(/organisationsbereich/);
  });

  it("veroeffentlicht additionalProperties:false und haelt es ein", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties, `${tool.name}`).toBe(false);
    }
  });
});

describe("fuelle_formular — PII-Leitplanke", () => {
  // Wenn ein neues Feld ohne Beschreibung dazukommt, weiß das Modell nicht, dass
  // der Wert vom Nutzer kommen muss - genau dann werden Daten erfunden.
  it("beschreibt jedes einzelne Eingabefeld", () => {
    for (const [name, schema] of Object.entries(fuelleFormularInputSchema)) {
      expect(schema.description, `Feld "${name}" hat keine Beschreibung`).toBeTruthy();
    }
  });

  /**
   * Der Vordruck hat ein Feld fuer die Staatsangehoerigkeit; "nie danach
   * fragen" lieferte ein amtliches Formular mit leerem Pflichtfeld aus. Der
   * Wert kommt vom Nutzer, wird nie gespeichert, nie geloggt.
   */
  it("behandelt die Staatsangehörigkeit wie ein Feld der Vorlage, nicht als Tabu", () => {
    const beschreibung = fuelleFormularInputSchema.staatsangehoerigkeit.description ?? "";
    expect(beschreibung).not.toMatch(/do not ask/i);
    expect(beschreibung).toMatch(/as stated by the user/i);
    expect(beschreibung).toMatch(/benoetigteAngaben/);
  });

  it("nennt bei jedem Feld den Nutzer als Quelle des Werts", () => {
    // Der eigentliche Schutz: kein Feld darf so beschrieben sein, dass ein Modell
    // den Wert plausibel selbst einsetzen koennte.
    for (const [name, schema] of Object.entries(fuelleFormularInputSchema)) {
      if (name === "mappenId" || name === "docId") continue;
      expect(schema.description, `Feld "${name}"`).toMatch(/user|applicant/i);
    }
  });
});

/**
 * Das Enum des Eingabeschemas lehnt `ausweiskopie` ab, bevor der
 * Funktionskoerper von fuege_dokument_hinzu laeuft. Die Wegweisung gehoert
 * deshalb in genau diese Ablehnung (Rueckgabewert, nicht nur Beschreibung).
 */
describe("fuege_dokument_hinzu — Ausweiskopie ueber das Protokoll", () => {
  it("sagt bei art 'ausweiskopie', dass der Bewerber sie selbst beilegt und nicht hochladen soll", async () => {
    const client = await connect();
    const antwort = await client.callTool({
      name: "fuege_dokument_hinzu",
      arguments: { mappenId: "m1", art: "ausweiskopie", dateiname: "A.pdf", text: "x" },
    });
    expect(antwort.isError).toBe(true);
    const text = JSON.stringify(antwort.content);
    expect(text).toMatch(/ID cop(y|ies)[^"]*not accepted/i);
    expect(text).toMatch(/encloses/);
  });
});

/**
 * Das Werkzeug liest nichts und laesst sich deshalb ueber das Protokoll
 * selbst aufrufen - geprueft wird, was ein Client wirklich zurueckbekommt.
 */
describe("erstelle_suchprofil_link — ueber das Protokoll", () => {
  it("liefert Link, Klartext je Filter und den zweigeteilten Hinweis", async () => {
    const client = await connect();
    const antwort = await client.callTool({
      name: "erstelle_suchprofil_link",
      arguments: { filter: [{ suchbegriff: "IT", bundesland: ["Bayern"] }], namen: ["IT in Bayern"] },
    });
    expect(antwort.isError).toBeFalsy();
    const [inhalt] = antwort.content as { type: string; text: string }[];
    const ergebnis = JSON.parse(inhalt.text);
    expect(ergebnis.link).toMatch(/^https:\/\/better-bewerbungsportal\.de\/suchprofil\/uebernehmen#v1\./);
    expect(ergebnis.filter[0]).toMatchObject({ nummer: 1, name: "IT in Bayern" });
    expect(ergebnis.hinweis.fuerDenBewerber).toMatch(/melde dich an/);
    expect(ergebnis.hinweis.nurFuerDich).toMatch(/never a free-text description/);
  });

  it("lehnt das Alter im Filter mit einer Erklaerung ab", async () => {
    const client = await connect();
    const antwort = await client.callTool({
      name: "erstelle_suchprofil_link",
      arguments: { filter: [{ bundesland: ["Bayern"], alter: 30 }] },
    });
    expect(antwort.isError).toBe(true);
    expect(JSON.stringify(antwort.content)).toMatch(/Never put the applicant's age into a filter/);
  });
});
