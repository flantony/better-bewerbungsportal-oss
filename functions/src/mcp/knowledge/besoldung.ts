/**
 * Dienstgrad -> Besoldungsgruppe, als lesbares Dokument.
 *
 * WICHTIG: KEIN eigener Inhalt. Die Tabelle wird aus `lib/besoldung.ts` erzeugt,
 * also aus derselben Quelle, mit der auch die Besoldung an den Ausschreibungen
 * abgeleitet wird (Anlage I BBesG). Damit koennen Auskunft und Daten nicht
 * auseinanderlaufen - haette man den Text abgetippt, waere genau das die erste
 * Fehlerquelle.
 */
import { DIENSTGRAD_BESOLDUNG, type Laufbahngruppe } from "../../lib/besoldung";
import { mitHinweis } from "./hinweis";

const REIHENFOLGE: Laufbahngruppe[] = ["Mannschaften", "Unteroffiziere", "Feldwebel", "Offiziere"];

function stufe(von: number, bis: number): string {
  return von === bis ? `A ${von}` : `A ${von} bis A ${bis}`;
}

export function besoldungMarkdown(): string {
  const abschnitte = REIHENFOLGE.map((gruppe) => {
    const zeilen = DIENSTGRAD_BESOLDUNG.filter((eintrag) => eintrag.laufbahngruppe === gruppe)
      .map((eintrag) => `| ${eintrag.dienstgrad} | ${stufe(eintrag.von, eintrag.bis)} |`)
      .join("\n");
    return `### ${gruppe}\n\n| Dienstgrad | Besoldungsgruppe |\n| --- | --- |\n${zeilen}`;
  }).join("\n\n");

  return mitHinweis(
    `# Dienstgrade und Besoldungsgruppen

## Wie die Besoldung zu lesen ist

Soldatinnen und Soldaten sowie Beamtinnen und Beamte werden nach der
**Bundesbesoldungsordnung A** bezahlt: "A 7", "A 11" und so weiter - je höher die
Zahl, desto höher die Grundbesoldung. Zivile Tarifbeschäftigte fallen dagegen
unter den Tarifvertrag mit den Entgeltgruppen **E 1 bis E 15**. In \`list_jobs\`
entscheidet \`besoldungstabelle\` ("A" oder "E"), worauf sich \`mindestbesoldung\`
bezieht.

Innerhalb einer Besoldungsgruppe steigt das Gehalt zusätzlich mit der
Erfahrungsstufe, und es kommen Zulagen hinzu. Die Tabelle unten sagt also, in
welcher Gruppe ein Dienstgrad liegt - nicht, was am Monatsende überwiesen wird.

## Warum hier Spannen stehen

Die Zuordnung ist im Gesetz selbst teilweise mehrdeutig: "Hauptmann" und
"Kapitänleutnant" stehen sowohl in A 11 als auch in A 12, "Oberstleutnant" und
"Fregattenkapitän" in A 14 und A 15. Welche Gruppe gilt, hängt am konkreten
Dienstposten. Deshalb wird hier immer eine Spanne genannt statt eines Wertes, der
eine Genauigkeit vortäuschen würde, die es nicht gibt.

## Sammelbezeichnungen

- **Unteroffizier mit Portepee** = die Feldwebel-Dienstgrade (A 7 aufwärts).
- **Unteroffizier ohne Portepee** = Unteroffizier und Stabsunteroffizier (A 5 bis A 6).

Wer "mit Portepee" als den Dienstgrad "Unteroffizier" liest, ordnet die Stelle
zwei Gruppen zu niedrig ein.

## Die Tabelle

${abschnitte}`,
    [
      "Bundesbesoldungsgesetz, Anlage I (Bundesbesoldungsordnungen A und B): https://www.gesetze-im-internet.de/bbesg/anlage_i.html",
    ],
  );
}
