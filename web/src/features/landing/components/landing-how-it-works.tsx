import Link from 'next/link';

const STEPS: {
  number: string;
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}[] = [
  {
    number: '1',
    title: 'Stellen durchsuchen',
    description:
      'Alle offenen Ausschreibungen der Bundeswehr, filterbar nach Bereich, Laufbahn, Ort, Besoldung und Vertragsart. Anmelden musst du dich dafür nicht.',
    href: '/dashboard/jobs',
    linkLabel: 'Zur Suche'
  },
  {
    number: '2',
    title: 'Deine KI anbinden',
    description:
      'Verbinde Claude, ChatGPT oder ein anderes KI-Tool mit uns. Das richtest du nur einmal ein.',
    href: '/ki',
    linkLabel: 'So geht’s'
  },
  {
    number: '3',
    title: 'Mit deiner KI bewerben',
    description:
      'Deine KI kennt dann jede Ausschreibung samt der geforderten Unterlagen und füllt den offiziellen Bewerbungsbogen aus. Deine Angaben bleiben zwischen dir und deiner KI.'
  }
];

export function LandingHowItWorks() {
  return (
    <section className='mx-auto max-w-6xl px-4 py-20 md:px-6'>
      <div className='mx-auto max-w-2xl text-center'>
        <h2 className='font-serif text-3xl font-bold tracking-tight'>So funktioniert's</h2>
      </div>
      <div className='mt-12 grid grid-cols-1 gap-8 md:grid-cols-3'>
        {STEPS.map((step) => (
          <div key={step.number}>
            <div className='bg-foreground text-background flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold'>
              {step.number}
            </div>
            <h3 className='mt-4 font-semibold'>{step.title}</h3>
            <p className='text-muted-foreground mt-2 text-sm'>{step.description}</p>
            {step.href && (
              <Link
                href={step.href}
                className='mt-2 inline-block text-sm underline underline-offset-4'
              >
                {step.linkLabel} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
