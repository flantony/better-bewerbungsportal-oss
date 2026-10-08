import { HTMLElement, NodeType, parse, type Node as HtmlNode } from "node-html-parser";

export interface GlossaryTermRef {
  slug: string;
  term: string;
  aliases?: string[];
}

const GLOSSARY_ATTR = "data-glossary-term";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Ersetzt alle Vorkommen eines Textknoten-Inhalts, die einen Glossarbegriff
 * (oder Alias) treffen, durch `<span data-glossary-term="{slug}">...</span>` -
 * oder gibt `null` zurück, wenn nichts getroffen wurde (spart eine unnötige
 * Neu-Serialisierung des unveränderten Textknotens).
 */
function annotateText(text: string, pattern: RegExp, slugByLowerText: Map<string, string>): string | null {
  let matched = false;
  const replaced = text.replace(pattern, (match) => {
    const slug = slugByLowerText.get(match.toLowerCase());
    if (!slug) return match;
    matched = true;
    return `<span class="glossary-term" ${GLOSSARY_ATTR}="${slug}">${escapeHtml(match)}</span>`;
  });
  return matched ? replaced : null;
}

function annotateNode(node: HtmlNode, pattern: RegExp, slugByLowerText: Map<string, string>): void {
  // Bereits annotierte Spans nicht erneut durchsuchen - sonst würde ein
  // wiederholter Lauf (Migration/erneuter Sync) den Inhalt doppelt
  // verschachteln statt idempotent zu bleiben.
  if (node instanceof HTMLElement && node.getAttribute(GLOSSARY_ATTR)) {
    return;
  }

  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === NodeType.TEXT_NODE) {
      const replacement = annotateText(child.rawText, pattern, slugByLowerText);
      if (replacement !== null) {
        const fragment = parse(replacement);
        const newNodes = fragment.childNodes;
        node.childNodes.splice(i, 1, ...newNodes);
        i += newNodes.length - 1;
      }
    } else {
      annotateNode(child, pattern, slugByLowerText);
    }
  }
}

/**
 * Markiert Vorkommen bekannter Glossarbegriffe (s. types.ts GlossaryTerm) in
 * einem HTML-Fragment mit `<span data-glossary-term="{slug}">`, damit das
 * Frontend sie ohne eigenes Text-Scanning als Tooltip rendern kann (s.
 * web/src/app/dashboard/jobs/[pinstGuid]/page.tsx). Arbeitet ausschließlich
 * auf Textknoten (nie innerhalb von Tag-Namen/Attributen) und bevorzugt bei
 * überlappenden Kandidaten den LÄNGEREN Begriff (z.B. "Unteroffizier mit
 * Portepee" vor "Unteroffizier"), damit nichts doppelt/verschachtelt markiert
 * wird. Idempotent: ein zweiter Lauf über bereits annotierten Text verändert
 * nichts (s. annotateNode).
 */
export function annotateGlossaryTerms(html: string, terms: GlossaryTermRef[]): string {
  if (!html || terms.length === 0) return html;

  const candidates: { text: string; slug: string }[] = [];
  for (const t of terms) {
    if (t.term.trim()) candidates.push({ text: t.term, slug: t.slug });
    for (const alias of t.aliases ?? []) {
      if (alias.trim()) candidates.push({ text: alias, slug: t.slug });
    }
  }
  if (candidates.length === 0) return html;

  // Längere Begriffe zuerst in der Alternation, damit die Regex-Engine bei
  // überlappenden Treffern an derselben Position den längeren bevorzugt.
  candidates.sort((a, b) => b.text.length - a.text.length);

  const pattern = new RegExp(`\\b(${candidates.map((c) => escapeRegExp(c.text)).join("|")})\\b`, "gi");
  const slugByLowerText = new Map(candidates.map((c) => [c.text.toLowerCase(), c.slug]));

  const root = parse(html);
  annotateNode(root, pattern, slugByLowerText);
  return root.toString();
}
