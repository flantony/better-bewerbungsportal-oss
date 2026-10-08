/**
 * Voraussetzungen je Laufbahngruppe.
 *
 * WOZU: `list_jobs` liefert die Laufbahngruppe einer Stelle, aber nicht, was sie
 * vom Bewerber verlangt. Ohne diese Seite muss ein KI-Client dafuer auf sein
 * eigenes Trainingswissen zurueckgreifen - und das ist bei Altersgrenzen und
 * Abschluessen genau die Stelle, an der veraltete Angaben teuer werden.
 *
 * OHNE laufbahnspezifische Altersgrenzen: die stehen je nach
 * Verwendung, Vorbildung und Verpflichtungsdauer unterschiedlich im Recht und
 * aendern sich. Was eine KONKRETE Stelle verlangt, steht in ihren
 * `anforderungen` (mindestalter/hoechstalter, aus dem Ausschreibungstext
 * extrahiert) - dorthin wird hier verwiesen, statt eine Zahl zu erfinden.
 */
import { mitHinweis } from "./hinweis";

export function laufbahnenMarkdown(): string {
  return mitHinweis(
    `# Laufbahngruppen der Bundeswehr - was sie voraussetzen

Die Laufbahngruppe entscheidet, welche Stellen überhaupt in Frage kommen. Sie ist
in der Ausschreibung als \`laufbahngruppe\` hinterlegt und lässt sich in
\`list_jobs\` direkt als Filter verwenden.

## Militärische Laufbahnen

| Laufbahngruppe | Schulabschluss | Kurz gesagt |
| --- | --- | --- |
| Mannschaften | kein Abschluss nötig, Schulpflicht erfüllt | Einstieg ohne Berufsausbildung, breitestes Aufgabenfeld |
| Unteroffiziere (ohne Portepee) | mindestens Hauptschulabschluss | erste Führungs- und Fachverantwortung |
| Feldwebel (Unteroffiziere mit Portepee) | Hauptschulabschluss **mit** abgeschlossener Berufsausbildung **oder** Realschulabschluss | fachliche Spezialisierung, mittlere Führungsebene |
| Offiziere | Fachhochschulreife oder Abitur | Führungslaufbahn, in der Regel mit Studium an einer Universität der Bundeswehr |

**"Portepee" ist keine eigene Laufbahngruppe, sondern eine Sammelbezeichnung.**
Steht in einer Ausschreibung "Unteroffizier mit Portepee", sind die
Feldwebel-Dienstgrade gemeint, nicht der Dienstgrad "Unteroffizier" - ein
verbreiteter und folgenreicher Irrtum, weil er die Stelle zwei Besoldungsgruppen
zu niedrig einordnet.

## Aufstieg: die Laufbahngruppe beim Einstieg ist kein Endzustand

Wer die Voraussetzung einer höheren Laufbahngruppe heute nicht erfüllt, ist nicht
dauerhaft auf die Einstiegslaufbahn festgelegt. Die Soldatinnen- und
Soldatenlaufbahnverordnung regelt den Wechsel ausdrücklich (§ 9 SLV,
Laufbahnbefähigung und Laufbahnwechsel) und beschreibt für jede Ziellaufbahn
einen eigenen Aufstieg: § 16 (Fachunteroffiziere), § 21 (Feldwebel), § 27
(Offiziere des Truppendienstes) sowie §§ 32, 37, 42 und 47 für Sanitäts-,
Militärmusik-, Geoinformations- und militärfachlichen Dienst.

Maßgeblich ist dabei der **Dienstgrad**, nicht mehr allein der Schulabschluss:

- In eine Feldwebellaufbahn können nach § 21 SLV Mannschaften aller Laufbahnen
  aufsteigen, die mindestens den Dienstgrad "Gefreiter" erreicht haben, sowie
  Fachunteroffizierinnen und Fachunteroffiziere.
- In die Laufbahn der Offiziere des Truppendienstes können nach § 27 SLV
  Mannschaften ab dem Dienstgrad "Gefreiter", Unteroffizierinnen und
  Unteroffiziere bzw. Stabsunteroffiziere sowie Angehörige der
  Feldwebeldienstgrade aufsteigen.

In beiden Fällen nennt der Paragraf zusätzlich weitere Voraussetzungen, die er
aus anderen Vorschriften übernimmt — die konkreten Bedingungen stehen dort, nicht
hier.

Die Bezeichnungen in diesem Abschnitt sind die der Verordnung. "Truppendienst"
und Dienstgrade wie "Stabsunteroffizier" lassen sich mit \`erklaere_begriff\`
nachschlagen. Für "Fachunteroffizier" gibt es dort **keinen** Eintrag: die SLV
führt sie in § 16 als eigene Laufbahn, was sie im Einzelnen verlangt, steht in
der Verordnung — bitte nichts dazuerfinden, sondern sagen, dass hier keine
Erklärung hinterlegt ist.

**Ein Aufstieg ist kein Automatismus.** Er ist ein eigenes Auswahl- und
Zulassungsverfahren; wer zugelassen ist, führt bis zur Beförderung einen
Anwärterzusatz im Dienstgrad (etwa "Feldwebelanwärterin/Feldwebelanwärter", kurz
"FA"). Aus einer Einstellung folgt also kein Anspruch auf eine spätere Laufbahn.

**Für die Stellensuche heißt das:** Die Ausschreibungsdaten dieses Servers
enthalten nichts über den späteren Aufstieg — sie beschreiben ausschließlich die
Stelle, auf die man sich jetzt bewirbt. Erwähnt ein Ausschreibungstext eine
Entwicklungsmöglichkeit ("Bewerbung für höhere Arbeitsebene möglich"), ist das
eine Angabe dieser Stelle und keine Zusage. Wer wissen will, ob ein bestimmter
Weg für ihn offensteht, ist bei der Karriereberatung richtig — dort wird der
Einzelfall geprüft, was hier niemand kann.

## Zivile Laufbahnen

Zivile Stellen folgen den Laufbahnen des öffentlichen Dienstes: einfacher,
mittlerer, gehobener und höherer Dienst. Maßgeblich ist dort die geforderte
Vorbildung in der jeweiligen Ausschreibung; als Faustregel verlangt der gehobene
Dienst ein Bachelor-Studium, der höhere Dienst einen Master oder ein
gleichwertiges Studium.

## Was für alle Soldatinnen und Soldaten gilt

- **Deutsche Staatsangehörigkeit.** Eine zweite Staatsangehörigkeit schließt
  nicht automatisch aus.
- **Mindestalter 17 Jahre**, unter 18 nur mit schriftlicher Einwilligung der
  Erziehungsberechtigten.
- **Eintreten für die freiheitliche demokratische Grundordnung** (Verfassungstreue).
  Dazu gehört in vielen Verfahren ein eigener Fragebogen - er taucht bei den
  geforderten Unterlagen einer Stelle auf.
- **Gesundheitliche Eignung**, festgestellt in der ärztlichen Untersuchung beim
  Karrierecenter.

## Altersgrenzen: bitte an der Stelle nachsehen, nicht hier

Es gibt keine einheitliche Höchstaltersgrenze. Sie hängt von Laufbahn,
Verwendung, Vorbildung und Verpflichtungsdauer ab. Jede Ausschreibung führt
deshalb - soweit im Text genannt - \`mindestalter\` und \`hoechstalter\` in ihren
\`anforderungen\`. **Sagt der Text nichts dazu, fehlt das Feld ganz - ein
fehlendes Feld ist keine Aussage und niemals "keine Grenze".** Wer sein Alter nennt, kann es in \`list_jobs\` als \`alter\` mitgeben;
dann fallen Stellen weg, die es ausschließen.`,
    [
      "Bundeswehr, Voraussetzungen für den Dienst: https://www.bundeswehr.de/de/menschen-karrieren/voraussetzungen-dienst",
      "Bundeswehr Karriere, militärische Laufbahnen: https://www.bundeswehrkarriere.de/entdecker/jobs/laufbahnen-militaerisch",
      "Soldatinnen- und Soldatenlaufbahnverordnung (SLV): https://www.gesetze-im-internet.de/slv_2021/",
      "SLV § 21, Aufstieg in eine Laufbahn der Feldwebel: https://www.gesetze-im-internet.de/slv_2021/__21.html",
      "SLV § 27, Aufstieg in die Laufbahn der Offizierinnen und Offiziere des Truppendienstes: https://www.gesetze-im-internet.de/slv_2021/__27.html",
    ],
  );
}
