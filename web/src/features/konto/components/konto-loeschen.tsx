'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/icons';
import { merkeAbmeldung } from '@/features/auth/lib/abmeldung-laeuft';
import { clientAuth } from '@/lib/firebase/client';
import { loescheKonto } from '../api/service';

const BESTAETIGUNGSWORT = 'LÖSCHEN';

/**
 * Selbst-Service-Kontoloeschung. Loescht Konto, Suchprofil und Merkliste
 * serverseitig unwiderruflich - deshalb zusaetzlich zum AlertDialog eine
 * Bestaetigung durch Eintippen von "LÖSCHEN", nicht nur ein Klick.
 */
export function KontoLoeschen() {
  const [open, setOpen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const queryClient = useQueryClient();
  const router = useRouter();

  const loeschenMutation = useMutation({
    mutationFn: loescheKonto,
    onSuccess: async () => {
      // signOut erst NACH dem Server-Aufruf - ohne gueltiges Token kann der
      // Server das Konto nicht loeschen. Navigiert wird VOR dem signOut,
      // damit KontoGuard (der auf user === null mit einem eigenen Redirect
      // nach /anmelden reagiert) nicht gewinnt - das Signal (ein kurzes
      // Zeitfenster, s. abmeldung-laeuft.ts) deckt den spaeten Render ab.
      queryClient.clear();
      toast.success('Dein Konto ist gelöscht.');
      merkeAbmeldung();
      router.replace('/');
      await signOut(clientAuth());
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das Konto ließ sich nicht löschen.');
    }
  });

  return (
    <Card className='border-destructive/50'>
      <CardHeader>
        <CardTitle>
          <h2>Konto löschen</h2>
        </CardTitle>
        <CardDescription>
          Wir löschen sofort dein Konto mit allem, was darin gespeichert ist, auch Suchprofil und
          Merkliste. Das lässt sich nicht rückgängig machen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setEingabe('');
          }}
        >
          <AlertDialogTrigger
            render={
              <Button variant='destructive'>
                <Icons.trash className='mr-2 h-4 w-4' />
                Konto unwiderruflich löschen
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Konto wirklich löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Wir löschen sofort dein Konto mit allem, was darin gespeichert ist, auch Suchprofil
                und Merkliste. Das lässt sich nicht rückgängig machen. Tippe zur Bestätigung <strong>{BESTAETIGUNGSWORT}</strong>{' '}
                ein.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className='space-y-2'>
              <Label htmlFor='loeschen-bestaetigung'>Bestätigung</Label>
              <Input
                id='loeschen-bestaetigung'
                value={eingabe}
                onChange={(e) => setEingabe(e.target.value)}
                autoComplete='off'
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => loeschenMutation.mutate()}
                disabled={eingabe !== BESTAETIGUNGSWORT || loeschenMutation.isPending}
                className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              >
                {loeschenMutation.isPending ? 'Wird gelöscht…' : 'Endgültig löschen'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
