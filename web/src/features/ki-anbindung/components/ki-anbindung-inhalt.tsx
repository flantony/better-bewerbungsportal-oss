import { KiCapabilities } from './ki-capabilities';
import { KiFaq } from './ki-faq';
import { KiLinkWeg } from './ki-link-weg';
import { KiPlatformGuide } from './ki-platform-guide';
import { KiSkillDownload } from './ki-skill-download';

/**
 * Der Inhalt der KI-Seite - einmal, fuer /ki und /dashboard/ki, damit nicht
 * zwei Fassungen auseinanderlaufen.
 */
export function KiAnbindungInhalt() {
  return (
    <div className='space-y-12'>
      <KiLinkWeg />
      <section aria-labelledby='ki-fest-verbinden' className='space-y-4'>
        <div className='space-y-1'>
          <h2 id='ki-fest-verbinden' className='font-serif text-2xl font-bold tracking-tight'>
            Für öfter: deine KI fest verbinden
          </h2>
          <p className='text-muted-foreground text-sm'>
            Dann kennt deine KI alle offenen Ausschreibungen und sucht selbst, du kopierst keine Links mehr. Das
            richtest du nur einmal ein. Ob dein KI-Tool das erlaubt, hängt von deinem Tarif dort ab.
          </p>
        </div>
        <KiPlatformGuide />
      </section>
      <KiCapabilities />
      <KiSkillDownload />
      <KiFaq />
    </div>
  );
}
