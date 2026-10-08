import { describe, expect, it } from 'vitest';
import { bereiteStellenHtmlAuf } from './stellen-html';

describe('bereiteStellenHtmlAuf', () => {
  it('macht eine Adresse mit https:// klickbar und oeffnet sie sicher in neuem Tab', () => {
    const html = bereiteStellenHtmlAuf('<p>Mehr unter https://www.bundeswehrkarriere.de/zivil.</p>');
    expect(html).toContain('<a href="https://www.bundeswehrkarriere.de/zivil"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    // Der Satzpunkt gehoert nicht zur Adresse.
    expect(html).toMatch(/zivil<span[^>]*> \(öffnet in neuem Tab\)<\/span><\/a>\.<\/p>/);
  });

  it('ergaenzt bei www.-Adressen das https://', () => {
    const html = bereiteStellenHtmlAuf('Bewerbung über www.bewerbung.bundeswehr.de');
    expect(html).toContain('<a href="https://www.bewerbung.bundeswehr.de"');
  });

  it('verlinkt nackte .de-Adressen, aber nicht den Teil einer E-Mail-Adresse', () => {
    const html = bereiteStellenHtmlAuf('Siehe bundeswehrkarriere.de oder schreib an info@bundeswehr.org');
    expect(html).toContain('<a href="https://bundeswehrkarriere.de"');
    expect(html).not.toContain('href="https://bundeswehr.org"');
  });

  it('verlinkt keine Wortteile mit Umlaut davor', () => {
    expect(bereiteStellenHtmlAuf('Herr Müller.de')).not.toContain('<a');
  });

  it('baut in SVG-Links keinen zweiten Link', () => {
    const html = bereiteStellenHtmlAuf('<svg><a href="https://x.de">www.y.de</a></svg>');
    expect(html.match(/<a /g) ?? []).toHaveLength(html.includes('<svg') ? 1 : 0);
  });

  it('kuendigt auch vorhandene Links als neuen Tab an', () => {
    expect(bereiteStellenHtmlAuf('<a href="https://example.de">Info</a>')).toContain('(öffnet in neuem Tab)');
  });

  it('laesst Abkuerzungen wie z.B. in Ruhe', () => {
    const html = bereiteStellenHtmlAuf('<p>Unterlagen, z.B. Zeugnisse.</p>');
    expect(html).not.toContain('<a');
  });

  it('verlinkt nichts doppelt, was schon ein Link ist, haertet ihn aber', () => {
    const html = bereiteStellenHtmlAuf('<a href="https://example.de">https://example.de</a>');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it('entfernt weiterhin Gefaehrliches', () => {
    const html = bereiteStellenHtmlAuf(
      '<p onclick="alert(1)">x</p><script>alert(1)</script><a href="javascript:alert(1)">y</a>'
    );
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });

  // WOZU: die Ausschreibung erscheint unter unserer Domain. Ein Formular darin
  // koennte dort Angaben abfragen, ein `style` oder eine Tailwind-Klasse die
  // Seite ueberdecken.
  it('entfernt Formulare, Einbettungen, Stilangaben und Klassen, laesst den Text stehen', () => {
    const html = bereiteStellenHtmlAuf(
      '<style>body{display:none}</style>' +
        '<form action="https://evil.example"><input name="pw"><textarea>t</textarea>' +
        '<select><option>o</option></select><button>Senden</button></form>' +
        '<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">' +
        '<p style="position:fixed;inset:0">Aufgaben</p>' +
        '<p class="fixed inset-0 z-50 bg-background">Profil</p>' +
        '<img src="https://evil.example/p.gif"><video src="x"></video><audio src="x"></audio><dialog open>d</dialog>'
    );
    for (const tag of ['<style', '<form', '<input', '<textarea', '<select', '<button', '<iframe', '<object', '<embed', '<img', '<video', '<audio', '<dialog']) {
      expect(html).not.toContain(tag);
    }
    expect(html).not.toContain('style=');
    expect(html).not.toContain('inset-0');
    expect(html).toContain('<p>Profil</p>');
    expect(html).not.toContain('display:none');
    expect(html).toContain('<p>Aufgaben</p>');
    expect(html).toContain('Senden');
  });

  it('behaelt die Gliederung einer echten Ausschreibung', () => {
    const html = bereiteStellenHtmlAuf(
      '<p><strong>Ihre Aufgaben:</strong></p><ul><li><b>Planung</b> von Einsätzen</li><li><em>Betreuung</em></li></ul>' +
        '<ol><li>eins</li></ol><p>Mehr: <a href="https://www.bundeswehrkarriere.de">Karriere</a><br>Ende</p>'
    );
    expect(html).toContain('<strong>Ihre Aufgaben:</strong>');
    expect(html).toContain('<ul><li><b>Planung</b> von Einsätzen</li><li><em>Betreuung</em></li></ul>');
    expect(html).toContain('<ol><li>eins</li></ol>');
    expect(html).toContain('<a href="https://www.bundeswehrkarriere.de"');
    expect(html).toContain('<br>');
  });

  it('baut aus Text keine Elemente', () => {
    const html = bereiteStellenHtmlAuf('&lt;img src=x onerror=alert(1)&gt; https://example.de/?a=1&amp;b=2');
    expect(html).not.toContain('<img');
    expect(html).toContain('href="https://example.de/?a=1&amp;b=2"');
  });

  it('behaelt die Glossar-Markierungen', () => {
    const html = bereiteStellenHtmlAuf('<span data-glossary-term="saz">SaZ</span>');
    expect(html).toContain('data-glossary-term="saz"');
  });

  it('nimmt eine schliessende Klammer nur mit, wenn die Adresse eine oeffnet', () => {
    expect(bereiteStellenHtmlAuf('(siehe https://example.de/info)')).toContain('href="https://example.de/info"');
  });
});
