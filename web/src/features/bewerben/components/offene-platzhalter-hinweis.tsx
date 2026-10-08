import type { ReactNode } from 'react';

/**
 * Gelb hinterlegter Hinweis auf Platzhalter wie "[Datum]", die noch in einem
 * Text stehen - in Schritt 4 direkt unter dem jeweiligen Feld, in Schritt 5
 * am Knopf.
 *
 * Bewusst keine Live-Region und kein `Alert` (role="alert" unterbricht): der
 * Satz aendert sich beim Tippen in eckigen Klammern mit jedem Zeichen. In
 * Schritt 4 haengt er ueber `saetzeId` + aria-describedby am Feld und wird
 * vorgelesen, sobald das Feld den Fokus bekommt.
 */
export function OffenePlatzhalterHinweis({
  saetze,
  saetzeId,
  children
}: {
  saetze: string[];
  /** Id fuer aria-describedby - umfasst nur die Saetze, nicht einen Knopf in `children`. */
  saetzeId?: string;
  children?: ReactNode;
}) {
  if (saetze.length === 0) return null;
  return (
    <div className='rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm'>
      <div id={saetzeId}>
        {saetze.map((satz) => (
          <p key={satz} className='font-medium'>
            {satz}
          </p>
        ))}
      </div>
      {children}
    </div>
  );
}
