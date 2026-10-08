'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { kiChatText } from '../lib/connection';

/**
 * Der einfachste Weg zur KI: ein fertiger Text mit Link zur KI-Seite dieser
 * Stelle, den der Bewerber in seinen Chat kopiert. Kein Connector, nichts zu
 * installieren - deshalb auch mit kostenlosen Tarifen. Nutzersichtbarer Text
 * ohne Fachbegriffe (s. platforms.test.ts).
 */
export function KiChatLink({ pinstGuid }: { pinstGuid: string }) {
  const text = kiChatText(pinstGuid);
  const [meldung, setMeldung] = useState('');

  async function handleKopieren() {
    // Erst leeren: dieselbe Meldung zweimal hintereinander liest ein Screenreader sonst nicht neu vor.
    setMeldung('');
    try {
      await navigator.clipboard.writeText(text);
      setMeldung('Text kopiert. Füge ihn jetzt in deinen Chat ein.');
    } catch {
      setMeldung('Kopieren hat nicht geklappt. Markiere den Text oben und kopiere ihn von Hand.');
    }
  }

  return (
    <div className='space-y-3 text-sm'>
      <p>
        Kopiere diesen Text und füge ihn in ChatGPT, Claude oder Gemini ein. Die KI führt dich dann durch die
        Bewerbung auf diese Stelle.
      </p>
      <p className='text-muted-foreground'>
        Das klappt auch mit den kostenlosen Versionen, weil es ein normaler Link ist. Ein Konto bei uns brauchst
        du dafür nicht. Was du der KI erzählst, verarbeitet ihr Anbieter nach seinen eigenen Regeln.
      </p>
      {/* Immer markierbar: die Zwischenablage scheitert in manchen In-App-Browsern. */}
      <p className='bg-muted/50 rounded-md border p-3 font-mono text-xs [overflow-wrap:anywhere] select-all'>
        {text}
      </p>
      <Button type='button' variant='default' onClick={handleKopieren}>
        <Icons.copy className='h-4 w-4' />
        Text kopieren
      </Button>
      <p role='status' aria-live='polite' className='min-h-5 text-sm font-medium'>
        {meldung}
      </p>
    </div>
  );
}
