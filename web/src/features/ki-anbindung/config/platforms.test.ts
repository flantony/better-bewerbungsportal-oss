import { describe, it, expect } from 'vitest';
import { PLATFORMS } from './platforms';

describe('PLATFORMS', () => {
  it('deckt Claude, ChatGPT und ein generisches Tool ab', () => {
    expect(PLATFORMS.map((platform) => platform.id)).toEqual(['claude', 'chatgpt', 'andere']);
  });

  it('hat eindeutige IDs und Labels', () => {
    expect(new Set(PLATFORMS.map((p) => p.id)).size).toBe(PLATFORMS.length);
    expect(new Set(PLATFORMS.map((p) => p.label)).size).toBe(PLATFORMS.length);
  });

  it('zeigt in jeder Anleitung genau einmal die Adresse', () => {
    // Eine Anleitung, in der die einzufügende Adresse nie auftaucht, ist kaputt —
    // und zweimal wäre verwirrend.
    for (const platform of PLATFORMS) {
      const withUrl = platform.steps.filter((step) => step.showsUrl);
      expect(withUrl, `${platform.id} braucht genau einen Adress-Schritt`).toHaveLength(1);
    }
  });

  it('hat für jede Plattform mindestens zwei Schritte mit Text', () => {
    for (const platform of PLATFORMS) {
      expect(platform.steps.length, platform.id).toBeGreaterThanOrEqual(2);
      for (const step of platform.steps) {
        expect(step.title.trim(), platform.id).not.toBe('');
        expect(step.detail.trim(), platform.id).not.toBe('');
      }
    }
  });

  // Dass ChatGPT dafuer einen bezahlten Tarif und den Entwicklermodus braucht,
  // muss vor den Schritten stehen, nicht nur in der FAQ - sonst scheitert, wer
  // kostenlos unterwegs ist, erst am dritten Schritt.
  it('sagt bei ChatGPT vor den Schritten, dass es einen bezahlten Tarif und den Entwicklermodus braucht', () => {
    const chatgpt = PLATFORMS.find((platform) => platform.id === 'chatgpt')!;
    const vorab = `${chatgpt.intro} ${chatgpt.note ?? ''}`;
    expect(vorab).toMatch(/bezahlt/i);
    expect(vorab).toMatch(/Entwicklermodus/);
    expect(vorab).toMatch(/Link/);
  });

  // Das ist die Durchsetzung der Jargon-Regel, nicht bloß eine Konvention:
  // die Zielgruppe sind Bewerber, keine Entwickler. Fachbegriffe gehören
  // ausschließlich in den „Für Fortgeschrittene"-Abschnitt der FAQ.
  it('verwendet keinen technischen Jargon im nutzersichtbaren Text', () => {
    const verboten = /\b(MCP|JSON-?RPC|Endpoint|Endpunkt|Transport|Server|OAuth|API)\b/i;

    for (const platform of PLATFORMS) {
      const texte = [
        platform.intro,
        platform.requirement ?? '',
        platform.note ?? '',
        ...platform.steps.flatMap((step) => [step.title, step.detail])
      ];
      for (const text of texte) {
        expect(text, `Jargon in "${platform.id}": ${text}`).not.toMatch(verboten);
      }
    }
  });
});
