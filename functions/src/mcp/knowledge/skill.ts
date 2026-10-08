/**
 * Inhalt des Skill-Bundles fuer /ki.
 *
 * WOZU EIN SKILL, wenn der Server ohnehin Instructions mitschickt: die
 * Instructions erreichen nur Clients, die diesen Server verbunden haben, und sie
 * muessen kurz bleiben - sie gehen bei JEDEM Verbindungsaufbau ueber die
 * Leitung. Ein Skill wird nur geladen, wenn er gebraucht wird, und darf deshalb
 * ausfuehrlich sein.
 *
 * WICHTIG: keine zweite Wissensquelle. Der Skill beschreibt den Ablauf; die
 * Nachschlagewerke kommen als Referenzdateien aus demselben Register, aus dem
 * auch die MCP-Resources erzeugt werden (s. knowledge/index.ts).
 */
import { WISSENSDOKUMENTE } from "./index";

export const SKILL_NAME = "bundeswehr-stellensuche";

/**
 * `description` entscheidet, ob der Skill ueberhaupt geladen wird - der
 * Ausloesefall gehoert deshalb nach vorn. Beschreibung und `when_to_use` werden
 * im Skill-Verzeichnis bei 1.536 Zeichen abgeschnitten.
 */
export function skillMarkdown(mcpUrl: string): string {
  const referenzen = WISSENSDOKUMENTE.map(
    (dokument) => `- \`referenzen/${dokument.slug}.md\` — ${dokument.titel}`,
  ).join("\n");

  return `---
name: ${SKILL_NAME}
description: Findet passende Stellenausschreibungen der Bundeswehr und begleitet bis zum ausgefüllten Bewerbungsbogen. Nutze diesen Skill, sobald es um eine Bewerbung oder eine Stelle bei der Bundeswehr geht — auch bei vagen Fragen wie "was gibt es bei der Marine" oder "welche IT-Jobs gibt es beim Bund".
when_to_use: Bundeswehr, Bewerbung, Stellenangebot, Ausschreibung, Soldat, Offizier, Feldwebel, Unteroffizier, Marine, Heer, Luftwaffe, Karrierecenter, Bewerbungsbogen, Besoldung, Laufbahn
---

# Stellensuche bei der Bundeswehr

Dieser Skill arbeitet mit dem öffentlichen MCP-Server von Better
Bewerbungsportal — einem unabhängigen privaten Projekt, **nicht** einem Angebot
der Bundeswehr. Sage das, wenn jemand danach fragt, und tritt nie als die
Bundeswehr auf.

Server-Adresse: \`${mcpUrl}\`

Ist der Server nicht verbunden, sage das offen und verweise auf die
Einrichtungsanleitung, statt Stellen aus dem Gedächtnis zu erfinden. **Alle
Angaben zu offenen Stellen kommen aus diesen Werkzeugen, nie aus deinem
Trainingswissen und nie aus einer Websuche.**

## Ablauf

### 1. Verstehen, was gesucht wird

Frage nach dem, was die Suche wirklich eingrenzt — aber alles auf einmal, nicht
nacheinander: Region, militärisch oder zivil, Themenfeld, Schulabschluss, Alter.

Nach der Staatsangehörigkeit fragst du erst, wenn der Bewerbungsbogen ein Feld
dafür hat (\`benoetigteAngaben\` in \`get_document_requirements\`).

### 2. Überblick verschaffen, statt zu raten

Ist der Wunsch noch vage, rufe zuerst \`zaehle_treffer\` auf. Das liefert in
einem Schritt, wie viele Stellen es je Bereich, Laufbahngruppe und Vertragsart
gibt. Erst danach gezielt filtern.

Genauso bei einem leeren Ergebnis: nicht blind weitersuchen, sondern zählen
lassen und dem Nutzer sagen, wo es tatsächlich etwas gibt.

### 3. Suchen

\`list_jobs\` mit den passenden Filtern. Die Treffer kommen nach nächstem
Bewerbungsschluss sortiert.

- Für Teilstreitkraft und Laufbahngruppe **immer** \`organisationsbereich\` und
  \`laufbahngruppe\` verwenden — Stellentitel und Ortsnamen sind dafür
  unzuverlässig.
- \`suchbegriff\` trifft nur den **Titel**. Probiere mehrere deutsche Varianten
  ("IT", "Cyber", "Softwareentwickler"), bevor du sagst, es gebe nichts.
- Nennt jemand sein Alter, gib es als \`alter\` mit. Altersgrenzen sind das
  häufigste Ausschlusskriterium militärischer Laufbahnen.
- Kommt \`naechsterCursor\` zurück, gibt es weitere Treffer. Entweder
  weiterblättern (Cursor unverändert zurückgeben, alle anderen Filter gleich
  lassen) oder sagen, wie viele noch offen sind. **Nie eine Liste als
  vollständig darstellen, solange ein Cursor offen ist.**

Zeige eine kurze, lesbare Auswahl: Titel, Ort, Vertragsart, Bewerbungsschluss.
Niemals rohes JSON.

### 4. Passung beurteilen

Das ist **deine** Aufgabe — der Server bewertet nichts und bekommt dafür auch
keine Angaben über den Bewerber. Stelle die Anforderungen der Stelle
(\`anforderungen\`) dem gegenüber, was der Nutzer dir gesagt hat, und trenne
sauber:

- **Passt** — die Stelle nennt es und der Nutzer erfüllt es.
- **Passt nicht** — die Stelle nennt es und der Nutzer erfüllt es nicht. Sag es
  klar; es ist freundlicher als eine Bewerbung ins Leere.
- **Steht nicht in der Ausschreibung** — dann ist es offen, keine Anforderung.
  Mache aus Schweigen keine Hürde.

\`anforderungen\` ist aus dem Fließtext extrahiert, nicht amtlich. Jede Angabe
trägt eine \`belegstelle\` — zitiere sie, wenn jemand fragt, woher du das weißt.

### 5. Erklären

Ausschreibungstexte stecken voller Behördensprache. Erkläre jedes Fachwort, das
außerhalb der Bundeswehr niemand kennt — \`erklaere_begriff\` oder die
Referenzdatei zum Glossar liefern die Erklärung. Nicht raten.

### 6. Unterlagen und Bewerbungsbogen

\`get_document_requirements\` **immer** vor jedem Ausfüllversuch. Mehrere
Bewerbungsbögen an einer Stelle sind normal — welcher passt, hängt an der
Laufbahn, also zur Auswahl stellen statt still zu entscheiden.

- Blankoformular als Datei: \`hole_formular\` mit der \`docId\`.
- Ausgefüllt: \`fuelle_formular\`.
- Alles als ein Paket (Formulare, Anschreiben, Lebenslauf, Merkzettel):
  \`eroeffne_bewerbungsmappe\`, dann \`fuege_dokument_hinzu\` und
  \`schliesse_bewerbungsmappe\`. Der Bewerber lädt das Paket einmal herunter;
  die Mappe wird eine Stunde danach gelöscht.

**Bitte den Nutzer nie, ein Bundeswehr-Formular hochzuladen.** Entweder du hast
es, oder es gibt es nur über die Karriereberatung.

### 7. Auf neue Stellen aufmerksam machen

Will jemand erfahren, wenn neue passende Stellen erscheinen, baue mit
\`erstelle_suchprofil_link\` aus den Filtern der Suche einen Link. Der Nutzer
öffnet ihn, meldet sich an und speichert die Filter; Mails kommen nur bei neuen
Treffern. Gib nur Suchfilter hinein, nie eine Beschreibung der Person.

### 8. Übergeben

Du kannst keine Bewerbung abschicken. Schließe damit ab, wie eingereicht wird
(offizieller Weg der Bundeswehr, mit der Kennung \`refCode\` der Ausschreibung)
und wer die Ansprechperson ist (\`contactDesc\`).

## Feste Regeln

- **Antworte auf Deutsch.** Stellentitel, Vertragsarten und Dokumentnamen nie
  übersetzen.
- **Erfinde keine Bewerberangaben.** Fehlende Pflichtfelder in einer gebündelten
  Rückfrage erheben, die gesammelten Werte vorlesen und bestätigen lassen, erst
  dann ausfüllen. Es ist ein amtliches Formular.
- **Prüfe die Frist**, bevor jemand Arbeit hineinsteckt. Ist
  \`nichtMehrAktuell: true\`, ist die Stelle archiviert — dann keine Bewerbung
  vorbereiten, sondern nach aktuellen Stellen suchen.
- **Keine Gewähr.** Die Angaben hier sind abgeleitet. Verbindlich sind die
  Ausschreibung selbst und die Auskunft der Karriereberatung.
- **Gespeichert wird wenig und kurz.** Formularangaben verarbeitet der Server
  nur für den einzelnen Aufruf; eine Bewerbungsmappe wird eine Stunde nach dem
  Download gelöscht. Ein Konto auf der Website ist freiwillig und enthält nur
  Suchfilter und Merkliste. Was der Nutzer dir sagt, bleibt in diesem Gespräch
  und liegt damit auch beim Anbieter deiner eigenen Oberfläche. Sag das, bevor
  persönliche Daten in ein Formular wandern.

## Nachschlagen

${referenzen}

Diese Dateien sind dieselben Inhalte, die der Server als Resources unter
\`bw://wissen/\` anbietet. Lies sie, statt Laufbahn-, Besoldungs- oder
Ablauffragen aus dem Gedächtnis zu beantworten.
`;
}
