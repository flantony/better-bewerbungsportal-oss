import type { Metadata } from 'next';
import { SuchprofilImport } from '@/features/konto/components/suchprofil-import';
import { LandingFooter } from '@/features/landing/components/landing-footer';
import { LandingHeader } from '@/features/landing/components/landing-header';

// noindex: die Seite lebt nur vom Fragment eines persoenlichen Links und hat
// fuer einen Suchindex keinen Inhalt.
export const metadata: Metadata = {
  title: 'Suchfilter übernehmen',
  robots: { index: false, follow: false }
};

export default function SuchprofilUebernehmenPage() {
  return (
    <div className='min-h-screen'>
      <LandingHeader />
      <main className='mx-auto max-w-2xl px-4 py-12 md:px-6'>
        <SuchprofilImport />
      </main>
      <LandingFooter />
    </div>
  );
}
