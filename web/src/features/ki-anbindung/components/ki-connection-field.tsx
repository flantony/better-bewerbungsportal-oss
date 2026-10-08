'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { KI_VERBINDUNGS_URL } from '../lib/connection';

export function KiConnectionField() {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(KI_VERBINDUNGS_URL);
      toast.success('Adresse kopiert.');
    } catch {
      toast.error('Kopieren hat nicht geklappt. Markiere die Adresse von Hand.');
    }
  };

  return (
    <div className='bg-muted/50 flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center'>
      {/* Immer markierbarer Text als Fallback: die Clipboard-API scheitert in
          manchen In-App-Browsern. */}
      <code className='min-w-0 flex-1 font-mono text-xs break-all select-all'>{KI_VERBINDUNGS_URL}</code>
      <Button size='sm' variant='outline' onClick={handleCopy} className='shrink-0'>
        <Icons.copy className='h-4 w-4' />
        Adresse kopieren
      </Button>
    </div>
  );
}
