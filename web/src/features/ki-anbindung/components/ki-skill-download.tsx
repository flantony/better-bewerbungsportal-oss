import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { SKILL_BUNDLE_DATEI } from '../lib/connection';

/**
 * Optionaler Zusatz für Claude Code. Bewusst NACH der Einrichtungsanleitung und
 * zugeklappt unter „Für Fortgeschrittene": die Anbindung allein genügt, und wer
 * hier hängen bleibt, weil er den Ordner nicht findet, hat den eigentlichen
 * Einstieg schon geschafft. Offen saehe der Block aus wie ein Pflichtschritt.
 */
export function KiSkillDownload() {
  return (
    <Accordion className='w-full rounded-lg border px-4'>
      <AccordionItem value='skill'>
        <AccordionTrigger>
          Für Fortgeschrittene: ausführliche Anleitung für Claude Code mitinstallieren
        </AccordionTrigger>
        <AccordionContent className='space-y-4 text-sm'>
          <p className='text-muted-foreground'>
            Die Verbindung oben reicht aus, denn deine KI bekommt beim Verbinden schon eine
            Kurzanleitung. Mit Claude Code kannst du zusätzlich diese ausführliche Fassung
            installieren. Sie erklärt Schritt für Schritt, wie gesucht, verglichen und ausgefüllt
            wird, und bringt Nachschlagewerke zu Laufbahnen, Besoldung, Bewerbungsablauf und
            Behördensprache mit.
          </p>

          <a href={`/${SKILL_BUNDLE_DATEI}`} download className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Icons.download className='h-4 w-4' aria-hidden='true' />
            Anleitung herunterladen (ZIP)
          </a>

          <div className='space-y-2'>
            <p className='font-medium'>Einbauen</p>
            <ol className='text-muted-foreground list-decimal space-y-1 pl-5'>
              <li>ZIP entpacken.</li>
              <li>
                Den entpackten Ordner nach <code className='font-mono text-xs'>~/.claude/skills/</code>{' '}
                kopieren (unter Windows:{' '}
                <code className='font-mono text-xs'>%USERPROFILE%\.claude\skills\</code>).
              </li>
              <li>Claude Code neu starten.</li>
            </ol>
          </div>

          <p className='text-muted-foreground'>
            Die Anleitung enthält dieselben Inhalte, die deine KI auch über die Verbindung abrufen
            kann. Nach größeren Änderungen lohnt sich ein neuer Download.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
