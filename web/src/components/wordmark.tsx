import { cn } from '@/lib/utils';

/**
 * Renders the product name with the "B" and "W" inside "Bewerbungsportal"
 * in the brand accent color — a quiet nod to "Bundeswehr" (BW) without
 * changing the product's actual name or using any of the Bundeswehr's own
 * symbols.
 *
 * The visible markup splits the name across spans for the accent color;
 * `role='img'` + `aria-label` exposes the plain product name to assistive
 * tech instead of the fragmented text nodes.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      role='img'
      aria-label='Better Bewerbungsportal'
      className={cn('font-serif font-semibold', className)}
    >
      <span aria-hidden='true'>
        Better <span className='text-brand'>B</span>e<span className='text-brand'>W</span>
        erbungsportal
      </span>
    </span>
  );
}
