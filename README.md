# Better Bewerbungsportal

> **Unabhängiges Projekt – keine offizielle Seite der Bundeswehr.**
> Better Bewerbungsportal ist ein privates Open-Source-Projekt. Es steht in keiner
> Verbindung zur Bundeswehr, zum BAPersBw oder einer anderen Behörde und spricht
> nicht in deren Namen. Maßgeblich sind immer die Ausschreibung und das Verfahren
> der Bundeswehr selbst.

Better Bewerbungsportal macht die öffentlichen Stellenausschreibungen der
Bundeswehr leichter durchsuchbar und verständlicher – über eine Weboberfläche
und über einen öffentlichen [MCP-Server](https://modelcontextprotocol.io), an
den Bewerberinnen und Bewerber ihr **eigenes** KI-Werkzeug anbinden können. Die
eigentliche Bewerbungsvorbereitung findet dort statt, nicht auf unserem Server.

*English summary below.*

## Funktionen

- **Stellensuche** über alle öffentlich ausgeschriebenen Stellen, mit Filtern
  (u. a. Ort mit Umkreis, Bereich, Art der Stelle, Vertragsart,
  Beschäftigungsumfang, Besoldung/Entgelt) und Titelsuche; täglich
  synchronisiert aus der öffentlichen Ausschreibungs-Schnittstelle.
- **Stellendetails** mit Erklärungen zu Fachbegriffen, einer Liste der
  einzureichenden Unterlagen und den leeren Formularen zum Herunterladen.
- **Öffentlicher MCP-Server** für das eigene KI-Werkzeug: Stellen suchen und
  zählen (`list_jobs`, `zaehle_treffer`, `get_job`), Begriffe erklären
  (`erklaere_begriff`), Unterlagen und Formulare (`get_document_requirements`,
  `hole_formular`, `fuelle_formular`), eine kurzlebige Bewerbungsmappe
  (`eroeffne_bewerbungsmappe`, `fuege_dokument_hinzu`, `mappe_status`,
  `schliesse_bewerbungsmappe`) und ein Suchprofil-Link
  (`erstelle_suchprofil_link`). Dazu Wissensressourcen (`bw://wissen/…`) zu
  Laufbahnen, Besoldung, Bewerbungsablauf und Glossar sowie ein herunterladbares
  Skill-Bundle für KI-Werkzeuge ohne MCP-Ressourcen.
- **Transiente Bewerbungsmappe**: hochgeladene Unterlagen und ausgefüllte
  Formulare werden zu einem ZIP-Paket gebündelt, einmal heruntergeladen und nach
  spätestens einer Stunde (plus Aufräumintervall) gelöscht.
- **Optionales Konto** (E-Mail/Passwort oder Google): Suchprofil, Merkliste und
  E-Mail-Benachrichtigung bei neuen passenden Stellen.

## Architektur

| Teil | Technik | Aufgabe |
|---|---|---|
| `web/` | Next.js 16, React 19, Tailwind, shadcn/ui; Firebase App Hosting | Weboberfläche, Impressum/Datenschutz, KI-Anbindungsseite |
| `functions/` | Firebase Cloud Functions (Node 22, `europe-west3`) | nächtlicher Sync der Ausschreibungen, öffentlicher MCP-Server, Mappen- und Konto-Endpunkte, Aufräumläufe, Benachrichtigungs-Mails (Resend) |
| `firestore.rules`, `storage.rules` | Cloud Firestore, Cloud Storage | Ausschreibungen öffentlich lesbar, Schreiben nur serverseitig; Konto- und Mappendaten deny-all, Zugriff ausschließlich über Functions mit geprüftem Token |
| Gemini (Google) | `@google/genai` in `functions/` | **nur öffentliche Ausschreibungstexte** (Anforderungs-Extraktion, Glossar). Ein Zod-Schema filtert vor jedem Aufruf die Felder; Bewerberdaten gehen nie an ein Sprachmodell. |

## Eigene Instanz betreiben

Du brauchst Node.js 22, die [Firebase CLI](https://firebase.google.com/docs/cli)
und ein eigenes Firebase-Projekt im Blaze-Tarif (Cloud Functions, Secret
Manager und App Hosting setzen ihn voraus).

1. **Firebase-Projekt anlegen** und darin aktivieren: Cloud Firestore,
   Cloud Storage, Authentication (Anbieter E-Mail/Passwort und Google) und
   App Hosting. Eine Web-App registrieren, um die Client-Konfiguration zu
   bekommen.
2. **Projekt verbinden und Kennungen ersetzen.**
   - `firebase use --add` – legt `.firebaserc` mit deiner Projekt-ID an
   - `cp web/apphosting.example.yaml web/apphosting.yaml` – dann die
     Firebase-Web-Konfiguration deiner Web-App und `NEXT_PUBLIC_APP_URL`
     eintragen (App Hosting liest diese Datei beim Build und zur Laufzeit)

   Im Code stehen noch die Werte der Original-Instanz:
   - `functions/src/mcp/publicSite.ts`, `web/src/config/functions.ts`,
     `web/src/features/ki-anbindung/lib/connection.ts`,
     `functions/src/baueSkillBundle.ts` – öffentliche Adressen der Seite und der Functions
   - `functions/src/lib/devApp.ts` – Projekt-ID und Bucket für lokale Werkzeuge
   - `storage.cors.json` – erlaubte Herkunft für Uploads
   - `web/src/config/betreiber.ts` und `functions/src/lib/betreiber.ts` – **Betreiberangaben für Impressum und Datenschutzerklärung (deine eigenen!)**
   - `web/src/config/quellcode.ts` – Adresse deines Quellcodes (siehe Lizenz)

   `grep -rn better-bewerbungsportal --exclude-dir=node_modules .` findet die restlichen Stellen.
3. **Secrets setzen** (Google Secret Manager):
   ```sh
   firebase functions:secrets:set GEMINI_API_KEY      # Gemini Developer API
   firebase functions:secrets:set SYNC_MANUAL_SECRET  # langer Zufallswert für die manuellen Trigger
   firebase functions:secrets:set RESEND_API_KEY      # Resend, für Benachrichtigungs-Mails
   firebase functions:secrets:set RESEND_DOMAIN       # in Resend verifizierte Absender-Domain
   ```
   Siehe `functions/.env.example` und `web/.env.example`.
4. **Backend deployen:**
   ```sh
   cd functions && npm ci && cd ..
   firebase deploy --only functions,firestore:rules,firestore:indexes,storage
   gcloud storage buckets update gs://<dein-bucket> --cors-file=storage.cors.json
   ```
5. **Web deployen:** in der Firebase-Konsole ein App-Hosting-Backend mit dem
   Stammverzeichnis `web` anlegen und mit deinem Repo verbinden
   (`firebase apphosting:backends:create`). Danach baut jeder Push auf den
   verbundenen Zweig die Seite neu; Functions und Rules deployst du weiter von Hand.
6. **Erster Sync:** der Sync läuft nächtlich um 3 Uhr. Sofort auslösen:
   ```sh
   curl -X POST -H "x-sync-secret: <SYNC_MANUAL_SECRET>" \
     https://europe-west3-<projekt-id>.cloudfunctions.net/syncJobsManual
   ```
7. Optional: **Skill-Bundle** für die KI-Seite neu erzeugen
   (`cd functions && npm run skill:bundle -- --apply`, braucht
   `GOOGLE_APPLICATION_CREDENTIALS`).

Die Glossar-Sammlung (`glossary`) ist in einer neuen Instanz leer; die
Begriffserklärungen in den Ausschreibungen fehlen dann, alles andere läuft.

### Lokale Entwicklung

```sh
cd functions && npm ci && npm test          # Tests der Functions
cd web && npm ci && cp .env.example .env.local && npm run dev
```

Die Weboberfläche spricht auch lokal mit einem echten Firebase-Projekt; trage
dessen Client-Konfiguration in `web/.env.local` ein. Den MCP-Server startest du
lokal mit `cd functions && npm run mcp:dev`.

## Datenschutz

Welche personenbezogenen Daten das Projekt verarbeitet, zu welchem Zweck, wie
lange und auf welcher Rechtsgrundlage, steht in [`DSFA.md`](DSFA.md)
(Kurzfassung der Datenschutz-Folgenabschätzung und des Verzeichnisses der
Verarbeitungstätigkeiten der Original-Instanz). Für Nutzerinnen und Nutzer der
Original-Instanz gilt deren
[Datenschutzerklärung](https://better-bewerbungsportal.de/datenschutz). Wer eine
eigene Instanz betreibt, ist dafür selbst Verantwortlicher im Sinne der DSGVO
und muss Impressum, Datenschutzerklärung und DSFA an den eigenen Betrieb
anpassen.

## Lizenz

[GNU Affero General Public License v3.0 or later](LICENSE)
(`AGPL-3.0-or-later`). Wer eine veränderte Fassung öffentlich als Webdienst
betreibt, muss deren Quellcode den Nutzern anbieten (§ 13 AGPL) – dafür gibt es
`QUELLCODE_URL` in `web/src/config/quellcode.ts`, das einen sichtbaren Link auf
der Seite erzeugt.

Teile der Weboberfläche stammen aus Projekten unter MIT-Lizenz; Hinweise und
Lizenztexte stehen in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Kontakt

Betreiber der Original-Instanz: Florian Antony, florian.antony@mailbox.org
(siehe Impressum der Seite). Sicherheitslücken bitte vertraulich melden, siehe
[`SECURITY.md`](SECURITY.md). Beiträge: [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## English summary

**Better Bewerbungsportal** is an independent, private open-source project – **not
an official Bundeswehr (German armed forces) website** and not affiliated with
any authority. It makes the public Bundeswehr job postings easier to search and
understand, through a web UI (Next.js on Firebase App Hosting) and a public MCP
server (Firebase Cloud Functions) that applicants connect to their own AI tool.
Postings are synced nightly from the public listing API into Firestore; Google
Gemini is used only on public posting texts, never on applicant data. Optional
accounts store a search profile and a watch list; documents uploaded to the
transient application folder are deleted after about an hour. See `DSFA.md` for the data-protection
assessment (German). To run your own instance you need your own Firebase project,
the secrets `GEMINI_API_KEY`, `SYNC_MANUAL_SECRET`, `RESEND_API_KEY` and
`RESEND_DOMAIN`, a `web/apphosting.yaml` copied from
`web/apphosting.example.yaml` with your own values, and to replace the project
identifiers listed above. Licensed
under AGPL-3.0-or-later; third-party notices in `THIRD_PARTY_NOTICES.md`.
