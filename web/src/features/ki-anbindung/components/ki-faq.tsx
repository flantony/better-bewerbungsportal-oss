'use client';

import Link from 'next/link';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { KI_VERBINDUNGS_URL } from '../lib/connection';

export function KiFaq() {
  return (
    <div className='space-y-4'>
      <h2 className='font-serif text-2xl font-bold tracking-tight'>Häufige Fragen</h2>
      <Accordion className='w-full'>
        <AccordionItem value='kosten'>
          <AccordionTrigger>Kostet das etwas?</AccordionTrigger>
          <AccordionContent>
            Unsere Seite ist kostenlos. Ob dein KI-Tool eigene Verbindungen erlaubt, hängt von deinem
            Tarif dort ab; das entscheidet der Anbieter. Der Link zu einer Stelle funktioniert auch
            mit kostenlosen Tarifen.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='chats'>
          <AccordionTrigger>Seht ihr, was ich mit meiner KI bespreche?</AccordionTrigger>
          <AccordionContent>
            Nein. Wir sehen nur die Anfragen, die deine KI an uns stellt, etwa „zivile Stellen in
            Köln“ oder die Angaben, die für einen Bewerbungsbogen nötig sind.
            Dein restlicher Chatverlauf bleibt bei deinem KI-Anbieter.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='daten'>
          <AccordionTrigger>Werden meine persönlichen Daten gespeichert?</AccordionTrigger>
          <AccordionContent>
            Über die Anbindung an deine KI nur kurz: Füllt deine KI einen Bewerbungsbogen aus,
            liegt das ausgefüllte Formular zusammen mit deinen hochgeladenen Unterlagen in einer
            Bewerbungsmappe bei uns. Die Mappe wird eine Stunde nach dem Zusammenstellen deines
            Pakets automatisch gelöscht. Stellst du nie eins zusammen, löschen wir sie eine Stunde
            nach der letzten Änderung. Dein KI-Anbieter speichert euren Chatverlauf nach seinen
            eigenen Regeln. Ein freiwilliges Konto speichert Suchprofil, Merkliste und die
            Einstellung für Benachrichtigungen. Bewerberangaben und Unterlagen nehmen wir dort derzeit nicht
            entgegen. Details in unserer{' '}
            <Link href='/datenschutz' className='underline underline-offset-4'>
              Datenschutzerklärung
            </Link>
            .
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='konto'>
          <AccordionTrigger>Brauche ich dafür ein Konto bei euch?</AccordionTrigger>
          <AccordionContent>
            Nein. Weder für die Anbindung an deine KI noch für die{' '}
            <Link href='/dashboard/jobs' className='underline underline-offset-4'>
              Stellensuche hier auf der Seite
            </Link>{' '}
            musst du dich anmelden. Mit einem freiwilligen Konto merken wir uns dein Suchprofil und
            deine gemerkten Stellen auf allen Geräten. Details dazu in unserer{' '}
            <Link href='/datenschutz' className='underline underline-offset-4'>
              Datenschutzerklärung
            </Link>
            .
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value='ein-klick'>
          <AccordionTrigger>Warum gibt es keinen Ein-Klick-Button?</AccordionTrigger>
          <AccordionContent>
            Claude und ChatGPT erlauben eine Ein-Klick-Installation nur für Dienste aus ihrem
            eigenen Verzeichnis. Deshalb kopierst du die Adresse von Hand, und das nur einmal.
          </AccordionContent>
        </AccordionItem>

        {/* Einziger Ort auf der Seite, an dem Fachbegriffe erlaubt sind. */}
        <AccordionItem value='technisch'>
          <AccordionTrigger>Für Fortgeschrittene: Was steckt technisch dahinter?</AccordionTrigger>
          <AccordionContent className='space-y-2'>
            <p>
              Ein MCP-Server (Model Context Protocol) mit Streamable-HTTP-Transport, ohne
              Authentifizierung, betrieben in der EU (europe-west3).
            </p>
            <p className='font-mono text-xs break-all'>{KI_VERBINDUNGS_URL}</p>
            <p>
              Verfügbare Tools: <code>list_jobs</code> (sortiert, mit Cursor-Pagination),{' '}
              <code>zaehle_treffer</code> (Facetten-Zählung per Aggregation), <code>get_job</code>,{' '}
              <code>erklaere_begriff</code>, <code>get_document_requirements</code>,{' '}
              <code>hole_formular</code>, <code>eroeffne_bewerbungsmappe</code>,{' '}
              <code>fuege_dokument_hinzu</code>, <code>fuelle_formular</code>,{' '}
              <code>mappe_status</code>, <code>schliesse_bewerbungsmappe</code> und{' '}
              <code>erstelle_suchprofil_link</code> (Suchfilter als Link zum Speichern im Konto).
            </p>
            <p>
              Für eine vollständige Bewerbung legt deine KI eine Bewerbungsmappe an: Zeugnisse und
              andere fertige Dateien lädst du selbst über eine eigene Upload-Seite hoch, amtliche
              Formulare füllt die KI direkt in der Mappe aus. Am Ende steht ein einziges Paket zum
              Herunterladen bereit. Eine Stunde danach löschen wir die Mappe mit allem, was darin
              liegt. Ein Konto braucht es dafür nicht, und niemand sonst hat Zugriff.
            </p>
            <p>
              Zusätzlich als Resources: <code>bw://wissen/laufbahnen</code>,{' '}
              <code>bw://wissen/besoldung</code>, <code>bw://wissen/bewerbungsablauf</code>,{' '}
              <code>bw://wissen/glossar</code> sowie <code>bw://formular/&#123;docId&#125;</code> für
              die Blankoformulare. Die Ausschreibungsdaten stammen aus der öffentlichen
              Schnittstelle der Bundeswehr.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
