import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const quelle = vi.hoisted(() => ({ url: null as string | null }));
vi.mock('@/config/quellcode', () => ({
  get QUELLCODE_URL() {
    return quelle.url;
  }
}));

const { LandingFooter } = await import('@/features/landing/components/landing-footer');
const { default: ImpressumPage } = await import('@/app/impressum/page');

const REPO = 'https://example.org/better-bewerbungsportal';

afterEach(() => {
  quelle.url = null;
});

// WOZU: AGPL-3.0 § 13 verlangt einen sichtbaren Weg zum Quellcode. Solange die
// Repo-Adresse nicht feststeht, darf kein Link ins Leere zeigen - sobald sie in
// config/quellcode.ts steht, muss er an beiden Stellen erscheinen.
describe.each([
  ['Fussbereich der Startseite', () => renderToStaticMarkup(createElement(LandingFooter))],
  ['Impressum', () => renderToStaticMarkup(createElement(ImpressumPage))]
])('Quellcode-Link im %s', (_ort, rendere) => {
  it('fehlt, solange keine Adresse eingetragen ist', () => {
    const html = rendere();
    expect(html).not.toContain('Quellcode');
  });

  it('erscheint, sobald die Adresse eingetragen ist', () => {
    quelle.url = REPO;
    const html = rendere();
    expect(html).toContain(`href="${REPO}"`);
    expect(html).toContain('Quellcode');
  });
});
