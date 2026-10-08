'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { kontoAngabenQueryOptions } from '../api/queries';
import { ladeExport } from '../api/service';

const EXPORT_DATEINAME = 'meine-daten.json';

/**
 * „Meine Daten herunterladen" (Art. 15/20 DSGVO) - holt `kontoExport` ueber
 * `ladeExport` (angemeldeter Aufruf mit ID-Token) und speichert die Antwort
 * als Datei ueber einen Blob/ObjectURL-Klick. Die URL wird NICHT im
 * Komponentenzustand gehalten, nur lokal in dieser Funktion, und direkt nach
 * dem Klick wieder freigegeben.
 *
 * Fehlender Endpunkt (s. lib/nicht-verfuegbar.ts): `kontoExport` wird zusammen
 * mit `kontoAngabenLaden` ausgerollt - meldet die (ohnehin geladene, geteilte)
 * Angaben-Query 'nicht-verfuegbar', zeigt der Bereich nichts. Faellt der
 * Export selbst als 'nicht-verfuegbar' aus (404 oder TypeError), verschwindet
 * der Bereich ab dann ebenfalls.
 */
export function DatenExport() {
  const user = useAuthUser();
  const angabenQuery = useQuery({ ...kontoAngabenQueryOptions(user?.uid ?? ''), enabled: Boolean(user) });
  const [exportFehlt, setExportFehlt] = useState(false);

  const exportMutation = useMutation({
    mutationFn: ladeExport,
    onSuccess: (daten) => {
      if (daten === 'nicht-verfuegbar') {
        setExportFehlt(true);
        toast.error('Das Herunterladen deiner Daten ist gerade nicht verfügbar.');
        return;
      }
      const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = EXPORT_DATEINAME;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  if (angabenQuery.data === 'nicht-verfuegbar' || exportFehlt) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Meine Daten herunterladen</h2>
        </CardTitle>
        <CardDescription>
          Suchprofil, Merkliste, Benachrichtigungseinstellung und deine gemerkten Angaben als eine
          Datei. Abgelegte Unterlagen lädst du einzeln auf dieser Seite herunter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type='button'
          variant='outline'
          disabled={exportMutation.isPending}
          isLoading={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
        >
          <Icons.download className='mr-2 h-4 w-4' />
          Meine Daten herunterladen
        </Button>
      </CardContent>
    </Card>
  );
}
