import { Icons } from '@/components/icons';

const ROWS: { official: string; better: string }[] = [
  {
    official: 'Suche nur über Stichwort und Dropdown-Filter',
    better: 'Du sagst deiner KI in eigenen Worten, was du suchst, und sie durchsucht alle Ausschreibungen'
  },
  {
    official: 'Bewerbungsbogen für jede Bewerbung von Hand als PDF ausfüllen',
    better: 'Dein KI-Tool füllt ihn aus, sobald du es mit uns verbunden hast'
  },
  {
    official: 'Anschreiben ohne Hilfe schreiben',
    better: 'Dein KI-Tool hilft dir im Chat beim Entwurf'
  },
  {
    official: 'Anforderungen wie Altersgrenzen oder Verpflichtungsdauer stehen irgendwo im Fließtext',
    better: 'Wir lesen sie als eigene Angabe heraus, deine KI kann danach filtern'
  },
  {
    official: 'Fristen musst du selbst im Blick behalten',
    better: 'Die Übersicht zeigt dir Stellen, deren Bewerbungsschluss in weniger als 3 Tagen ist'
  },
  {
    official: 'Konto nötig, um Suchkriterien zu speichern',
    better: 'Suchen geht ohne Konto. Ein freiwilliges Konto speichert deine Suchfilter und gemerkten Stellen'
  },
  {
    official: 'Ausschreibungen in winzigem, dichtem Dreispalten-Layout mit kaum Weißraum',
    better: 'Große Schrift mit viel Abstand, auch auf dem Handy'
  },
  {
    official: 'Navigation hinter einem Menü-Button versteckt',
    better: 'Die Navigation bleibt immer sichtbar'
  }
];

export function LandingComparison() {
  return (
    <section className='mx-auto max-w-6xl px-4 py-20 md:px-6'>
      <div className='mx-auto max-w-2xl text-center'>
        <h2 className='font-serif text-3xl font-bold tracking-tight'>
          Was wir anders machen als das offizielle Portal
        </h2>
        <p className='text-muted-foreground mt-4'>
          Die Ausschreibungen holen wir jede Nacht aus dem offiziellen Portal. Wir helfen dir bei
          den Schritten danach, die am meisten Zeit kosten.
        </p>
      </div>

      {/* Schmal untereinander statt einer 640px-Tabelle im Scrollkasten
          (WCAG 1.4.10): bei 320px liesse sie sich nur seitlich schieben, und
          per Tastatur gar nicht. */}
      <ul className='mt-12 space-y-4 md:hidden'>
        {ROWS.map((row) => (
          <li key={row.official} className='border-brand/30 space-y-3 rounded-xl border p-4 text-sm'>
            <div className='text-muted-foreground flex items-start gap-2'>
              <Icons.close className='text-destructive/70 mt-0.5 h-4 w-4 shrink-0' aria-hidden='true' />
              <p className='min-w-0'>
                <span className='sr-only'>Offizielles Bewerbungsportal: </span>
                {row.official}
              </p>
            </div>
            <div className='flex items-start gap-2 font-medium'>
              <Icons.circleCheck className='mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-500' aria-hidden='true' />
              <p className='min-w-0'>
                <span className='sr-only'>Better Bewerbungsportal: </span>
                {row.better}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className='mt-12 hidden md:block'>
        <table className='w-full border-collapse overflow-hidden rounded-xl border-brand/30 border text-sm'>
          <thead>
            <tr className='bg-brand/5'>
              <th className='w-1/2 border-b p-4 text-left font-medium'>Offizielles Bewerbungsportal</th>
              <th className='w-1/2 border-b p-4 text-left font-medium'>Better Bewerbungsportal</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.official} className='border-b last:border-0'>
                <td className='text-muted-foreground p-4 align-top'>
                  <div className='flex items-start gap-2'>
                    <Icons.close className='mt-0.5 h-4 w-4 shrink-0 text-destructive/70' aria-hidden='true' />
                    {row.official}
                  </div>
                </td>
                <td className='p-4 align-top font-medium'>
                  <div className='flex items-start gap-2'>
                    <Icons.circleCheck className='mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-500' aria-hidden='true' />
                    {row.better}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
