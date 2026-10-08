import { InfoButton } from '@/components/ui/info-button';
import type { InfobarContent } from '@/components/ui/infobar';

interface HeadingProps {
  title: string;
  description: string;
  infoContent?: InfobarContent;
  /** Der Seitentitel ist die Hauptueberschrift (h1); `h2` nur, wo eine Seite ihre h1 selbst setzt. */
  as?: 'h1' | 'h2';
}

export function Heading({ title, description, infoContent, as: Ueberschrift = 'h1' }: HeadingProps) {
  return (
    <div className='min-w-0'>
      <div className='flex min-w-0 items-center gap-2'>
        <Ueberschrift className='font-serif text-3xl font-bold tracking-tight break-words'>{title}</Ueberschrift>
        {infoContent && (
          <div className='pt-1'>
            <InfoButton content={infoContent} />
          </div>
        )}
      </div>
      <p className='text-muted-foreground text-sm'>{description}</p>
    </div>
  );
}
