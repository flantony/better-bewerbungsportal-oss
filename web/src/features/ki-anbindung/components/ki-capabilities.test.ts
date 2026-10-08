import { describe, it, expect } from 'vitest';
import { KANN, KANN_NICHT } from './ki-capabilities';

describe('KiCapabilities', () => {
  // Gleiche Regel wie in platforms.test.ts, hier aber fuer den Text, den ein
  // Bewerber als ERSTES liest. Fachbegriffe gehoeren ausschliesslich in den
  // "Fuer Fortgeschrittene"-Teil der FAQ und in den Anleitungs-Download.
  it('verwendet keinen technischen Jargon', () => {
    const verboten = /\b(MCP|JSON-?RPC|Endpoint|Endpunkt|Transport|Server|OAuth|API|Token|Prompt)\b/i;
    for (const text of [...KANN, ...KANN_NICHT]) {
      expect(text, `Jargon: ${text}`).not.toMatch(verboten);
    }
  });

  // Die Liste ist ein Versprechen. Wenn ein Werkzeug dazukommt, muss sie
  // mitwachsen - sonst sucht der Nutzer eine Faehigkeit, von der er nichts weiss.
  it('nennt die Faehigkeiten, die spaeter dazugekommen sind', () => {
    const alles = KANN.join(' ').toLowerCase();
    expect(alles).toMatch(/fachw(ö|oe)rter|nachschlagen/);
    expect(alles).toMatch(/laufbahn/);
    expect(alles).toMatch(/blankoformular|als datei/);
    expect(alles).toMatch(/suchprofil-link/);
  });

  it('sagt weiterhin klar, dass nichts gespeichert wird', () => {
    expect(KANN_NICHT.join(' ')).toMatch(/speicher/i);
  });
});
