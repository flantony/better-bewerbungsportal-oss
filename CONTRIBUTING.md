# Mitwirken

Danke für dein Interesse! Issues und Pull Requests sind willkommen.

## Issues

- **Fehler melden:** Was hast du getan, was ist passiert, was hättest du
  erwartet? Hilfreich sind die betroffene Seite oder das MCP-Werkzeug, Browser
  bzw. KI-Tool und, falls vorhanden, die Kennung der Stelle.
- **Vorschläge:** Beschreib das Problem, das du lösen willst, nicht nur die
  Lösung.
- **Keine persönlichen Daten** in Issues: keine Lebensläufe, Formularangaben
  oder Screenshots mit Namen.
- **Sicherheitslücken** bitte nie als Issue, sondern vertraulich melden – siehe
  [`SECURITY.md`](SECURITY.md).

## Pull Requests

- Für größere Änderungen am besten zuerst ein Issue öffnen, damit wir die
  Richtung abstimmen können.
- Kleine, in sich geschlossene Pull Requests lassen sich leichter prüfen.
- **Datenschutz zuerst:** Änderungen, die personenbezogene Daten speichern,
  loggen oder an ein Sprachmodell geben, brauchen einen passenden Eintrag in
  [`DSFA.md`](DSFA.md) und werden besonders genau geprüft. Bewerberdaten gehen
  nie an ein Sprachmodell, Feldwerte werden nie geloggt.
- **Vor dem Pull Request:**
  ```sh
  cd functions && npm ci && npm run build && npm test
  cd web && npm ci && npx tsc --noEmit && npm test && npm run lint
  ```
- Jeder Pull Request wird vom Betreiber geprüft. Passende Beiträge können in die
  Original-Instanz unter <https://better-bewerbungsportal.de> übernommen werden.

## Lizenz

Das Projekt steht unter der GNU Affero General Public License v3.0 or later
(siehe [`LICENSE`](LICENSE)). Mit deinem Beitrag stimmst du zu, dass er unter
der AGPL-3.0-or-later veröffentlicht wird.
