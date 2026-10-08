# Datenschutz-Folgenabschätzung (DSFA) — Better Bewerbungsportal

Kurzfassung der Datenschutz-Folgenabschätzung und des Verzeichnisses der
Verarbeitungstätigkeiten (Art. 30 DSGVO) für die Original-Instanz
(<https://better-bewerbungsportal.de>). Sie beschreibt, welche personenbezogenen
Daten der Code dieses Repositorys dort verarbeitet, wozu, auf welcher
Rechtsgrundlage und wie lange.

Für Nutzerinnen und Nutzer der Original-Instanz ist die Datenschutzerklärung der
Website maßgeblich. Wer eine eigene Instanz betreibt, ist dafür selbst
Verantwortlicher im Sinne der DSGVO und muss diese Angaben für den eigenen
Betrieb prüfen und anpassen.

## Abschnitt 1 — Überblick

**Verantwortlicher:** der Betreiber der Original-Instanz (Kontakt siehe Impressum
der Website).

**Grundsätze, die für alle Tätigkeiten gelten:**

- Die Ausschreibungsdaten der Bundeswehr sind öffentlich und für jeden lesbar.
  Geschrieben wird ausschließlich serverseitig über das Admin SDK aus den Cloud
  Functions.
- Personenbezogene Daten liegen nur unter `konten/**` (Nutzerkonto) und
  `bewerbungsmappen/**` (transiente Bewerbungsmappe). Die Firestore- und
  Storage-Rules sperren beide Bereiche für jeden Client vollständig (`firestore.rules`,
  `storage.rules`); Zugriff gibt es nur über Cloud Functions.
- Kein Sprachmodell bekommt Bewerberdaten. Gemini erhält ausschließlich
  öffentliche Ausschreibungstexte, deren Felder vor jedem Aufruf ein Zod-Schema
  filtert.
- Feldwerte, Dateinamen, Kennungen und E-Mail-Adressen werden nicht geloggt.
- Personenbezogene Daten dienen nie als Firestore-Dokument-ID oder Index-Key;
  Kontodaten hängen an der Firebase-Auth-`uid`.
- Ausweiskopien nimmt keiner der Wege an (Upload-Seite, MCP-Werkzeuge, Konto).
  Verlangt eine Ausschreibung eine, legt der Bewerber sie seiner Bewerbung
  selbst bei.
- Die Staatsangehörigkeit (Art. 9 DSGVO) wird nur verarbeitet, wenn ein
  Formular ein Feld dafür hat: als Aufrufparameter von `fuelle_formular` und
  im damit ausgefüllten PDF, das der Stundenfrist der Bewerbungsmappe
  unterliegt.

**Auftragsverarbeiter und Verarbeitungsorte:** Google (Firebase / Google Cloud):
Firebase App Hosting in `europe-west4` (Niederlande), Cloud Functions und
Cloud Firestore in `europe-west3` (Frankfurt), Cloud Storage in `europe-west4`,
Request-Logs in Cloud Logging in `europe-west3` (30 Tage). Firebase
Authentication und die Gemini Developer API sind nicht an eine Region gebunden;
Googles Audit-Logs (`_Required`, keine Request-Logs) liegen am Ort `global`.
Mailversand über Resend (siehe Abschnitt 2, „E-Mail-Benachrichtigung").

### Verzeichnis (Kurzform)

| Tätigkeit | Zweck | Datenkategorien | Rechtsgrundlage | Speicherdauer | Empfänger |
|---|---|---|---|---|---|
| Hosting und Server-Protokolle | Seite ausliefern, Fehler finden, Missbrauch abwehren | IP-Adresse, Zeitpunkt, URL (inkl. Pfad und Query), User-Agent, Referer | Art. 6 Abs. 1 lit. f | Request-Logs 30 Tage; Drosselungszähler nur im Arbeitsspeicher | Google |
| Begriffserklärungen (Glossar, Gemini) | Fachbegriffe erklären | keine personenbezogenen Daten (öffentliche Ausschreibungstexte) | nicht einschlägig | bis zur Neuerstellung | Google (Gemini API) |
| Anforderungs-Extraktion (Gemini) | Ausschreibungen filterbar machen | keine personenbezogenen Daten (öffentliche Ausschreibungstexte ohne `contactDesc`) | nicht einschlägig | wie die Ausschreibung | Google (Gemini API) |
| MCP-Server inkl. `fuelle_formular` | Ausschreibungsdaten für das KI-Tool des Bewerbers; Formular ausfüllen | Formularangaben (Name, Geburtsdatum, ggf. Anschrift, Kontakt, Staatsangehörigkeit), Filterwert `alter` | lit. b; Staatsangehörigkeit Art. 9 Abs. 2 lit. a | Feldwerte nur im Aufruf; ausgefülltes PDF wie die Mappe | Google; Ergebnis an das KI-Tool des Bewerbers |
| Transiente Bewerbungsmappe | ein Paket je Bewerbung | Lebenslauf, Zeugnisse, ausgefüllte Formulare, vom KI-Tool verfasste Texte, Dateinamen; keine Ausweiskopie | lit. a; `fuelle_formular` lit. b; `fuege_dokument_hinzu` lit. a und b | 1 Stunde nach Paketbau, ohne Paket 1 Stunde nach letzter Änderung, plus höchstens 15 Minuten | Google |
| KI-Hilfe-Seite je Stelle | Chat-Link statt MCP-Installation | IP-Adresse des Abrufers; Inhalt rein öffentlich | lit. f | Request-Logs 30 Tage | Google; Abrufer |
| Suchfilter als Link (`erstelle_suchprofil_link`) | Suchfilter aus dem KI-Chat ins Konto übernehmen | Suchfilter, optionale Namen je Filter | lit. b | keine (der Link wird nur berechnet) | KI-Tool des Bewerbers |
| Nutzerkonto (Suchprofil, Merkliste) | Suche geräteübergreifend wiederfinden | E-Mail, ggf. Name/Profilbild (Google-Anmeldung), bis zu 10 Suchfilter, Merkliste, Anmeldezeitpunkte | lit. b | bis zur Löschung, spätestens nach 365 Tagen ohne Anmeldung | Google |
| E-Mail-Benachrichtigung und Lösch-Vorwarnung | neue Treffer melden; Löschung ankündigen | E-Mail-Adresse, Mailinhalt, Benachrichtigungszustand | Treffer-Mail lit. a; Vorwarnung lit. b | Zustand wie Konto; Kopie bei Resend nach dessen Frist | Google; Resend |

### Nicht aktive Funktionen

Der Code enthält außerdem Funktionen, um Bewerberangaben und Unterlagen im
Konto zu speichern und daraus ein Bewerbungspaket zu bauen; sie liegen hinter
dem Funktionsschalter `BEWERBERDATEN_IM_KONTO`
(`functions/src/lib/funktionsschalter.ts`), sind standardmäßig ausgeschaltet
und deshalb hier nicht beschrieben.

## Abschnitt 2 — Verarbeitungstätigkeiten

### Bereitstellung der Website und Server-Protokolle (kein KI-Einsatz)

- **Zweck**: Seiten und Endpunkte ausliefern, Fehler analysieren, Missbrauch
  abwehren.
- **Code**: Weboberfläche `web/` auf Firebase App Hosting, Endpunkte unter
  `functions/src/` als Cloud Functions v2; Pro-IP-Drosselung in
  `functions/src/lib/drosselung.ts`.
- **Verarbeitete Daten**: die Request-Logs der Plattform — Client-IP, Zeitpunkt,
  Methode, vollständige URL einschließlich Pfad und Query-String, Statuscode,
  Latenz, User-Agent, Referer. Die eigenen Anwendungslogs enthalten keine
  Feldwerte, Dateinamen, Kennungen oder Adressen. Die Drosselung hält je IP
  (IPv6 je /64-Präfix) einen Zähler nur im Arbeitsspeicher der Instanz. Als Teil
  der URL stehen im Request-Log: der Pfad der Upload-Seite `/mappe/{mappenId}`,
  die Download-Adresse `mappeDownload?mappe=…&token=…` (Einmal-Token), die
  Abbestell-Adresse `kontoAbbestellen?k=<uid>&t=<token>` und die öffentliche
  Kennung einer Stelle in `kiSeite?id=…` bzw. `/k/…`. Bewerberangaben stehen in
  keiner URL.
- **Rechtsgrundlage**: Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse am
  sicheren, fehlerfreien Betrieb.
- **Speicherdauer**: Request-Logs 30 Tage. Drosselungszähler leben nur so lange
  wie die Instanz.
- **Empfänger / Verarbeitungsort**: Google als Auftragsverarbeiter (App Hosting
  `europe-west4`, Cloud Functions `europe-west3`, Cloud Logging `europe-west3`).
  Zugriff auf die Logs hat nur der Betreiber.
- **Risiko und Maßnahmen**: **gering** für die üblichen Verbindungsdaten.
  Restrisiko: Zugriffsschlüssel in URLs (`mappenId`, Download-Token,
  Abmelde-Token) stehen 30 Tage im Log. Wer Log-Zugriff hat, könnte damit eine
  noch bestehende Mappe öffnen oder ein fremdes Konto von der Mail abmelden.
  Gemindert durch den Log-Zugriff ausschließlich des Betreibers, die
  Stundenfrist der Mappe, den einmaligen Download-Token und dadurch, dass der
  Abbestell-Schlüssel nur das Abbestellen erlaubt.

### Begriffserklärungen (Glossar, Gemini)

- **Zweck**: Fachbegriffe aus Bundeswehr und öffentlichem Dienst (Dienstgrade,
  Abkürzungen, Vertrags- und Besoldungsbegriffe) laienverständlich erklären —
  als Tooltip in der Ausschreibung, über `erklaere_begriff` und die Ressource
  `bw://wissen/glossar`.
- **Code**: Die Erklärungen liegen als Referenzdaten in `glossary/{slug}`. Ein
  manuell gestartetes Skript erzeugt sie mit Gemini aus dem Ausschreibungsbestand;
  es ist nicht Teil dieses Repositorys, und seine Ergebnisse werden vor der
  Übernahme von Hand geprüft. Das Markieren der Begriffe in den
  Ausschreibungstexten beim Sync ist reines Text-Matching ohne KI
  (`functions/src/lib/glossaryAnnotate.ts`).
- **Verarbeitete Daten**: ausschließlich öffentliche Ausschreibungsdaten (Titel,
  Vertragsart, Tarifgruppen, Textzeilen mit Fachbegriffen aus `requireDesc` und
  `remarcDesc`). Keine personenbezogenen Daten.
- **Rechtsgrundlage**: nicht einschlägig (keine personenbezogenen Daten).
- **Speicherdauer**: bis zur Neuerstellung des Glossars.
- **Empfänger / Verarbeitungsort**: Google Gemini Developer API
  (`generativelanguage.googleapis.com`), bezahlter Tarif, ohne Regionsbindung.
- **Risiko und Maßnahmen**: **gering** — keine personenbezogenen Daten, für alle
  Nutzer identische Referenzdaten, kein Profiling.
- **Schema-Version**: `glossary-v1`.

### Anforderungs-Extraktion aus Ausschreibungstexten (Gemini)

- **Zweck**: Die formalen Anforderungen einer Ausschreibung (geforderter
  Dienstgrad, Bildungsabschluss, Seiteneinstieg, Sicherheitsüberprüfung,
  Sprachkenntnisse, Mindestberufserfahrung, Mindest- und Höchstalter,
  Verpflichtungsdauer, geforderte Unterlagen) stehen in den Rohdaten nur als
  Fließtext. Die Extraktion macht sie such- und filterbar.
- **Code**: `functions/src/extractJobAttributes.ts`, aufgerufen im nächtlichen
  Sync (`functions/src/sync.ts`) für neu hinzugekommene Ausschreibungen.
- **Verarbeitete Daten**: ausschließlich öffentliche Ausschreibungstexte. Vor
  jedem Aufruf filtert `jobAttributesAiSchema` (Zod) auf genau drei Felder:
  `jobDesc`, `requireDesc`, `remarcDesc`. Nicht übermittelt werden
  `contactDesc` (Namen und Dienstgrade von Ansprechpersonen) und `companyDesc`.
  Keine Bewerberdaten.
- **Rechtsgrundlage**: nicht einschlägig (keine personenbezogenen Daten).
- **Speicherdauer**: Das Ergebnis liegt getrennt von den Originalfeldern unter
  `jobAttributes` an der Ausschreibung und wird mit ihr gelöscht (eine
  abgelaufene Ausschreibung bleibt 60 Tage im Archiv).
- **Empfänger / Verarbeitungsort**: Google Gemini Developer API, Modell
  `gemini-3.5-flash`, bezahlter Tarif (Ein- und Ausgaben werden nach Googles
  Bedingungen nicht zur Produktverbesserung verwendet), ohne Regionsbindung. Die
  aufrufende Cloud Function läuft in `europe-west3`.
- **Risiko und Maßnahmen**: **gering**. Restrisiko ist inhaltliche
  Fehlinterpretation, nicht Datenschutz: Das Modell liefert nur den Dienstgrad;
  die Besoldungsgruppe ordnet die amtliche Tabelle deterministisch zu
  (`functions/src/lib/besoldung.ts`), ein erfundener Dienstgrad führt zu keiner
  Besoldungsangabe. Zu jeder Angabe wird eine wörtliche Belegstelle gespeichert.
- **Schema-Version**: `job-attributes-v2` (wird bei jedem Aufruf geloggt).

### MCP-Server (öffentliche Ausschreibungsdaten und Formularausfüllung, kein KI-Einsatz)

- **Zweck**: Das KI-Tool, das der Bewerber selbst mitbringt, bekommt über das
  Model Context Protocol die öffentlichen Ausschreibungsdaten, Nachschlagewerke
  und eine deterministische Funktion zum Ausfüllen von Bewerbungsformularen. Die
  Beurteilung, ob eine Stelle passt, findet ausschließlich im KI-Tool des
  Nutzers statt; der Server nimmt kein Bewerberprofil entgegen.
- **Code**: `functions/src/mcp/server.ts` (Cloud Function `mcpServer`),
  `functions/src/mcp/tools/*.ts`, Ressourcen unter `bw://wissen/` und
  `bw://formular/{docId}` (`functions/src/mcp/knowledge/`).
- **Verarbeitete Daten**:
  - `list_jobs`, `zaehle_treffer`, `get_job`, `erklaere_begriff`,
    `get_document_requirements`, `hole_formular` und alle Ressourcen:
    ausschließlich öffentliche Ausschreibungsdaten und Referenzmaterial. Einziger
    bewerberbezogener Eingabewert ist der optionale Filter `alter` in
    `list_jobs`; er wird nur für die Abfrage verwendet, weder gespeichert noch
    geloggt.
  - `fuelle_formular`: Nachname, Vorname und Geburtsdatum (Pflicht), optional
    Geburtsort, Anschrift, Telefon, E-Mail, Staatsangehörigkeit,
    Studienabschluss, Führerschein — ausschließlich als Aufrufparameter. Welche
    Angaben eine Vorlage tatsächlich braucht, nennt `get_document_requirements`
    je Vorlage (`benoetigteAngaben`, `nichtVerwendeteAngaben`); das KI-Tool
    erfragt nur diese. Die Feldwerte werden nicht gespeichert, nicht geloggt und
    an kein Sprachmodell gegeben. Das ausgefüllte PDF landet in der
    Bewerbungsmappe des Aufrufs (siehe „Transiente Bewerbungsmappe").
  - Fehlerprotokoll gescheiterter Aufrufe (`functions/src/mcp/lib/werkzeugFehler.ts`):
    Werkzeugname, Fehlerart, bei Eingabefehlern Feldpfad, Zod-Fehlercode und
    Namen unbekannter Parameter, bei Ausführungsfehlern Fehlerklasse und
    Statuscode. Nie ein Feldwert, nie ein Fehlertext, keine IP-Adresse.
- **Rechtsgrundlage**: für die lesenden Werkzeuge nicht einschlägig. Für
  `fuelle_formular` Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahme auf
  Anfrage des Bewerbers über sein eigenes KI-Tool); für die Staatsangehörigkeit
  zusätzlich Art. 9 Abs. 2 lit. a DSGVO.
- **Speicherdauer**: Feldwerte nur für die Dauer des Aufrufs; das ausgefüllte
  PDF wie die Bewerbungsmappe; Fehlerprotokoll 30 Tage.
- **Empfänger / Verarbeitungsort**: Cloud Functions in `europe-west3`, kein
  Drittanbieter, kein Sprachmodell. Das ausgefüllte PDF und alle Antworten
  gehen an das KI-Tool des Bewerbers; dessen Anbieter verarbeitet die Angaben
  nach eigenen Regeln. Darauf weisen die Seite `/ki` und die
  Datenschutzerklärung hin.
- **Zugang**: Der MCP-Server ist öffentlich und verlangt keine Anmeldung. Er
  liest keine Kontodaten (`konten/**`). Gegen Missbrauch begrenzen ihn
  `maxInstances` und eine Pro-IP-Drosselung (`functions/src/mcp/lib/rateLimit.ts`)
  mit einem eigenen, strengeren Kontingent für `fuelle_formular`.
- **Risiko und Maßnahmen**: **gering bis mittel** — Bewerberangaben einschließlich
  einer Art.-9-nahen Angabe gehen durch den Server, werden aber nicht als Feld
  gespeichert, nicht geloggt, nicht indiziert und an kein Sprachmodell gegeben.
  Restrisiko außerhalb unserer Kontrolle: Die Angaben stehen auch im Chatverlauf
  beim KI-Anbieter des Bewerbers.
- **Schema-Version**: nicht anwendbar (kein LLM-Aufruf).

### Transiente Bewerbungsmappe (kein KI-Einsatz)

- **Zweck**: ein herunterladbares Paket (ZIP) je Bewerbung. Das KI-Tool eröffnet
  die Mappe, der Bewerber lädt seine Unterlagen über eine eigene Browser-Seite
  hoch, das KI-Tool legt ausgefüllte Formulare und selbst verfasste Texte
  dazu, und am Ende steht ein ZIP zum einmaligen Download. Drei Datenquellen:
  die Upload-Seite, `fuelle_formular` und `fuege_dokument_hinzu`.
- **Code**: `functions/src/mappe/*`, `functions/src/mappeHttp.ts` (Upload-URL
  ausstellen, Dokument verzeichnen, Dokument löschen, Paket herunterladen),
  `functions/src/raeumeMappenAuf.ts` (viertelstündlicher Aufräumlauf), die
  MCP-Werkzeuge `eroeffne_bewerbungsmappe`, `mappe_status`,
  `fuege_dokument_hinzu`, `schliesse_bewerbungsmappe` und die Upload-Seite
  `/mappe/{mappenId}` (`web/src/features/mappe/`).
- **Verarbeitete Daten**:
  - Über die Upload-Seite: Lebenslauf, Zeugniskopien und sonstige Unterlagen
    (PDF, JPEG, PNG).
  - Über `fuelle_formular`: das ausgefüllte Formular-PDF mit den
    Formularangaben (siehe „MCP-Server").
  - Über `fuege_dokument_hinzu`: der vom KI-Tool verfasste Lebenslauf- oder
    Anschreibentext (Parameter `text`), deterministisch zu einem PDF gerendert
    (`functions/src/mappe/textZuPdf.ts`, kein LLM-Aufruf), oder eine kleine
    fertige Datei (`inhaltBase64`, höchstens 128 KB). Angenommen werden nur die
    Arten Anschreiben, Lebenslauf, Zeugnis und Sonstiges. Der Text wird nicht als
    Firestore-Feld gespeichert und nicht geloggt; er existiert nur als PDF in
    der Mappe.
  - Im Firestore-Datensatz der Mappe: je Dokument Art, Dateiname, Größe und
    Zeitpunkt; der Formularstand (Anzahl gefüllter Felder und Namen fehlender
    Felder, nie Werte); an Textdokumenten optional die Namen noch offener
    Platzhalter in eckigen Klammern (höchstens zehn, je höchstens 40 Zeichen und
    vier Wörter, ohne Ziffern und „@"); an Formularen die öffentliche Kennung der
    Vorlage. Dazu ein Schnappschuss öffentlicher Angaben der Ausschreibung
    (geforderte Unterlagen, Hinweistext, Bewerbungsschluss, Anhänge mit Links,
    Laufbahngruppe).
  - Keine Ausweiskopie: Upload-Seite und MCP-Werkzeuge lehnen `art: "ausweiskopie"`
    mit einer verständlichen Meldung ab. Verlangt die Ausschreibung eine, sagen
    Upload-Seite, Merkzettel und das Feld `selbstBeilegen`, dass der Bewerber sie
    selbst beilegt.
  - Das KI-Tool bekommt nur Metadaten (Status, Feldnamen) und benennt Dokumente
    nach Art und Reihenfolge („Zeugnis 1"), nie nach dem Dateinamen.
- **Rechtsgrundlage**: getrennt nach Datenquelle:
  - *Upload-Seite*: Einwilligung, Art. 6 Abs. 1 lit. a DSGVO, eingeholt auf der
    Seite selbst (Hinweistext über den Upload-Feldern).
  - *`fuelle_formular`*: Art. 6 Abs. 1 lit. b DSGVO (siehe „MCP-Server").
  - *`fuege_dokument_hinzu`*: Art. 6 Abs. 1 lit. a DSGVO durch die eigene
    Handlung des Bewerbers im Gespräch — er gibt seinem KI-Tool die Angaben und
    verlangt daraus einen Lebenslauf oder ein Anschreiben für diese Bewerbung —
    und zugleich Art. 6 Abs. 1 lit. b DSGVO, weil der Zweck allein die Bewerbung
    auf die über `pinstGuid` benannte Stelle ist. Restrisiko: Der Server sieht
    nur den Aufruf, nicht das Gespräch.
- **Speicherdauer**: eine Stunde nach dem Paketbau; wird kein Paket gebaut, eine
  Stunde nach der letzten Änderung (`functions/src/mappe/ablauf.ts`). Nach dem
  Paketbau verlängern weder ein Download noch eine Änderung die Frist. Ab Fristablauf
  ist die Mappe nicht mehr nutzbar; der viertelstündliche Aufräumlauf löscht sie
  spätestens 15 Minuten später. Eine Lifecycle-Regel des Storage-Buckets löscht
  verwaiste Objekte unter `bewerbungsmappen/` nach etwa einem Tag. Das ZIP wird
  nach dem einmaligen Download gelöscht.
- **Empfänger / Verarbeitungsort**: keine außer Google als Auftragsverarbeiter
  (Cloud Functions und Firestore `europe-west3`, Cloud Storage `europe-west4`).
  Kein Sprachmodell, kein Drittanbieter. Die Dateien gehen ausschließlich über
  den Download an den Bewerber selbst.
- **Grenzen**: höchstens 10 Dateien und 30 MB je Mappe, 10 MB je Datei; der
  Dateityp wird an den ersten Bytes geprüft; Längengrenzen für alle Eingaben;
  höchstens 500 gleichzeitig offene Mappen (`MAX_OFFENE_MAPPEN`).
- **Risiko und Maßnahmen**: **mittel** — sensible Unterlagen liegen hinter einem
  einzigen Zugriffsschlüssel (`mappenId`) an einem öffentlichen Endpunkt.
  Maßnahmen: die Stundenfrist, eine nicht erratbare `mappenId`
  (kryptografischer Zufallswert), Pro-IP-Drosselung auf allen Zugängen
  (MCP-Werkzeuge, Upload-Endpunkte und Download mit eigenen Kontingenten,
  `functions/src/mcp/lib/rateLimit.ts`, `functions/src/mappeHttp.ts`),
  gesperrte Firestore- und Storage-Rules, kein Logging von Kennung, Dateinamen
  oder Feldwerten, `noindex` auf der Upload-Seite. Restrisiken: Wer den Link
  zur Upload- oder Download-Seite hat, kommt an die Dateien (das steht auf der
  Seite und in der Datenschutzerklärung). Dateiinhalte werden nicht geprüft —
  wer trotz Hinweis eine Ausweiskopie als „Sonstiges" hochlädt, legt sie für
  die Stundenfrist ab.
- **Schema-Version**: nicht anwendbar (kein LLM-Aufruf).

### KI-Hilfe-Seite je Stelle (Chat-Link, kein KI-Einsatz auf unserer Seite)

- **Zweck**: Bewerbern ohne MCP-fähiges KI-Tool dieselbe Anleitung und dieselben
  öffentlichen Angaben geben — eine Stelle, ein Link, den der Bewerber in sein
  eigenes Chat-Tool einfügt.
- **Code**: `functions/src/kiSeite.ts` (Cloud Function `kiSeite`, nur
  `GET`/`HEAD`, Aufruf `?id=<pinstGuid>`) und der Kurzlink `/k/{pinstGuid}`
  (`web/src/app/k/[id]/route.ts`), der dieselbe Seite serverseitig abruft und
  unverändert weiterreicht.
- **Verarbeitete Daten**: ausschließlich öffentliche Ausschreibungsdaten (Titel,
  Kennung, Ort, Vertragsart, Bewerbungsschluss, Freitexte ohne HTML, geforderte
  Unterlagen, Formularfelder, Glossar, Bewerbungsablauf), ohne `contactDesc`.
  Dazu eine Betreiberzeile mit den Angaben aus dem Impressum. Personenbezogen ist
  nur die IP-Adresse des Abrufers (meist der Server des KI-Anbieters): für die
  Drosselung nur im Arbeitsspeicher und im Request-Log. Keine Cookies, keine
  Bewerberangaben im Link, kein Schreibzugriff.
- **Rechtsgrundlage**: Art. 6 Abs. 1 lit. f DSGVO für IP-Adresse und Request-Log.
- **Speicherdauer**: Request-Logs 30 Tage.
- **Empfänger / Verarbeitungsort**: Google (Cloud Functions `europe-west3`, App
  Hosting `europe-west4`); der Seiteninhalt geht an den Abrufer.
- **Risiko und Maßnahmen**: **gering** für die Verarbeitung bei uns. Restrisiko
  außerhalb unserer Kontrolle: Bewerber geben im fremden KI-Chat persönliche
  Angaben ein. Gemindert, soweit möglich: Die Seite leitet die KI an, nur die
  Angaben zu erfragen, für die das konkrete Formular ein Feld hat, fehlende
  Briefkopf-Angaben als Platzhalter stehen zu lassen, und ist als Anleitung
  formuliert, nicht als Befehl.
- **Schema-Version**: nicht anwendbar (kein LLM-Aufruf).

### Suchfilter als Link (`erstelle_suchprofil_link`, kein KI-Einsatz auf unserer Seite)

- **Zweck**: Der Bewerber beschreibt im eigenen KI-Chat, was er sucht; seine KI
  macht daraus Suchfilter und über dieses Werkzeug einen Link. Der Bewerber
  öffnet ihn, meldet sich an, prüft die Filter und speichert sie in seinem Konto.
- **Code**: `functions/src/mcp/tools/erstelleSuchprofilLink.ts`,
  `functions/src/lib/suchprofilLink.ts`, im Browser
  `web/src/features/konto/lib/suchprofil-link.ts` und
  `web/src/features/konto/components/suchprofil-import.tsx`.
- **Verarbeitete Daten**: höchstens zehn Suchfilter mit den Feldern des
  Suchprofils (ohne Alter) und je Filter ein optionaler Name (höchstens 60
  Zeichen). Das Werkzeug liest und speichert nichts, es berechnet nur den Link.
  Die Filter stehen im Fragment der URL (nach `#`), das kein Browser an einen
  Server schickt; die Übernahmeseite nimmt es sofort aus der Adresszeile, hält es
  nur im Arbeitsspeicher bzw. für den Weg über die Anmeldung im
  `sessionStorage` des Tabs und löscht es, sobald der Bewerber gespeichert oder
  abgelehnt hat oder die Seite verlässt.
- **Rechtsgrundlage**: Art. 6 Abs. 1 lit. b DSGVO. Die Speicherung beginnt erst
  mit dem Übernehmen ins Konto (siehe „Nutzerkonto").
- **Speicherdauer**: beim Werkzeug keine. Der Link liegt im Chatverlauf des
  KI-Anbieters.
- **Empfänger / Verarbeitungsort**: Cloud Functions `europe-west3` für die Dauer
  des Aufrufs; der Link geht an das KI-Tool des Bewerbers.
- **Risiko und Maßnahmen**: **gering**. Restrisiko: Namen, Suchbegriff und
  Wunschort sind Freitext der fremden KI und könnten Persönliches enthalten;
  gemindert durch Längengrenzen und die Anweisung in Werkzeugbeschreibung und
  Rückgabewert, nur Suchfilter in den Link zu legen.
- **Schema-Version**: nicht anwendbar (kein LLM-Aufruf); Linkformat `v1`.

### Nutzerkonto (Suchprofil, Merkliste) (kein KI-Einsatz)

- **Zweck**: Suchfilter und gemerkte Stellen geräteübergreifend wiederfinden;
  Grundlage der E-Mail-Benachrichtigung.
- **Code**: `functions/src/konto/*`, `functions/src/kontoHttp.ts`,
  `functions/src/raeumeKontenAuf.ts`, `web/src/features/auth/*`,
  `web/src/features/konto/*`.
- **Verarbeitete Daten**: E-Mail-Adresse und bei Google-Anmeldung ggf.
  Anzeigename und Profilbild (in Firebase Authentication); bis zu zehn
  Suchfilter mit den Feldern des Suchprofils, je mit optionalem Namen
  (höchstens 60 Zeichen), Schalter aktiv/pausiert, Herkunft und Anlagezeitpunkt;
  die Merkliste (Stellen-IDs, Zeitpunkt des Merkens, ggf. Datum der Treffer-Mail,
  aus der der Eintrag stammt); Anmeldezeitpunkte, nur für die
  Inaktivitätslöschung; der Benachrichtigungszustand (siehe nächster Eintrag).
  Keine Bewerberangaben, kein Alter.
- **Merkliste**: Nach einer versendeten Treffer-Mail setzt der nächtliche Lauf
  die gemeldeten Stellen auf die Merkliste; das steht am Schalter, in der Mail
  und in der Datenschutzerklärung. Stellen, die nicht mehr ausgeschrieben sind,
  entfernt derselbe Lauf von jeder Merkliste. Meldet der Bestand
  unplausibel wenige aktive Stellen, bricht er ohne Löschen ab.
- **Zugriff**: Der Browser greift nie direkt auf `konten/**` zu (Rules
  deny-all). Lesen und Schreiben laufen ausschließlich über die Konto-Functions,
  die vorher das Firebase-ID-Token prüfen; dazu Pro-IP-Drosselung.
- **Rechtsgrundlage**: Art. 6 Abs. 1 lit. b DSGVO (Nutzungsvertrag; der Nutzer
  richtet Konto, Suchfilter und Merkliste selbst ein).
- **Speicherdauer**: bis zur Löschung des Kontos durch den Nutzer; automatische
  Löschung nach 365 Tagen ohne Anmeldung, mit Vorwarnung per Mail 30 Tage
  vorher. Merklisten-Einträge nur, solange die Stelle ausgeschrieben ist.
- **Empfänger / Verarbeitungsort**: Google (Firebase Authentication, Firestore
  und Cloud Functions in `europe-west3`). Firebase Authentication ist nicht an
  eine Region gebunden; Anmeldedaten können auch außerhalb der EU verarbeitet
  werden. Kein Sprachmodell.
- **Risiko und Maßnahmen**: **gering** — keine Bewerberangaben, kein Art.-9-Datum,
  kein Profiling über die eigene Suche hinaus. Maßnahmen: gesperrte Rules,
  Token-Prüfung vor jedem Zugriff, Drosselung, kein Logging von
  Suchprofil-Inhalten oder E-Mail-Adressen. Restrisiko: Ein kompromittiertes
  Konto legt Suchfilter und Merkliste offen.
- **Schema-Version**: `konto-v1` (kein LLM-Aufruf).

### E-Mail-Benachrichtigung bei neuen passenden Stellen (kein KI-Einsatz)

- **Zweck**: Wer mindestens einen aktiven Suchfilter hat und die Mail
  einschaltet, erfährt von neuen passenden Stellen, ohne selbst nachzusehen —
  höchstens eine Mail je Nacht mit bis zu zehn Stellen. Davon getrennt: eine
  Vorwarnung 30 Tage vor der automatischen Löschung eines inaktiven Kontos.
- **Code**: `functions/src/benachrichtige.ts` (nächtlicher Lauf),
  `functions/src/lib/resend.ts` (Versand über die Resend-HTTP-API),
  `functions/src/kontoHttp.ts` (`kontoBenachrichtigungSetzen`,
  `kontoAbbestellen`), `functions/src/raeumeKontenAuf.ts` (Vorwarnung),
  `web/src/features/konto/components/benachrichtigungen.tsx` (Schalter).
- **Verarbeitete Daten**: die E-Mail-Adresse, zur Versandzeit aus Firebase
  Authentication gelesen, nie nach Firestore kopiert und nie geloggt; die
  aktiven Suchfilter, deterministisch ausgewertet mit derselben Suchfunktion wie
  `list_jobs`; die Kennungen bereits gemeldeter Stellen (höchstens 4.000); ein
  Abmelde-Token (128 Bit Zufall). Der Mailinhalt: bei der Treffer-Mail die
  Stellenliste mit Kurzlinks `/k/{pinstGuid}` und ein Abbestell-Link mit `uid`
  und Token, bei der Vorwarnung das Löschdatum und ein Link zur Seite. Keine
  Bewerberangaben.
- **Rechtsgrundlage**:
  - *Treffer-Mail*: Einwilligung, Art. 6 Abs. 1 lit. a DSGVO — der Nutzer
    schaltet sie selbst ein (nie voreingestellt, nur mit bestätigter
    E-Mail-Adresse) und kann sie jederzeit über den Schalter oder den
    Abbestell-Link in jeder Mail widerrufen, einschließlich One-Click-Abbestellen
    nach RFC 8058.
  - *Lösch-Vorwarnung*: Art. 6 Abs. 1 lit. b DSGVO — sie kündigt die im
    Nutzungsvertrag vorgesehene Inaktivitätslöschung an.
- **Speicherdauer**: Der Benachrichtigungszustand liegt im Kontodokument und
  endet mit dem Konto. Resend speichert versendete Mails nach eigener Frist;
  diese Kopie entfernt eine Kontolöschung nicht.
- **Empfänger / Verarbeitungsort**: Google (wie beim Nutzerkonto) und Resend
  (betrieben von Plus Five Five, Inc.) für den Versand: Empfängeradresse,
  Betreff und Mailtext. Laut Resends Datenschutzerklärung werden Daten in die
  USA übermittelt und dort verarbeitet. Vertrag, Übermittlungsgrundlage und
  Aufbewahrungsfrist bei Resend: siehe Abschnitt 4 der Datenschutzerklärung der
  Website. Der Code setzt keine Tracking-Parameter; Öffnungs- und Klick-Tracking
  muss im Resend-Konto ausgeschaltet sein, weil Resend sonst jeden Link
  umschreibt und ein Tracking-Pixel einfügt.
- **Risiko und Maßnahmen**: **mittel**, wegen der Übermittlung an Resend in die
  USA. Für sich genommen gering: Opt-in mit jederzeitigem Widerruf, kein
  Logging von Adressen oder Antworttexten des Mailanbieters, Token-Vergleich in
  konstanter Zeit, Pro-IP-Drosselung auf `kontoAbbestellen`. Restrisiko: `uid`
  und Abmelde-Token stehen im Query-String der Abbestell-Adresse und damit im
  Request-Log; das One-Click-Abbestellen nach RFC 8058 setzt eine solche Adresse
  voraus. Die schlimmste Folge eines Missbrauchs ist das Abbestellen einer Mail.
- **Schema-Version**: nicht anwendbar (kein LLM-Aufruf); der Zustand liegt unter
  `konto-v1`.
