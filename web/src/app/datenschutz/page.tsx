import Link from 'next/link';
import { BETREIBER } from '@/config/betreiber';

export const metadata = { title: 'Datenschutzerklärung' };

// Muss zu DSFA.md und zum Code passen. Quellen der Fakten: Regionen aus
// `firebase apphosting:backends:list`, `firestore:databases:get` und `gcloud
// storage buckets describe`, Mappen-Frist aus functions/src/mappe/ablauf.ts,
// Log-Ort und -Aufbewahrung aus `gcloud logging buckets list` (Bucket eu-logs).
// Abschnitt 4 beschreibt Bewerberdaten im Konto als ausgeschaltet
// (Funktionsschalter BEWERBERDATEN_IM_KONTO, functions/src/lib/funktionsschalter.ts) -
// die Seite kennt den Schalter nicht; wird er eingeschaltet, Abschnitt 4 anpassen.
// Wer hier etwas aendert, gleicht DSFA.md mit ab.

export default function DatenschutzPage() {
  return (
    <main className='mx-auto max-w-2xl px-4 py-12'>
      <Link href='/' className='text-muted-foreground text-sm underline-offset-4 hover:underline'>
        ← Zurück
      </Link>

      <h1 className='mt-4 mb-6 text-2xl font-bold'>Datenschutzerklärung</h1>

      <div className='space-y-6 text-sm leading-relaxed'>
        <section>
          <h2 className='mb-1 font-semibold'>1. Das Wichtigste zuerst</h2>
          <p>
            Dieses Angebot zeigt öffentliche Ausschreibungen der Bundeswehr und lässt sich ohne
            Anmeldung nutzen. Ohne Konto legen wir kein Profil und keine Suchhistorie über dich an.
            Wie jeder Webserver protokollieren unsere Server jeden Aufruf mit IP-Adresse; diese
            Protokolle löschen wir nach 30 Tagen. Lässt du dir von deiner KI eine Bewerbungsmappe
            zusammenstellen, liegen deine Dateien und die ausgefüllten Formulare etwa eine Stunde
            bei uns (Abschnitt 3). Legst du dir freiwillig ein Konto an, speichern wir, was du dort
            hinterlegst, bis du es löschst oder dich zwölf Monate lang nicht anmeldest (Abschnitt
            4). Wie lange wir was aufbewahren, steht gesammelt in Abschnitt 7.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>2. Verantwortlicher</h2>
          <p>
            {BETREIBER.name}
            <br />
            E-Mail:{' '}
            <a href={`mailto:${BETREIBER.email}`} className='underline-offset-4 hover:underline'>
              {BETREIBER.email}
            </a>
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>3. Welche Daten verarbeitet werden</h2>
          <p className='mb-2'>
            <strong>Beim Aufruf der Seite:</strong> Dein Browser übermittelt technische
            Verbindungsdaten: IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browsertyp und die Seite,
            von der du kommst. Unsere Server bei Google schreiben diese Angaben in ein Protokoll
            (Google Cloud Logging). Wir brauchen es, um die Seite auszuliefern, Fehler zu finden und
            Missbrauch abzuwehren, etwa um zu viele Anfragen von derselben IP-Adresse zu bremsen.
            Das Protokoll wird nach 30 Tagen automatisch gelöscht und nicht mit anderen Daten
            zusammengeführt. Weil die aufgerufene Adresse mitprotokolliert wird, steht dort auch der
            Link zu einer Upload-Seite (s. unten), wenn du ihn aufrufst; Zugriff auf das Protokoll
            hat nur der Betreiber.
          </p>
          <p className='mb-2'>
            <strong>Beim Ausfüllen eines Bewerbungsbogens über deine KI:</strong> Bittest du dein
            KI-Tool, einen Bewerbungsbogen auszufüllen, schickt es uns die Angaben, die dieser
            Vordruck braucht (Vor- und Nachname, Geburtsdatum; je nach Vordruck auch Geburtsort,
            Anschrift, Telefon, E-Mail, akademischer Grad, Führerscheinklassen und
            Staatsangehörigkeit). Wir setzen sie in die PDF-Datei ein. Die einzelnen Werte speichern
            wir nicht in unserer Datenbank und schreiben sie in kein Protokoll. Die{' '}
            <strong>ausgefüllte PDF-Datei</strong> enthält sie aber und liegt danach in deiner
            Bewerbungsmappe, bis die Mappe gelöscht wird, also etwa eine Stunde (nächster Absatz).
          </p>
          <p className='mb-2'>
            <strong>Beim Zusammenstellen einer Bewerbungsmappe:</strong> Dein KI-Tool legt dafür
            eine eigene Ablage an und gibt dir einen Link zu einer Upload-Seite. Dort lädst du selbst
            hoch, was du schon fertig hast, üblicherweise Lebenslauf und Zeugnisse. Dazu kommen die
            ausgefüllten Formulare und Texte, die deine KI für dich geschrieben hat (etwa ein
            Anschreiben); sie legt sie als PDF in die Mappe. <strong>Ausweiskopien nehmen wir nicht
            entgegen</strong>, auch nicht als „Sonstiges". Verlangt die Ausschreibung eine, legst du
            sie deiner Bewerbung selbst bei.
          </p>
          <p className='mb-2'>
            <strong>Wann die Mappe gelöscht wird:</strong> eine Stunde, nachdem dein Download-Paket
            gebaut wurde. Wird nie ein Paket gebaut, eine Stunde nach der letzten Änderung an der
            Mappe. Ab diesem Zeitpunkt lässt sich die Mappe nicht mehr benutzen; unser
            Aufräumprogramm läuft alle 15 Minuten und löscht sie spätestens dann endgültig. Ein
            späterer Download oder eine spätere Änderung verlängert die Frist nach dem Paketbau
            nicht; nur ein neuer Paketbau startet die Stunde neu. Bleibt nach einem technischen Fehler eine einzelne Datei ohne Mappe zurück,
            löscht sie eine zweite Regel nach etwa einem Tag.
          </p>
          <p className='mb-2'>
            Wir geben die Dateien an niemanden weiter, auch nicht an eine KI: dein KI-Tool erfährt
            nur, welche Art von Dokument angekommen ist („Zeugnis 1"), nie die Datei oder ihren
            Namen. Die Mappe funktioniert ohne Anmeldung, deshalb ist der Link zur Upload-Seite der
            einzige Schlüssel: wer ihn kennt, kann die Dateien sehen und löschen. Behandle ihn wie
            ein Passwort. Einzelne Dateien kannst du jederzeit selbst über den Löschen-Knopf auf der
            Upload-Seite entfernen.
          </p>
          <p className='mb-2'>
            <strong>Bei der KI-Hilfe-Seite zu einer Stelle:</strong> Statt dein KI-Tool fest
            anzubinden, kannst du ihm den Link zu einer Stelle geben. Hinter dem Link steht eine
            reine Textseite mit den öffentlichen Angaben dieser Ausschreibung und einer Anleitung
            für deine KI, ohne das Kontaktfeld der Ausschreibung (Ansprechpersonen) und ohne
            Angaben über dich. Die Ausschreibungstexte selbst geben wir so weiter, wie die
            Bundeswehr sie veröffentlicht hat. Ruft deine KI
            die Seite ab, sehen wir im Protokoll die IP-Adresse des abrufenden Servers (meist der
            deines KI-Anbieters, nicht deine). Was du danach in diesem Chat eingibst, bleibt bei
            deinem KI-Anbieter.
          </p>
          <p>
            <strong>Ohne Konto keine dauerhaften Profildaten.</strong> Ein Bewerberprofil und eine
            KI-gestützte Stellensuche gab es früher; beides ist samt aller Daten gelöscht. Was ein
            freiwilliges Konto speichert, steht in Abschnitt 4.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>4. Dein Konto</h2>
          <p className='mb-2'>
            Für die Stellensuche brauchst du kein Konto. Willst du dein Suchprofil und gemerkte
            Stellen über mehrere Geräte hinweg wiederfinden, kannst du dich freiwillig registrieren:
            mit E-Mail-Adresse und Passwort oder über dein Google-Konto.
          </p>
          <p className='mb-2'>
            <strong>Was wir dafür speichern:</strong> deine E-Mail-Adresse und, wenn du dich mit
            Google anmeldest, zusätzlich Anzeigename und Profilbild, so wie Google sie übermittelt.
            Das liegt in Firebase Authentication, nicht in unserer eigenen Datenbank. Dein
            Suchprofil (bis zu zehn Filter mit denselben Feldern wie bei der Stellensuche:
            Suchbegriff, militärisch oder zivil, Organisationsbereich, Laufbahngruppe,
            Vertragsarten, Voll- oder Teilzeit, Bundesländer, Wunschort, Einstiegswege,
            Seiteneinstieg, Mindestbesoldung und Besoldungstabelle; dazu je Filter ein
            freiwilliger Name, ob er gerade pausiert ist und ob du ihn selbst angelegt hast oder
            deine KI) und deine Merkliste (welche Stellen du dir gemerkt hast und wann, bei
            Stellen aus einer Treffer-Mail zusätzlich das Datum dieser Mail) speichern wir unter
            deiner Nutzerkennung in unserer Datenbank. Stellen, die nicht mehr ausgeschrieben sind,
            entfernen wir jede Nacht von der Merkliste. Den Zeitpunkt deiner
            letzten Anmeldung lesen wir nur, um ungenutzte Konten nach einem Jahr zu löschen (s.
            unten). Bewerberangaben wie Name oder Adresse und Unterlagen nehmen wir im Konto derzeit
            nicht entgegen (nächster Absatz).
          </p>
          <p className='mb-2'>
            <strong>Derzeit nicht angeboten: Angaben, Unterlagen und Bewerben mit deinem Konto.</strong>{' '}
            Seit dem 8. Oktober 2026 kannst du in deinem Konto keine Bewerberangaben (auch nicht
            deine Staatsangehörigkeit) und keine Unterlagen mehr hinterlegen, und wir stellen kein
            Bewerbungspaket aus deinem Konto mehr zusammen. Was du einreichen musst, steht ohne
            Anmeldung auf der Seite jeder Stelle, samt Formularen und einer Checkliste. Hast du vorher
            Angaben oder Unterlagen hinterlegt, liegen sie noch bei uns, bis du sie löschst: Auf „Mein
            Konto" siehst du sie unter „Früher gespeicherte Angaben und Unterlagen", kannst Dateien
            herunterladen und alles löschen; sie stehen auch in „Meine Daten herunterladen" und
            verschwinden spätestens mit deinem Konto. Für diesen Altbestand gilt, was die folgenden
            Absätze beschreiben: So hat es funktioniert, solange wir es angeboten haben.
          </p>
          <p className='mb-2'>
            <strong>Deine gespeicherten Angaben und Unterlagen (derzeit nicht angeboten).</strong> Unter
            „Meine Angaben" und „Meine Unterlagen" kannst du dir freiwillig Bewerberangaben merken und Unterlagen
            ablegen, damit du sie nicht bei jeder Bewerbung neu heraussuchen musst. Speicherbar
            sind: Vor- und Nachname, Geburtsdatum, Geburtsort, Anschrift (Straße, Postleitzahl,
            Ort), Telefonnummer, E-Mail-Adresse, ein akademischer Abschluss und eine
            Führerscheinklasse sowie, nur mit deiner eigenen, nie vorangehakten Einwilligung (Art. 9
            Abs. 2 lit. a DSGVO), deine Staatsangehörigkeit. Wir vermerken Zeitpunkt und Fassung des
            Einwilligungstexts. Widerrufst du, löschen wir Wert und Vermerk sofort.
          </p>
          <p className='mb-2'>
            Als Unterlage kannst du Lebenslauf, Zeugnisse und Sonstiges hochladen (PDF, JPEG oder
            PNG, je Datei höchstens 10 MB, insgesamt höchstens 15 Dateien bzw. 50 MB).{' '}
            <strong>Ausweiskopien nehmen wir nicht entgegen</strong>, auch nicht als „Sonstiges";
            verlangt eine Ausschreibung eine, legst du sie deiner Bewerbung selbst bei. Bricht ein
            Hochladen ab, löschen wir die halb übertragene Datei nach etwa einer, spätestens nach
            zwei Stunden.
          </p>
          <p className='mb-2'>
            <strong>Bewerben mit deinem Konto (derzeit nicht angeboten).</strong> Bei einer
            Ausschreibung konntest du auf „Bewerben" klicken. Wir zeigen dir, welche Bewerbungsbögen
            sich aus deinen gespeicherten Angaben ausfüllen lassen und was noch fehlt. Anschreiben
            und Lebenslauf kannst du dort eintippen oder als Textblock aus deinem KI-Chat einfügen.
            Platzhalter darin (etwa „Adresse" in eckigen Klammern) füllt die Seite{' '}
            <strong>in deinem Browser</strong> aus deinen gespeicherten Angaben aus. Dafür lädt die
            Seite deine gespeicherten Angaben in den Arbeitsspeicher dieses Browser-Tabs, nicht auf
            die Festplatte; sie verschwinden, wenn du dich abmeldest oder den Tab schließt. Deine
            Texte schicken wir nur zum Paketbau an unseren Server, wandeln sie in PDF-Dateien um und
            speichern den Text selbst nirgends.
          </p>
          <p className='mb-2'>
            Auf Wunsch bauen wir daraus ein Download-Paket: die ausgefüllten Formulare, die gewählten
            Unterlagen, deine Texte als PDF und ein Merkzettel mit den nächsten Schritten. Das Paket
            liegt höchstens etwa eine, spätestens zwei Stunden bei uns; der Download-Link gilt 5
            Minuten. Ein neues Paket ersetzt das alte sofort. Widerrufst du die Einwilligung zur
            Staatsangehörigkeit oder löschst du Angaben oder eine Unterlage, löschen wir ein
            vorhandenes Paket ebenfalls sofort. Deine Staatsangehörigkeit setzen wir nur ein, wenn
            du dafür eingewilligt hast. Kein KI-Modell liest bei alldem mit, auch nicht dein eigenes
            KI-Tool, das über die Anbindung (Abschnitt 5) keinen Zugriff auf dein Konto hat.
          </p>
          <p className='mb-2'>
            Du kannst jede Angabe, jede Datei oder alles auf einmal jederzeit selbst löschen. Über
            „Meine Daten herunterladen" bekommst du eine Kopie deiner Angaben samt
            Einwilligungsvermerken und ein Verzeichnis deiner Unterlagen; die Dateien selbst lädst du
            einzeln herunter. Rechtsgrundlage ist der Nutzungsvertrag, den du mit der Registrierung
            schließt (Art. 6 Abs. 1 lit. b DSGVO); für die Staatsangehörigkeit zusätzlich deine
            Einwilligung (Art. 9 Abs. 2 lit. a DSGVO).
          </p>
          <p className='mb-2'>
            <strong>Wie lange dein Konto besteht:</strong> bis du es löschst. Das geht jederzeit in den
            Kontoeinstellungen, sofort und unwiderruflich, samt allen Angaben und Unterlagen. Meldest
            du dich zwölf Monate lang nicht an, löschen wir es automatisch. Etwa 30 Tage vorher bekommst
            du eine Vorwarnung an deine bestätigte E-Mail-Adresse; meldest du dich danach an,
            entfällt die Löschung. Die Vorwarnung gehört zur Kontoführung und lässt sich nicht
            gesondert abbestellen.
          </p>
          <p className='mb-2'>
            <strong>E-Mail-Benachrichtigung bei neuen passenden Stellen:</strong> Auf „Mein Konto"
            (oder beim Übernehmen von Suchfiltern aus deiner KI) kannst du einschalten, dass wir dir eine Mail schicken, sobald eine neue Ausschreibung zu
            einem deiner Suchfilter passt, höchstens einmal pro Nacht und mit bis zu zehn Stellen. Der
            Schalter ist anfangs aus. Du schaltest ihn dort wieder aus oder bestellst über den Link
            in jeder Mail ab, ohne dich anzumelden. Dafür speichern wir, ob der Schalter an ist,
            einen Abbestell-Code und die Kennungen der Stellen, zu denen du schon eine Mail bekommen
            hast. Die Stellen aus jeder Treffer-Mail setzen wir auch auf deine Merkliste, damit
            du sie dort wiederfindest; was bereits daraufsteht, bleibt, wie es ist. Schaltest du die
            Mail aus, kommen keine neuen dazu; die schon eingetragenen bleiben, bis du sie entfernst
            oder die Stelle nicht mehr ausgeschrieben ist. Jede Stelle in der Mail hat zusätzlich einen
            Link für deine eigene KI; er enthält nur die öffentliche Kennung der Stelle, nichts über
            dich.
          </p>
          <p className='mb-2'>
            <strong>Mailversand über Resend:</strong> Beide Mails (Vorwarnung und Treffer-Mail)
            verschicken wir über den Dienst Resend (betrieben von Plus Five Five, Inc.). Resend
            erhält dabei deine E-Mail-Adresse und den Inhalt der Mail:
            bei der Treffer-Mail die passenden Stellen mit Links und den Abbestell-Link, der deine
            Nutzerkennung und den Abbestell-Code enthält; bei der Vorwarnung das Löschdatum und einen
            Link zu unserer Seite. Laut seiner Datenschutzerklärung überträgt Resend Daten in die USA
            und verarbeitet sie dort. Derzeit geprüft werden: der Vertrag mit Resend über die
            Verarbeitung in unserem Auftrag, auf welcher Grundlage die Übermittlung in ein Land
            außerhalb der EU erfolgt, und ob und wie lange Resend versendete Mails aufbewahrt. Eine
            Kontolöschung bei uns erreicht eine solche Kopie nicht. Wir tragen das Ergebnis hier
            nach.
          </p>
          <p>
            Für die Anmeldung nutzen wir Firebase Authentication von Google (s. Abschnitt 8).
            Meldest du dich über Google an, übermittelt Google dabei deinen Namen, dein Profilbild
            und deine E-Mail-Adresse an uns; wie Google diese Anmeldung selbst verarbeitet, regeln
            die Datenschutzbestimmungen von Google.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>5. Anbindung deines eigenen KI-Tools</h2>
          <p className='mb-2'>
            Du kannst dein eigenes KI-Tool (z.&nbsp;B. Claude oder ChatGPT) mit unseren
            Ausschreibungsdaten verbinden (technisch: ein sogenannter MCP-Server) oder ihm den Link
            zur KI-Hilfe-Seite einer Stelle geben. Beides geht ohne Anmeldung. Eine Anleitung
            findest du unter{' '}
            <Link href='/ki' className='underline underline-offset-4'>
              „Mit deiner KI bewerben"
            </Link>
            .
          </p>
          <p>
            <strong>Wichtig:</strong> Was du in deinem KI-Tool eingibst, verarbeitet dessen Anbieter
            (z.&nbsp;B. Anthropic oder OpenAI) nach seinen eigenen Datenschutzbestimmungen; darauf
            haben wir keinen Einfluss. Überlege daher, welche persönlichen Angaben du dort eingibst.
            Bei uns kommt davon nur an, was deine KI an uns schickt: Suchanfragen (etwa Suchbegriff,
            Ort oder dein Alter als Filter, nur für diese eine Abfrage und nicht gespeichert) und
            Angaben zum Ausfüllen eines Bewerbungsbogens oder für deine Bewerbungsmappe (Abschnitt
            3). Bittest du deine KI, dir einen Suchprofil-Link zu erstellen, schickt sie uns die
            Suchfilter (und Namen dafür, falls du welche vergibst); wir rechnen daraus nur den Link
            und speichern nichts. Die Filter stehen im Link hinter dem „#" und erreichen unseren
            Server deshalb nicht. Gespeichert werden sie erst, wenn du sie auf der Übernahmeseite in
            dein Konto übernimmst. Den Namen eines Filters kannst du frei wählen; schreib dort
            bitte nichts Persönliches hinein.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>6. Wofür wir KI einsetzen</h2>
          <p>
            Wir lassen Google Gemini die Anforderungen aus den öffentlichen Ausschreibungstexten
            herauslesen (etwa Dienstgrad, Altersgrenzen, geforderte Unterlagen), damit sich danach
            filtern lässt, und haben damit einmalig ein Glossar für Fachbegriffe erstellt. Dorthin
            gehen ausschließlich die veröffentlichten Texte der Bundeswehr, ohne das Kontaktfeld mit
            den Ansprechpersonen und niemals Angaben von Bewerbern. Wir nutzen dafür die Gemini-API von
            Google ohne Festlegung auf eine Region; die Verarbeitung kann daher auch außerhalb der EU
            stattfinden. Die laufende Auswertung läuft im bezahlten Tarif; nach Googles Bedingungen
            dafür werden diese Texte nicht zur Verbesserung von Googles Produkten verwendet.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>7. Speicherdauer</h2>
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              <strong>Server-Protokolle</strong> (IP-Adresse, Zeitpunkt, aufgerufene Adresse,
              Browsertyp): 30 Tage, dann automatisch gelöscht.
            </li>
            <li>
              <strong>Angaben für einen Bewerbungsbogen über deine KI:</strong> die einzelnen Werte
              nur für den Moment des Ausfüllens; die ausgefüllte PDF-Datei so lange wie die
              Bewerbungsmappe.
            </li>
            <li>
              <strong>Bewerbungsmappe</strong> samt Dateien: eine Stunde nach dem Bau des
              Download-Pakets, ohne Paket eine Stunde nach der letzten Änderung; endgültig gelöscht
              spätestens 15 Minuten danach. Einzelne zurückgebliebene Dateien nach einem Fehler:
              etwa ein Tag.
            </li>
            <li>
              <strong>Konto</strong> mit Suchprofil, Merkliste, Benachrichtigungs-Einstellung und
              früher hinterlegten Angaben und Unterlagen: bis du es oder einzelne Teile löschst,
              spätestens zwölf Monate nach deiner letzten Anmeldung.
            </li>
            <li>
              <strong>Staatsangehörigkeit im Konto:</strong> wie das Konto, aber bis zu deinem
              Widerruf, der sofort löscht.
            </li>
            <li>
              <strong>Abgebrochener Upload ins Konto</strong> und <strong>Bewerbungspaket aus dem
              Konto:</strong> etwa eine, spätestens zwei Stunden.
            </li>
            <li>
              <strong>Gespeicherte Angaben im Browser</strong> auf der Bewerben-Seite: bis du dich
              abmeldest oder den Tab schließt.
            </li>
            <li>
              <strong>Kopien versendeter Mails bei Resend:</strong> wird derzeit geprüft (s.
              Abschnitt 4).
            </li>
            <li>
              <strong>Ausschreibungsdaten</strong> (keine Daten über dich): bis etwa 60 Tage nach
              Ablauf der Bewerbungsfrist.
            </li>
          </ul>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>8. Wer noch beteiligt ist</h2>
          <p className='mb-2'>
            <strong>Google</strong> als unser Auftragsverarbeiter (Firebase und Google Cloud): Die
            Webseite läuft über Firebase App Hosting in den Niederlanden (Region europe-west4).
            Unsere Datenbank und unsere Server-Funktionen liegen in Frankfurt am Main
            (europe-west3), hochgeladene Dateien in Cloud Storage in den Niederlanden
            (europe-west4). Die Server-Protokolle führt Google Cloud Logging, seit dem 7. Oktober
            2026 ebenfalls in Frankfurt am Main (europe-west3); ältere Protokolle liegen bis zu ihrer
            Löschung nach 30 Tagen noch an einem nicht auf die EU festgelegten Ort. Googles eigene
            Prüfprotokolle über Verwaltungsvorgänge im Projekt (Aufrufe unserer Seiten stehen dort
            nicht) bewahrt Google 400 Tage auf, ebenfalls ohne Festlegung auf die EU. Die Anmeldung
            läuft über Firebase Authentication, einen
            weltweit betriebenen Dienst von Google; dabei können Anmeldedaten auch außerhalb der EU
            verarbeitet werden. Die Auswertung der Ausschreibungstexte läuft über die Gemini-API
            (Abschnitt 6). Auf welcher Grundlage Google Daten in Länder außerhalb der EU übermittelt,
            regeln Googles Bedingungen zur Auftragsverarbeitung; die genaue Fundstelle prüfen wir
            und tragen sie hier nach.
          </p>
          <p className='mb-2'>
            <strong>Resend</strong> für den Mailversand, sobald wir dir eine Mail zu deinem Konto
            schicken (Abschnitt 4, dort auch, was dazu noch geprüft wird).
          </p>
          <p>
            <strong>Die Bundeswehr:</strong> Ausschreibungen und ihre Anhänge rufen wir von den
            öffentlichen Servern der Bundeswehr ab. Dabei übermitteln wir keine Angaben über dich.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>9. Cookies</h2>
          <p>
            Wir setzen keine Cookies zu Werbe- oder Analysezwecken. Im Browser gespeichert wird nur,
            ob du die Seitenleiste ein- oder ausgeklappt hast, welches Farbschema du gewählt hast,
            und, wenn du dich anmeldest, deine Anmeldung selbst. Öffnest du einen Suchprofil-Link
            ohne angemeldet zu sein, merkt sich dieser Browser-Tab die Filter bis nach der Anmeldung
            (sessionStorage, gelöscht nach dem Übernehmen oder Verwerfen und spätestens mit dem
            Schließen des Tabs). Das ist für die Funktion der
            Seite nötig, deshalb fragen wir dafür nicht eigens um Erlaubnis (§ 25 Abs. 2 Nr. 2
            TDDDG). Das Farbschema-Cookie gilt ein Jahr, das Seitenleisten-Cookie sieben Tage.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>10. Deine Rechte</h2>
          <p className='mb-2'>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
            Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO). Schreib uns dafür an die oben
            genannte E-Mail-Adresse. Mit Konto kannst du Auskunft, Berichtigung und Löschung auch
            direkt in deinen Kontoeinstellungen erledigen.
          </p>
          <p className='mb-2'>
            <strong>Ohne Konto</strong> haben wir nur wenige Daten über dich, und die nur kurz: eine
            Bewerbungsmappe (etwa eine Stunde; Dateien darin löschst du selbst auf der
            Upload-Seite) und die Server-Protokolle (30 Tage). Die Protokolle können wir dir nur
            zuordnen, wenn du uns sagst, wann du die Seite mit welcher IP-Adresse aufgerufen hast
            (Art. 11 DSGVO). Was du in deinem KI-Tool eingegeben hast, liegt bei dessen Anbieter,
            nicht bei uns. Dorthin richtest du Auskunft und Löschung zu diesen Daten.
          </p>
          <p className='mb-2'>
            <strong>Widerruf einer Einwilligung (Art. 7 Abs. 3 DSGVO):</strong> Jede Einwilligung
            kannst du jederzeit ohne Begründung widerrufen; was bis dahin geschah, bleibt
            rechtmäßig. So geht es: Die Einwilligung zur Staatsangehörigkeit im Konto widerrufst du
            über „Einwilligung widerrufen" auf „Mein Konto" (derzeit unter „Früher gespeicherte
            Angaben und Unterlagen"). Dateien in einer Mappe löschst du auf der Upload-Seite. Die
            Treffer-Mail schaltest du mit dem Schalter auf „Mein Konto" aus oder über den
            Abbestell-Link in der Mail. Oder du schreibst uns jederzeit eine E-Mail.
          </p>
          <p className='mb-2'>
            <strong>Widerspruch (Art. 21 DSGVO):</strong> Wo wir uns auf unser berechtigtes
            Interesse stützen (Server-Protokolle, KI-Hilfe-Seite), kannst du aus Gründen, die sich
            aus deiner besonderen Situation ergeben, jederzeit widersprechen. Schreib uns dafür an
            die oben genannte E-Mail-Adresse.
          </p>
          <p className='mb-2'>
            <strong>Freiwillig, ohne automatisierte Entscheidung:</strong> Du bist weder gesetzlich
            noch vertraglich verpflichtet, uns Daten zu geben. Ohne Verbindungsdaten lässt sich die
            Seite nicht ausliefern; ohne die jeweiligen Angaben können wir kein Formular ausfüllen
            und kein Konto führen. Es gibt keine automatisierte Entscheidung über dich im Sinne von
            Art. 22 DSGVO. Ob eine Stelle zu dir passt, beurteilst du selbst
            oder dein KI-Tool.
          </p>
          <p>
            <strong>Beschwerde:</strong> Du kannst dich bei einer Datenschutz-Aufsichtsbehörde
            beschweren (Art. 77 DSGVO), insbesondere in dem Land, in dem du wohnst oder arbeitest.
            Für uns zuständig ist die Landesdatenschutzbehörde, die für den Wohnsitz des
            Verantwortlichen zuständig ist.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>11. Rechtsgrundlage</h2>
          <p>
            Verbindungsdaten und Server-Protokolle verarbeiten wir auf Grundlage unseres
            berechtigten Interesses am sicheren Betrieb des Angebots (Art. 6 Abs. 1 lit. f DSGVO);
            dasselbe gilt für die KI-Hilfe-Seite zu einer Stelle, die nur öffentliche Angaben
            enthält. Die Angaben zum Ausfüllen eines Bewerbungsbogens verarbeiten wir zur
            Durchführung der von dir angestoßenen Maßnahme (Art. 6 Abs. 1 lit. b DSGVO); nennst du
            dabei deine Staatsangehörigkeit, geschieht das auf Grundlage deiner Einwilligung (Art. 9
            Abs. 2 lit. a DSGVO). Für die Dateien einer Bewerbungsmappe gilt deine Einwilligung, die
            du mit dem Hochladen auf der Upload-Seite gibst (Art. 6 Abs. 1 lit. a DSGVO). Lässt du
            deine KI einen Lebenslauf oder ein Anschreiben für dich schreiben und in
            die Mappe legen, ist das die Handlung, mit der du dem zustimmst (Art. 6 Abs. 1 lit. a
            und lit. b DSGVO). Dein Konto richtest du selbst ein; das ist Erfüllung des damit
            geschlossenen Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO). Dieselbe Grundlage gilt
            für Angaben, Unterlagen und Texte, die du im Konto hinterlegt oder für ein
            Bewerbungspaket eingefügt hast (derzeit nicht angeboten, s. Abschnitt 4), und für die Vorwarnung vor der Löschung eines inaktiven
            Kontos. Für die Staatsangehörigkeit im Konto brauchen wir zusätzlich deine
            ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO); setzen wir die
            Staatsangehörigkeit in ein Formular ein, stützen wir uns auf dieselbe Einwilligung. Die
            Treffer-Mail schaltest du selbst ein; das ist deine Einwilligung (Art. 6 Abs. 1 lit. a
            DSGVO).
          </p>
        </section>
      </div>
    </main>
  );
}
