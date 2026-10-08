import { LandingFooter } from '@/features/landing/components/landing-footer';
import { LandingHeader } from '@/features/landing/components/landing-header';
import { KiAnbindungInhalt } from './ki-anbindung-inhalt';
import { KiHero } from './ki-hero';

export function KiAnbindungPage() {
  return (
    <div className='min-h-screen'>
      <LandingHeader />
      <main className='mx-auto max-w-3xl space-y-12 px-4 py-16 md:px-6'>
        <KiHero />
        <KiAnbindungInhalt />
      </main>
      <LandingFooter />
    </div>
  );
}
