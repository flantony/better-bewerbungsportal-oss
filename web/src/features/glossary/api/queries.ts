import { queryOptions } from '@tanstack/react-query';
import { getGlossary } from './service';

export type { GlossaryTerm } from './types';

export const glossaryKeys = {
  all: ['glossary'] as const
};

/** Ändert sich nur, wenn das Glossar-Skript manuell erneut ausgeführt wird - langer staleTime. */
export const glossaryQueryOptions = () =>
  queryOptions({
    queryKey: glossaryKeys.all,
    queryFn: () => getGlossary(),
    staleTime: 60 * 60 * 1000
  });
