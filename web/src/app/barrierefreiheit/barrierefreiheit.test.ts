import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BETREIBER } from '@/config/betreiber';
import { LandingFooter } from '@/features/landing/components/landing-footer';
import BarrierefreiheitPage from './page';

describe('Erklärung zur Barrierefreiheit', () => {
  const html = renderToStaticMarkup(createElement(BarrierefreiheitPage));

  it('sagt ehrlich, dass die Seite nicht vollständig barrierefrei ist, und nennt die bekannten Lücken', () => {
    expect(html).toContain('weitgehend, aber nicht vollständig');
    expect(html).toContain('Amtliche PDF-Formulare');
    expect(html).toContain('Von uns erzeugte PDF-Dateien');
  });

  it('nennt die Betreiber-E-Mail als Rückmeldeweg', () => {
    expect(html).toContain(`mailto:${BETREIBER.email}`);
  });

  it('ist im Fußbereich neben Impressum und Datenschutz verlinkt', () => {
    const footer = renderToStaticMarkup(createElement(LandingFooter));
    expect(footer).toContain('href="/barrierefreiheit"');
  });
});
