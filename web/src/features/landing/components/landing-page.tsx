import { LandingComparison } from './landing-comparison';
import { LandingCta } from './landing-cta';
import { LandingFeatures } from './landing-features';
import { LandingFooter } from './landing-footer';
import { LandingHeader } from './landing-header';
import { LandingHero } from './landing-hero';
import { LandingHowItWorks } from './landing-how-it-works';

export function LandingPage() {
  return (
    <div className='min-h-screen'>
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingComparison />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  );
}
