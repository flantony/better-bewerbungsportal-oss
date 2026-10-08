'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Icons } from '@/components/icons';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { kontoAngabenQueryOptions, kontoKeys, kontoUnterlagenQueryOptions } from '../api/queries';
import { loescheAngaben, widerrufeStaatsangehoerigkeit } from '../api/service';
import { belegteAngaben, hatGespeicherteAngaben } from '../lib/gespeicherte-angaben';
import { UnterlageZeile } from './meine-unterlagen';

/**
 * Statt „Meine Angaben"/„Meine Unterlagen", solange Bewerberdaten im Konto
 * ausgeschaltet sind (Funktionsschalter BEWERBERDATEN_IM_KONTO). Neues
 * speichert dann niemand - wer bei eingeschaltetem Schalter etwas hinterlegt
 * hat, soll es aber sehen, herunterladen und löschen können, ohne gleich das
 * ganze Konto zu löschen. Ohne Altbestand zeigt der Bereich nichts.
 */
export function FruehereBewerberdaten() {
  const user = useAuthUser();
  const uid = user?.uid ?? '';
  const queryClient = useQueryClient();
  const angabenQuery = useQuery({ ...kontoAngabenQueryOptions(uid), enabled: Boolean(user) });
  const unterlagenQuery = useQuery({ ...kontoUnterlagenQueryOptions(uid), enabled: Boolean(user) });
  const [open, setOpen] = useState(false);
  const invalidieren = () => queryClient.invalidateQueries({ queryKey: kontoKeys.detail(uid) });

  const loeschenMutation = useMutation({
    mutationFn: loescheAngaben,
    onSuccess: async () => {
      setOpen(false);
      await invalidieren();
      toast.success('Deine gespeicherten Angaben sind gelöscht.');
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  // Art. 7 Abs. 3 DSGVO: der Widerruf muss so einfach sein wie die Einwilligung -
  // ein eigener Knopf, ohne dass die übrigen Angaben mit weg müssen.
  const widerrufMutation = useMutation({
    mutationFn: widerrufeStaatsangehoerigkeit,
    onSuccess: async () => {
      await invalidieren();
      toast.success('Einwilligung widerrufen. Deine Staatsangehörigkeit ist gelöscht.');
    },
    onError: (fehler) => {
      toast.error(fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt.');
    }
  });

  if (angabenQuery.isError || unterlagenQuery.isError) {
    return (
      <p className='text-destructive text-sm'>
        {(angabenQuery.error ?? unterlagenQuery.error)?.message ?? 'Das hat gerade nicht geklappt.'}
      </p>
    );
  }

  const angaben = angabenQuery.data && angabenQuery.data !== 'nicht-verfuegbar' ? angabenQuery.data : null;
  const unterlagen = Array.isArray(unterlagenQuery.data) ? unterlagenQuery.data : [];
  const angabenDa = hatGespeicherteAngaben(angaben);
  if (!angabenDa && unterlagen.length === 0) return null;

  const anzahlFelder = belegteAngaben(angaben);
  const einwilligung = Boolean(angaben?.staatsangehoerigkeitEingewilligtAm);

  return (
    <Card id='fruehere-bewerberdaten'>
      <CardHeader>
        <CardTitle>
          <h2>Früher gespeicherte Angaben und Unterlagen</h2>
        </CardTitle>
        <CardDescription>
          Angaben und Unterlagen nehmen wir im Konto derzeit nicht entgegen. Was du früher hier hinterlegt
          hast, liegt noch bei uns, bis du es oder dein ganzes Konto löschst. Die Angaben stehen auch in
          „Meine Daten herunterladen", die Dateien lädst du hier einzeln herunter.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        {angabenDa && (
          <div className='space-y-2'>
            <h3 className='text-sm font-medium'>Gespeicherte Angaben</h3>
            <p className='text-sm'>
              {anzahlFelder === 1 ? 'Ein Feld' : `${anzahlFelder} Felder`}
              {einwilligung ? ', dazu deine Einwilligung zur Staatsangehörigkeit' : ''}.
            </p>
            <div className='flex flex-wrap gap-2'>
              {einwilligung && (
                <Button
                  type='button'
                  variant='outline'
                  disabled={widerrufMutation.isPending}
                  onClick={() => widerrufMutation.mutate()}
                >
                  {widerrufMutation.isPending ? 'Wird widerrufen…' : 'Einwilligung widerrufen'}
                </Button>
              )}
              <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogTrigger
                  render={
                    <Button type='button' variant='outline'>
                      <Icons.trash className='mr-2 h-4 w-4' />
                      Angaben löschen
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Gespeicherte Angaben wirklich löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Alle gespeicherten Angaben{einwilligung ? ' samt Einwilligung zur Staatsangehörigkeit' : ''}{' '}
                      werden sofort gelöscht. Das lässt sich nicht rückgängig machen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => loeschenMutation.mutate()}
                      disabled={loeschenMutation.isPending}
                      className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    >
                      {loeschenMutation.isPending ? 'Wird gelöscht…' : 'Endgültig löschen'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
        {unterlagen.length > 0 && (
          <div className='space-y-2'>
            <h3 className='text-sm font-medium'>
              Abgelegte Unterlagen - {unterlagen.length} {unterlagen.length === 1 ? 'Datei' : 'Dateien'}
            </h3>
            <div className='space-y-2'>
              {unterlagen.map((u) => (
                <UnterlageZeile key={u.docId} unterlage={u} onGeaendert={invalidieren} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
