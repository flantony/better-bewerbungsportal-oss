import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';

export interface FortschrittSchritt {
  id: string;
  label: string;
  erledigt: boolean;
}

/**
 * Fortschrittsanzeige fuer die geführte Bewerbung: Anker-Links
 * auf die fuenf Abschnitte derselben Seite (kein eigener Seitenwechsel), per
 * Tastatur wie jeder Link erreichbar. Der "aktuelle" Schritt ist der erste
 * noch nicht erledigte - rein abgeleitet aus dem uebergebenen Zustand, keine
 * eigene Scroll-Verfolgung.
 */
export function FortschrittAnzeige({ schritte }: { schritte: FortschrittSchritt[] }) {
  const ersterOffenerIndex = schritte.findIndex((schritt) => !schritt.erledigt);
  const aktuellerIndex = ersterOffenerIndex === -1 ? schritte.length - 1 : ersterOffenerIndex;

  return (
    <nav aria-label='Fortschritt deiner Bewerbung'>
      <ol className='flex flex-wrap gap-2 text-sm'>
        {schritte.map((schritt, index) => {
          const istAktuell = index === aktuellerIndex;
          return (
            <li key={schritt.id}>
              <a
                href={`#${schritt.id}`}
                aria-current={istAktuell ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors',
                  istAktuell ? 'border-primary bg-primary/10 font-medium' : 'border-transparent hover:bg-accent',
                  schritt.erledigt && !istAktuell && 'text-muted-foreground'
                )}
              >
                {schritt.erledigt ? (
                  <Icons.circleCheck className='text-primary h-4 w-4' aria-hidden='true' />
                ) : (
                  <span
                    className='flex h-4 w-4 items-center justify-center rounded-full border text-[10px]'
                    aria-hidden='true'
                  >
                    {index + 1}
                  </span>
                )}
                <span>{schritt.label}</span>
                <span className='sr-only'>{schritt.erledigt ? ', erledigt' : istAktuell ? ', aktueller Schritt' : ''}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
