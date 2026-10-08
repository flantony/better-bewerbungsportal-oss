'use client';

import { useMemo } from 'react';
import parse, { domToReact, Element, type DOMNode, type HTMLReactParserOptions } from 'html-react-parser';
import { useQuery } from '@tanstack/react-query';
import { glossaryQueryOptions, type GlossaryTerm } from '../api/queries';
import { GlossarBegriff } from './glossar-begriff';

const GLOSSARY_ATTR = 'data-glossary-term';

/**
 * Rendert bereits beim Sync (functions/src/sync.ts) annotiertes
 * HTML (Spans mit `data-glossary-term`, s. functions/src/lib/glossaryAnnotate.ts)
 * und ersetzt diese Spans durch aufklappbare Begriffe (GlossarBegriff). Kein eigenes
 * Text-Scanning im Client - nur Auflösung slug -> Definition.
 */
export function GlossaryAnnotatedHtml({ html }: { html: string }) {
  const { data: terms } = useQuery(glossaryQueryOptions());

  const termBySlug = useMemo(() => {
    const map = new Map<string, GlossaryTerm>();
    for (const term of terms ?? []) map.set(term.slug, term);
    return map;
  }, [terms]);

  const options: HTMLReactParserOptions = {
    // Not a component definition despite the JSX return below - this is
    // html-react-parser's own `replace` callback API (per-matched-element
    // replacement node), not a component being (re-)created every render.
    // oxlint-disable-next-line react/no-unstable-nested-components
    replace: (domNode) => {
      if (!(domNode instanceof Element) || !domNode.attribs[GLOSSARY_ATTR]) return;

      const children = domToReact(domNode.children as DOMNode[], options);
      const term = termBySlug.get(domNode.attribs[GLOSSARY_ATTR]);
      if (!term?.definition) return <>{children}</>;

      return (
        <GlossarBegriff begriff={term.term} definition={term.definition}>
          {children}
        </GlossarBegriff>
      );
    }
  };

  return <>{parse(html, options)}</>;
}
