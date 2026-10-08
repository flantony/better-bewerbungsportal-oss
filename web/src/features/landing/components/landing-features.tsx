import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';

const FEATURES = [
  {
    icon: Icons.search,
    title: 'Suchen in eigenen Worten',
    description:
      'Beschreib deiner KI, was du suchst, etwa Ort, Vertragsart oder Fachrichtung. Sie durchsucht alle Ausschreibungen und nennt dir die passenden.'
  },
  {
    icon: Icons.sparkles,
    title: 'Bewirb dich mit deiner eigenen KI',
    description:
      'Verbinde Claude, ChatGPT oder ein anderes KI-Tool mit uns. Es kennt dann jede Ausschreibung und füllt den offiziellen Bewerbungsbogen für dich aus.'
  },
  {
    icon: Icons.userPen,
    title: 'Deine Daten bleiben bei dir',
    description:
      'Zum Suchen und zum Bewerben mit deiner KI brauchst du kein Konto. Deine Angaben speichern wir dabei nicht, die Bewerbungsmappe löschen wir nach einer Stunde. Ein Konto legst du nur an, wenn wir etwas für dich speichern sollen, etwa Suchfilter und gemerkte Stellen.'
  }
];

export function LandingFeatures() {
  return (
    <section className='bg-muted/30 border-y'>
      <div className='mx-auto max-w-6xl px-4 py-20 md:px-6'>
        <div className='mx-auto max-w-2xl text-center'>
          <h2 className='font-serif text-3xl font-bold tracking-tight'>Was Better Bewerbungsportal übernimmt</h2>
        </div>
        <div className='mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2'>
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon className='mb-2 h-6 w-6' />
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription className='text-sm'>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
