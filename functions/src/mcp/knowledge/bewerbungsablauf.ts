/**
 * Was nach dem Absenden passiert.
 *
 * WOZU: Der MCP-Server kann eine Bewerbung nicht abschicken - er endet beim
 * ausgefuellten Bewerbungsbogen. Genau dort setzt die haeufigste Rueckfrage ein
 * ("und dann?"), und genau dort hat ein KI-Client ohne diese Seite nichts als
 * sein Trainingswissen. Diese Seite beschreibt den Ablauf als Reihenfolge,
 * nicht mit Fristen oder Dauern: die schwanken je Karrierecenter und Laufbahn.
 *
 * ZWEI KANAELE (fuer den Chat-Link, s. kiSeite.ts):
 * `kanal: "mcp"` ist der Text der Resource `bw://wissen/bewerbungsablauf` -
 * Skill-Bundle und `npm run mcp:contract` haengen daran, Aenderungen daran
 * gehen mit einer Versionsanhebung des Servers einher. `"chat"` ist fuer eine
 * fremde KI OHNE MCP-Verbindung: kein Werkzeugname
 * (`get_document_requirements`, `fuelle_formular`), kein internes Feld in
 * Backticks (`applicationEnd`, `contactDesc`) - eine Seite ohne Werkzeuge kann
 * damit nichts anfangen, und `contactDesc` als Feldname laedt geradezu dazu
 * ein, nach dem Namen der Ansprechperson zu suchen. Der Hinweis auf die fruehe
 * Beratung, der Einreichweg und die Schritte 5-8 sind in beiden Kanaelen
 * wortgleich - EINE Quelle dafuer, damit sie nicht auseinanderlaufen.
 *
 * Das Assessmentcenter fuer Fuehrungskraefte in Koeln steht so in den
 * Ausschreibungsanlagen ("Anlage 1 OA-Fuehrungskraft ...").
 */
import { mitHinweis } from "./hinweis";
import { EINREICHEN_KURZ } from "../../lib/einreichen";

const FRUEHE_BERATUNG = `   Wer noch nicht sicher ist, welche Laufbahn passt, spricht am besten schon
   jetzt mit der Karriereberatung der Bundeswehr - nicht erst nach dem
   Einreichen.`;

const EINREICHEN = `4. **Bewerbung einreichen.** ${EINREICHEN_KURZ}`;

const SPAETERE_SCHRITTE = `5. **Karriereberatung.** Nach dem Einreichen meldet sich in der Regel die
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
8. **Entscheidung und Einstellungszusage.**`;

const QUELLEN = [
  "Bundeswehr Karriere, Bewerbung und Eignungsfeststellung: https://www.bundeswehrkarriere.de/",
  "Bundeswehr, Voraussetzungen für den Dienst: https://www.bundeswehr.de/de/menschen-karrieren/voraussetzungen-dienst",
  "Einreichweg und Assessmentcenter für Führungskräfte: die Ausschreibungen selbst und ihre Anlagen",
];

export type WissensKanal = "mcp" | "chat";

function mcpText(): string {
  return `# Wie eine Bewerbung bei der Bundeswehr abläuft

## Was dieses Werkzeug tut - und was nicht

Dieser Server hilft bis zum ausgefüllten Bewerbungsbogen. **Abschicken kann er
nichts.** Die Bewerbung geht immer über die offiziellen Wege der Bundeswehr, mit
der Kennung der Ausschreibung (\`refCode\`) als Bezug.

## Der Ablauf

1. **Ausschreibung finden und Frist prüfen.** \`applicationEnd\` ist der
   Bewerbungsschluss. Ist er vorbei, ist die Stelle raus - eine Bewerbung darauf
   ist verlorene Mühe.
${FRUEHE_BERATUNG}
2. **Unterlagen zusammenstellen.** Was verlangt wird, steht in
   \`get_document_requirements\`: der Bewerbungsbogen selbst und die im Text
   genannten Nachweise (Lebenslauf, Zeugnisse, je nach Stelle eine Erklärung zur
   Verfassungstreue wie die "Anlage 1 zum Bewerbungsbogen", die der Bewerber
   selbst ausfüllt und unterschreibt, teils beglaubigte Übersetzungen).
3. **Bewerbungsbogen ausfüllen.** Entweder mit \`fuelle_formular\` oder von
   Hand auf dem Blankoformular.
${EINREICHEN}
   Die Ansprechperson steht in \`contactDesc\`.
${SPAETERE_SCHRITTE}

## Wobei die KI hier helfen kann

Erklären, Unterlagen zusammenstellen, den Bogen ausfüllen, an Fristen erinnern.
**Nicht** aber: Angaben erfinden, den Ausgang der Eignungsfeststellung
vorhersagen oder eine Zusage in Aussicht stellen.`;
}

/**
 * Fuer die KI-lesbare Klartextseite (`kiSeite.ts`): dieselben Schritte, aber
 * ohne Werkzeugnamen und ohne interne Feldnamen - eine Seite ohne
 * MCP-Verbindung kann `fuelle_formular` nicht aufrufen und `contactDesc` nicht
 * nachschlagen, und "contactDesc" als Wort laedt dazu ein, nach dem Namen der
 * Ansprechperson zu suchen, den diese Seite nie ausgibt.
 */
function chatText(): string {
  return `# Wie eine Bewerbung bei der Bundeswehr abläuft

## Was diese Seite tut - und was nicht

Diese Seite hilft bis zu den fertigen Unterlagen. **Abschicken kann sie
nichts.** Die Bewerbung geht immer über die offiziellen Wege der Bundeswehr, mit
der Kennung der Ausschreibung als Bezug.

## Der Ablauf

1. **Ausschreibung finden und Frist prüfen.** Der Bewerbungsschluss steht oben
   bei den Eckdaten der Ausschreibung. Ist er vorbei, ist die Stelle raus - eine
   Bewerbung darauf ist verlorene Mühe.
${FRUEHE_BERATUNG}
2. **Unterlagen zusammenstellen.** Was verlangt wird, steht oben unter
   "Benötigte Unterlagen": der Bewerbungsbogen selbst und die im Text genannten
   Nachweise (Lebenslauf, Zeugnisse, je nach Stelle eine Erklärung zur
   Verfassungstreue wie die "Anlage 1 zum Bewerbungsbogen", die die bewerbende
   Person selbst ausfüllt und unterschreibt, teils beglaubigte Übersetzungen).
3. **Bewerbungsbogen ausfüllen** - von Hand auf dem Blankoformular. Ist die
   eigene KI über https://better-bewerbungsportal.de/ki mit dem Better
   Bewerbungsportal verbunden, kann sie den Bogen auch in einer
   Bewerbungsmappe ausfüllen (ein vorübergehender Ordner, der nach rund
   einer Stunde gelöscht wird). Ohne diese Verbindung geht das
   nicht.
${EINREICHEN}
   Wer die Ansprechperson ist, steht in der Ausschreibung selbst.
${SPAETERE_SCHRITTE}

## Wobei die KI hier helfen kann

Erklären, Unterlagen zusammenstellen, beim Ausfüllen helfen, an Fristen
erinnern. **Nicht** aber: Angaben erfinden, den Ausgang der Eignungsfeststellung
vorhersagen oder eine Zusage in Aussicht stellen.`;
}

export function bewerbungsablaufMarkdown(kanal: WissensKanal = "mcp"): string {
  return mitHinweis(kanal === "chat" ? chatText() : mcpText(), QUELLEN);
}
