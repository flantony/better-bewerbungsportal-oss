import Link from 'next/link';
import { BETREIBER } from '@/config/betreiber';

export const metadata = { title: 'Erklärung zur Barrierefreiheit' };

// Stand der Selbstbewertung (Lighthouse/axe und Tests von Hand). Bei neuen bekannten Lücken oder behobenen Punkten den
// Abschnitt "Was noch nicht barrierefrei ist" und das Datum anpassen.
const STAND = '7. Oktober 2026';

export default function BarrierefreiheitPage() {
  return (
    <main className='mx-auto max-w-2xl px-4 py-12'>
      <Link href='/' className='text-muted-foreground text-sm underline-offset-4 hover:underline'>
        ← Zurück
      </Link>

      <h1 className='mt-4 mb-6 text-2xl font-bold'>Erklärung zur Barrierefreiheit</h1>

      <div className='space-y-6 text-sm leading-relaxed'>
        <section>
          <p>
            Better Bewerbungsportal ist ein privates Projekt. Wir möchten, dass alle Bewerberinnen
            und Bewerber die Seite nutzen können, auch mit Screenreader, nur mit der Tastatur, mit
            Vergrößerung oder auf einem kleinen Bildschirm. Diese Erklärung geben wir freiwillig ab.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>Wie weit die Seite barrierefrei ist</h2>
          <p>
            Die Seite ist <strong>weitgehend, aber nicht vollständig</strong> mit den Web Content
            Accessibility Guidelines (WCAG) 2.1, Stufe AA vereinbar. Grundlage ist eine
            Selbstbewertung: automatisierte Prüfungen (Lighthouse/axe) und Tests von Hand mit
            Tastatur, 320 Pixel Bildschirmbreite, Vergrößerung und dunklem Farbschema.
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>Was noch nicht barrierefrei ist</h2>
          <ul className='list-disc space-y-2 pl-5'>
            <li>
              <strong>Amtliche PDF-Formulare der Bundeswehr</strong> (zum Beispiel der
              Bewerbungsbogen) sind nicht barrierefrei. Sie stammen nicht von uns; wir stellen sie
              unverändert bereit.
            </li>
            <li>
              <strong>Von uns erzeugte PDF-Dateien</strong> (das Bewerbungspaket und darin
              ausgefüllte Formulare) sind noch nicht mit einer Struktur für Screenreader
              ausgezeichnet („getaggt“) und deshalb nur eingeschränkt vorlesbar.
            </li>
            <li>
              <strong>Ausschreibungstexte</strong> übernehmen wir aus den Daten der Bundeswehr.
              Überschriften und Listen darin können nur so gut gegliedert sein, wie sie geliefert
              werden.
            </li>
          </ul>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>Barriere gefunden? Schreib uns</h2>
          <p>
            Wenn dir etwas auffällt, das du nicht bedienen oder lesen kannst, schreib bitte an{' '}
            <a href={`mailto:${BETREIBER.email}`} className='underline underline-offset-4'>
              {BETREIBER.email}
            </a>
            . Nenne am besten die Seite und was nicht funktioniert hat. Wir versuchen dann, dir die
            Information auf anderem Weg zu geben, und beheben den Fehler, so schnell es geht.
          </p>
        </section>

        <p className='text-muted-foreground'>Stand dieser Erklärung: {STAND}.</p>
      </div>
    </main>
  );
}
