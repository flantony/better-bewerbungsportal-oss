import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DatenschutzPage from '../datenschutz/page';
import ImpressumPage from './page';

/**
 * WOZU: Besteht das Impressum aus Platzhaltern ("[Name des Anbieters / Firma]"),
 * laesst sich nicht pruefen, wer die Seite betreibt - eine KI wie ChatGPT raet
 * dann, hier keine persoenlichen Daten einzugeben.
 */
describe.each([
  ['Impressum', ImpressumPage],
  ['Datenschutzerklaerung', DatenschutzPage]
])('%s', (_name, Seite) => {
  const html = renderToStaticMarkup(createElement(Seite));

  it('nennt den Betreiber und seine E-Mail-Adresse', () => {
    expect(html).toContain('Florian Antony');
    expect(html).toContain('florian.antony@mailbox.org');
  });

  it('enthaelt keinen Platzhalter in eckigen Klammern', () => {
    const sichtbarerText = html.replace(/<[^>]+>/g, ' ');
    expect(sichtbarerText).not.toMatch(/\[[^\]]*\]/);
  });
});

/**
 * WOZU: die OS-Plattform der EU ist seit dem
 * 20.07.2025 abgeschaltet (VO (EU) 2024/3228 hebt VO (EU) Nr. 524/2013 auf).
 * Ein Link dorthin ist ein toter Verweis auf eine Pflicht, die es nicht
 * gibt - es steht nur die Aussage zur Verbraucherschlichtung da (§ 36 VSBG).
 */
describe('Impressum - Streitschlichtung', () => {
  const html = renderToStaticMarkup(createElement(ImpressumPage));

  it('verweist nicht auf die abgeschaltete OS-Plattform', () => {
    expect(html).not.toContain('ec.europa.eu/consumers/odr');
    expect(html).not.toMatch(/Online-Streitbeilegung/);
  });

  it('sagt, dass wir an keinem Verfahren vor einer Verbraucherschlichtungsstelle teilnehmen', () => {
    expect(html).toContain('nicht verpflichtet und nicht bereit');
  });
});
