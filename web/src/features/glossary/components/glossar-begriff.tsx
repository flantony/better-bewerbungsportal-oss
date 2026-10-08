'use client';

import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Ein erklärter Fachbegriff im Fließtext. Ein Knopf statt eines Tooltips:
 * Tooltips öffnen nur bei Hover/Fokus - auf dem Handy käme die Erklärung nie
 * an. Öffnet bei Klick, Tipp, Enter und
 * Leertaste; Esc schließt und gibt den Fokus an den Begriff zurück.
 */
export function GlossarBegriff({
  begriff,
  definition,
  children
}: {
  begriff: string;
  definition: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          // Der Name kommt aus den Kindern des PopoverTrigger (Begriff + sr-only
          // "Begriff erklären"); oxlint sieht den render-Prop nicht.
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label
          <button
            type='button'
            className='decoration-muted-foreground hover:decoration-foreground cursor-help rounded-sm text-left underline decoration-dotted underline-offset-2'
          />
        }
      >
        {children}
        <span className='sr-only'> (Begriff erklären)</span>
      </PopoverTrigger>
      <PopoverContent aria-label={`Erklärung: ${begriff}`} className='w-80 max-w-[calc(100vw-2rem)] text-sm'>
        <p className='mb-1 font-semibold'>{begriff}</p>
        <p className='leading-relaxed'>{definition}</p>
      </PopoverContent>
    </Popover>
  );
}
