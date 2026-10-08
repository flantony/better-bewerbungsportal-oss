import { describe, it, expect } from "vitest";
import { bewerbungsablaufMarkdown } from "./bewerbungsablauf";
import { mitHinweis } from "./hinweis";
import { EINREICHEN_KURZ } from "../../lib/einreichen";

/**
 * WOZU: der erwartete Text des Kanals "mcp" - hier UNABHAENGIG von
 * `bewerbungsablauf.ts` hinterlegt, ein Vergleich gegen eine Konstante aus
 * derselben Datei wuerde nur die Datei gegen sich selbst pruefen. Skill-Bundle
 * und `npm run mcp:contract` haengen an diesem Text; er darf sich nicht
 * aendern, ohne dass dieser Test es zeigt.
 */
const ERWARTETER_MCP_TEXT = `# Wie eine Bewerbung bei der Bundeswehr abläuft

## Was dieses Werkzeug tut - und was nicht

Dieser Server hilft bis zum ausgefüllten Bewerbungsbogen. **Abschicken kann er
nichts.** Die Bewerbung geht immer über die offiziellen Wege der Bundeswehr, mit
der Kennung der Ausschreibung (\`refCode\`) als Bezug.

## Der Ablauf

1. **Ausschreibung finden und Frist prüfen.** \`applicationEnd\` ist der
   Bewerbungsschluss. Ist er vorbei, ist die Stelle raus - eine Bewerbung darauf
   ist verlorene Mühe.
   Wer noch nicht sicher ist, welche Laufbahn passt, spricht am besten schon
   jetzt mit der Karriereberatung der Bundeswehr - nicht erst nach dem
   Einreichen.
2. **Unterlagen zusammenstellen.** Was verlangt wird, steht in
   \`get_document_requirements\`: der Bewerbungsbogen selbst und die im Text
   genannten Nachweise (Lebenslauf, Zeugnisse, je nach Stelle eine Erklärung zur
   Verfassungstreue wie die "Anlage 1 zum Bewerbungsbogen", die der Bewerber
   selbst ausfüllt und unterschreibt, teils beglaubigte Übersetzungen).
3. **Bewerbungsbogen ausfüllen.** Entweder mit \`fuelle_formular\` oder von
   Hand auf dem Blankoformular.
4. **Bewerbung einreichen.** Im offiziellen Bewerbungsportal der Bundeswehr (https://bewerbung.bundeswehr-karriere.de) über „Karriere starten“ ein Profil anlegen, die Stelle über ihre Kennung suchen und die Unterlagen als PDF hochladen - unterschriebene Vordrucke vorher einscannen. Das Portal fragt die persönlichen Angaben dort noch einmal selbst ab. Nennt die Ausschreibung einen anderen Weg, gilt dieser.
   Die Ansprechperson steht in \`contactDesc\`.
5. **Karriereberatung.** Nach dem Einreichen meldet sich in der Regel die
   Karriereberatung zur Terminvereinbarung. Für militärische Laufbahnen führt der Weg über ein
   Karrierecenter der Bundeswehr. Dort wird beraten, welche Laufbahn und
   Verwendung überhaupt passt - das ist keine Formalie, sondern die Stelle, an
   der sich viele Bewerbungen noch verschieben.
6. **Eignungsfeststellung.** Mehrtägiges Verfahren im Karrierecenter: ärztliche
   Untersuchung, Sporttest, computergestützte Tests und Gespräche. Umfang und
   Dauer hängen an der angestrebten Laufbahn. Für Offiziere in der Regel
   stattdessen im Assessmentcenter für Führungskräfte der Bundeswehr in Köln.
7. **Prüfung der Verfassungstreue** - je nach Verwendung zusätzlich eine
   Sicherheitsüberprüfung. Läuft teils parallel zu den anderen Schritten.
8. **Entscheidung und Einstellungszusage.**

## Wobei die KI hier helfen kann

Erklären, Unterlagen zusammenstellen, den Bogen ausfüllen, an Fristen erinnern.
**Nicht** aber: Angaben erfinden, den Ausgang der Eignungsfeststellung
vorhersagen oder eine Zusage in Aussicht stellen.`;

const ERWARTETE_QUELLEN = [
  "Bundeswehr Karriere, Bewerbung und Eignungsfeststellung: https://www.bundeswehrkarriere.de/",
  "Bundeswehr, Voraussetzungen für den Dienst: https://www.bundeswehr.de/de/menschen-karrieren/voraussetzungen-dienst",
  "Einreichweg und Assessmentcenter für Führungskräfte: die Ausschreibungen selbst und ihre Anlagen",
];

