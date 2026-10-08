import { describe, expect, it } from "vitest";
import { annotateGlossaryTerms, type GlossaryTermRef } from "./glossaryAnnotate";

const UNTEROFFIZIER: GlossaryTermRef = { slug: "unteroffizier", term: "Unteroffizier" };
const UNTEROFFIZIER_PORTEPEE: GlossaryTermRef = { slug: "unteroffizier-mit-portepee", term: "Unteroffizier mit Portepee" };
const SANFW: GlossaryTermRef = { slug: "sanitaetsfeldwebel", term: "Sanitätsfeldwebel", aliases: ["SanFw"] };

describe("annotateGlossaryTerms", () => {
  it("wraps a single matching term in a data-glossary-term span", () => {
    const html = "<p>Mindestens im Dienstgrad eines Unteroffizier.</p>";
    const result = annotateGlossaryTerms(html, [UNTEROFFIZIER]);
    expect(result).toContain('<span class="glossary-term" data-glossary-term="unteroffizier">Unteroffizier</span>');
  });

  it("leaves text unchanged when no term matches", () => {
    const html = "<p>Ganz normaler Text ohne Fachbegriffe.</p>";
    const result = annotateGlossaryTerms(html, [UNTEROFFIZIER]);
    expect(result).toBe(html);
  });

  it("returns the input unchanged for an empty terms list or empty html", () => {
    expect(annotateGlossaryTerms("<p>Text</p>", [])).toBe("<p>Text</p>");
    expect(annotateGlossaryTerms("", [UNTEROFFIZIER])).toBe("");
  });

  it("matches case-insensitively but preserves the original casing in the output", () => {
    const html = "<p>UNTEROFFIZIER gesucht.</p>";
    const result = annotateGlossaryTerms(html, [UNTEROFFIZIER]);
    expect(result).toContain('data-glossary-term="unteroffizier">UNTEROFFIZIER</span>');
  });

  it("respects word boundaries and does not match inside a larger compound word", () => {
    // "Sanitätsoffizier" darf nicht als Teiltreffer für einen kürzeren, hier
    // nicht enthaltenen Begriff "Offizier" markiert werden.
    const html = "<p>Sanitätsoffizierin gesucht.</p>";
    const result = annotateGlossaryTerms(html, [{ slug: "offizier", term: "Offizier" }]);
    expect(result).toBe(html);
  });

  it("prefers the longer overlapping candidate over a shorter substring term", () => {
    const html = "<p>Mindestens Unteroffizier mit Portepee.</p>";
    const result = annotateGlossaryTerms(html, [UNTEROFFIZIER, UNTEROFFIZIER_PORTEPEE]);
    expect(result).toContain(
      '<span class="glossary-term" data-glossary-term="unteroffizier-mit-portepee">Unteroffizier mit Portepee</span>',
    );
    expect(result).not.toContain('data-glossary-term="unteroffizier">Unteroffizier</span>');
  });

  it("annotates multiple distinct matches within the same text", () => {
    const html = "<p>Unteroffizier oder Unteroffizier mit Portepee, je nach Erfahrung.</p>";
    const result = annotateGlossaryTerms(html, [UNTEROFFIZIER, UNTEROFFIZIER_PORTEPEE]);
    expect(result).toContain('data-glossary-term="unteroffizier">Unteroffizier</span> oder');
    expect(result).toContain('data-glossary-term="unteroffizier-mit-portepee">Unteroffizier mit Portepee</span>');
  });

  it("matches an alias and resolves it to the term's slug", () => {
    const html = "<p>Ausgebildete/r SanFw gesucht.</p>";
    const result = annotateGlossaryTerms(html, [SANFW]);
    expect(result).toContain('<span class="glossary-term" data-glossary-term="sanitaetsfeldwebel">SanFw</span>');
  });

  it("preserves surrounding markup structure", () => {
    const html = "<ul><li>Sie sind ausgebildete/r Unteroffizier.</li></ul>";
    const result = annotateGlossaryTerms(html, [UNTEROFFIZIER]);
    expect(result).toContain("<ul><li>");
    expect(result).toContain("</li></ul>");
  });

  it("is idempotent - running it twice does not double-wrap", () => {
    const html = "<p>Gesucht: Unteroffizier.</p>";
    const once = annotateGlossaryTerms(html, [UNTEROFFIZIER]);
    const twice = annotateGlossaryTerms(once, [UNTEROFFIZIER]);
    expect(twice).toBe(once);
    // Sanity: only one span was ever created, not a nested/duplicated one.
    expect(once.match(/data-glossary-term/g)).toHaveLength(1);
  });
});
