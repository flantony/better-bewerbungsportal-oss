import Link from 'next/link';
import { BETREIBER } from '@/config/betreiber';
import { QUELLCODE_URL } from '@/config/quellcode';

export const metadata = { title: 'Impressum' };

export default function ImpressumPage() {
  return (
    <main className='mx-auto max-w-2xl px-4 py-12'>
      <Link href='/' className='text-muted-foreground text-sm underline-offset-4 hover:underline'>
        ← Zurück
      </Link>

      <h1 className='mt-4 mb-6 text-2xl font-bold'>Impressum</h1>

      <div className='space-y-6 text-sm leading-relaxed'>
        {/*
          Ohne Postanschrift. § 5 DDG verlangt fuer geschaeftsmaessige Angebote eine
          ladungsfaehige Anschrift; zaehlt das Projekt als solches, ist sie hier
          nachzutragen. Name und E-Mail aus config/betreiber.ts (eine Quelle,
          auch fuer die Datenschutzerklaerung; die KI-Seite spiegelt sie).
        */}
        <section>
          <h2 className='mb-1 font-semibold'>Angaben gemäß § 5 DDG</h2>
          <p>{BETREIBER.name}</p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>Kontakt</h2>
          <p>
            E-Mail:{' '}
            <a href={`mailto:${BETREIBER.email}`} className='underline-offset-4 hover:underline'>
              {BETREIBER.email}
            </a>
          </p>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>Hinweis zur Unabhängigkeit</h2>
          <p>
            Better Bewerbungsportal ist ein unabhängiges, privates Projekt und{' '}
            <strong>keine offizielle Website der Bundeswehr</strong> oder des Bundesministeriums
            der Verteidigung. Es besteht keine Verbindung zur Bundeswehr oder zu deren offiziellen
            Karriereportalen über die Nutzung öffentlich zugänglicher Ausschreibungsdaten hinaus.
            Für die Richtigkeit und Aktualität der angezeigten Ausschreibungen wird keine Gewähr
            übernommen; maßgeblich sind ausschließlich die offiziellen Angaben der Bundeswehr.
          </p>
        </section>

        {QUELLCODE_URL && (
          <section>
            <h2 className='mb-1 font-semibold'>Quellcode</h2>
            <p>
              Der Programmcode dieser Website ist öffentlich. Wer nachsehen möchte, wie sie
              funktioniert, findet ihn hier:{' '}
              <a href={QUELLCODE_URL} className='break-all underline-offset-4 hover:underline'>
                {QUELLCODE_URL}
              </a>
            </p>
          </section>
        )}

        {/*
          Kein Link auf die OS-Plattform der EU: sie ist seit dem 20.07.2025
          abgeschaltet (VO (EU) 2024/3228 hebt VO (EU) Nr. 524/2013 auf). Hier
          steht nur die Aussage zur Verbraucherschlichtung.
        */}
        <section>
          <h2 className='mb-1 font-semibold'>Streitschlichtung</h2>
          <p>
            Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor
            einer Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </section>
      </div>
    </main>
  );
}