describe("bewerbungsablaufMarkdown — Kanal 'mcp' ist festgeschrieben", () => {
  it("liefert ohne Kanalangabe exakt den erwarteten Text (Skill-Bundle/mcp:contract haengen daran)", () => {
    expect(bewerbungsablaufMarkdown()).toBe(mitHinweis(ERWARTETER_MCP_TEXT, ERWARTETE_QUELLEN));
  });

  it("liefert bei kanal: 'mcp' denselben Text wie ohne Angabe", () => {
    expect(bewerbungsablaufMarkdown("mcp")).toBe(bewerbungsablaufMarkdown());
  });
});

describe("bewerbungsablaufMarkdown — Kanal 'chat' ohne Werkzeuge und interne Feldnamen", () => {
  it("nennt keine Werkzeugnamen, keine internen Feldnamen und nicht 'Dieser Server'", () => {
    const text = bewerbungsablaufMarkdown("chat");
    for (const verboten of ["get_document_requirements", "fuelle_formular", "contactDesc", "applicationEnd", "Dieser Server"]) {
      expect(text).not.toContain(verboten);
    }
  });

  // Funktionsschalter BEWERBERDATEN_IM_KONTO aus: das
  // Bewerbungspaket aus dem Konto gibt es nicht - Schritt 3 darf es nicht
  // versprechen, sondern nennt den Weg ueber die eigene KI.
  it("verspricht beim Bewerbungsbogen kein Bewerbungspaket, sondern nennt die Mappe ueber die eigene KI", () => {
    const text = bewerbungsablaufMarkdown("chat").replace(/\s+/g, " ");
    const schritt3 = text.slice(text.indexOf("3. **Bewerbungsbogen"), text.indexOf("4. **Bewerbung einreichen"));
    expect(schritt3).not.toMatch(/Bewerbungspaket/);
    expect(schritt3).toMatch(/von Hand auf dem Blankoformular/);
    expect(schritt3).toMatch(/better-bewerbungsportal\.de\/ki/);
    expect(schritt3).toMatch(/Bewerbungsmappe/);
  });

  it("beschreibt trotzdem dieselben acht Schritte", () => {
    const text = bewerbungsablaufMarkdown("chat");
    expect(text).toMatch(/1\. \*\*Ausschreibung finden und Frist prüfen/);
    expect(text).toMatch(/8\. \*\*Entscheidung und Einstellungszusage/);
  });

  // Schritte 5-8 kommen aus EINER gemeinsamen Konstante (SPAETERE_SCHRITTE) -
  // dieser Test belegt, dass beide Kanaele sie wortgleich ausgeben.
  it("gibt die Schritte 5-8 wortgleich zum mcp-Kanal aus", () => {
    const gemeinsamerTeil = (text: string) => text.slice(text.indexOf("5. **Karriereberatung"), text.indexOf("## Wobei"));
    expect(gemeinsamerTeil(bewerbungsablaufMarkdown("chat"))).toBe(gemeinsamerTeil(bewerbungsablaufMarkdown("mcp")));
  });
});

/**
 * Beratung schon vor dem Einreichen, Verfassungstreue als eigener Schritt,
 * Assessmentcenter fuer Offiziere, Portal mit Adresse. Gilt fuer beide Kanaele.
 */
describe.each(["mcp", "chat"] as const)("bewerbungsablaufMarkdown — Kanal '%s', Beratung, Verfassungstreue, Assessmentcenter, Einreichweg", (kanal) => {
  const text = bewerbungsablaufMarkdown(kanal).replace(/\s+/g, " ");

  it("empfiehlt die Karriereberatung schon vor dem Einreichen", () => {
    expect(text.indexOf("schon jetzt mit der Karriereberatung")).toBeLessThan(text.indexOf("Bewerbung einreichen"));
  });

  it("nennt die Pruefung der Verfassungstreue und die Sicherheitsueberpruefung", () => {
    expect(text).toMatch(/Prüfung der Verfassungstreue/);
    expect(text).toMatch(/je nach Verwendung zusätzlich eine Sicherheitsüberprüfung/);
  });

  it("schickt Offiziere vorsichtig formuliert ins Assessmentcenter fuer Fuehrungskraefte", () => {
    expect(text).toMatch(/Für Offiziere in der Regel stattdessen im Assessmentcenter für Führungskräfte der Bundeswehr in Köln/);
  });

  it("nennt den Einreichweg mit Portaladresse aus der gemeinsamen Quelle", () => {
    expect(text).toContain(EINREICHEN_KURZ);
  });
});
