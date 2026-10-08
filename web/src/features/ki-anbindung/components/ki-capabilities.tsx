import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';

/**
 * Exportiert, damit die Jargon-Regel auch hier greift (s. ki-capabilities.test.ts).
 * Das ist der erste Text, den ein Bewerber auf dieser Seite liest — hier ist
 * Fachsprache teurer als irgendwo sonst.
 */
export const KANN = [
  'Passende Bundeswehr-Ausschreibungen finden, nach Ort, Bereich, Vertragsart und Alter.',
  'Dir erst zeigen, wo es überhaupt etwas gibt, wenn du noch nicht weißt, wonach du suchst.',
  'Dir eine Ausschreibung in einfachem Deutsch erklären.',
  'Fachwörter wie „Portepee" oder „SaZ" nachschlagen.',
  'Erklären, was eine Laufbahn voraussetzt, was ein Dienstgrad verdient und wie es nach der Bewerbung weitergeht.',
  'Sagen, welche Unterlagen eine Stelle verlangt, und dir das Blankoformular als Datei geben.',
  'Den offiziellen Bewerbungsbogen mit deinen Angaben ausfüllen und dir am Ende ein Paket mit allen Unterlagen zum Herunterladen zusammenstellen.',
  'Dich auf Bewerbungsfristen hinweisen, die bald ablaufen.',
  'Dir Suchfilter als Link zusammenstellen. Mit Konto speicherst du ihn und bekommst auf Wunsch eine Mail, sobald eine neue passende Stelle erscheint. Sag ihr dazu: „Erstelle mir einen Suchprofil-Link“.'
];

export const KANN_NICHT = [
  'Deine Bewerbung abschicken. Das machst du selbst über das offizielle Portal der Bundeswehr.',
  'Daten über dich bei uns abrufen. Ohne Konto speichern wir keine Bewerberdaten dauerhaft. Deine Angaben nennst du der KI im Gespräch, Dateien lädst du selbst über eine Seite hoch.',
  'Etwas dauerhaft speichern. Dein Paket mit allen Unterlagen löschen wir spätestens eine Stunde nach dem Zusammenstellen, und niemand sonst hat Zugriff darauf.',
  'Für Vollständigkeit und Richtigkeit garantieren. Maßgeblich sind immer die offiziellen Angaben der Bundeswehr.'
];

export function KiCapabilities() {
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Was deine KI dann kann</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className='space-y-3'>
            {KANN.map((item) => (
              <li key={item} className='flex gap-2 text-sm'>
                <Icons.check className='text-primary mt-0.5 h-4 w-4 shrink-0' />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Was sie nicht kann</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className='space-y-3'>
            {KANN_NICHT.map((item) => (
              <li key={item} className='flex gap-2 text-sm'>
                <Icons.close className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0' />
                <span className='text-muted-foreground'>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
