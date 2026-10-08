import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { checklisteFuerStelle } from '../lib/einreichliste';
import { WasDuEinreichenMusst } from './was-du-einreichen-musst';

const { liste, text, dateiname } = checklisteFuerStelle(
  {
    pinstGuid: '0123456789ABCDEF0123456789ABCDEF',
    title: 'Feldwebel IT (m/w/d)',
    refCode: 'REF-1',
    unterlagen: ['Lebenslauf'],
    unterlagenHinweise: '',
    documents: [{ attHeader: 'Anlage 1 zum Bewerbungsbogen', downloadUrl: 'https://example.org/anlage1.pdf' }]
  },
  'https://better-bewerbungsportal.de'
);

describe('WasDuEinreichenMusst', () => {
  const html = renderToStaticMarkup(createElement(WasDuEinreichenMusst, { liste, checkliste: text, dateiname }));

  it('ist über den Anker erreichbar, auf den die Bewerbungswege verlinken', () => {
    expect(html).toContain('id="einreichen"');
    expect(html).toContain('Was du einreichen musst');
  });

  it('bietet die Checkliste als Textdatei zum Herunterladen an - ohne Abruf beim Server', () => {
    expect(html).toContain('download="Checkliste_REF-1.txt"');
    expect(html).toContain(`href="data:text/plain;charset=utf-8,${encodeURIComponent(text).replace(/&/g, '&amp;')}"`);
  });

  it('verlinkt Vordrucke und das offizielle Portal', () => {
    expect(html).toContain('href="https://example.org/anlage1.pdf"');
    expect(html).toContain('href="https://bewerbung.bundeswehr-karriere.de"');
  });
});
