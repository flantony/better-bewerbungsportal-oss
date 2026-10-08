'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { cn } from '@/lib/utils';
import { kontoKeys, suchfilterTrefferQueryOptions } from '../api/queries';
import { aendereSuchfilter, fuegeSuchfilterHinzu, loescheSuchfilter } from '../api/service';
import {
  SUCHPROFILE_MAX,
  type KontoSicht,
  type Suchoptionen,
  type Suchprofil,
  type SuchprofileAntwort,
  type SuchprofilEintrag
} from '../api/types';
import { beschreibeFilter, filterErklaerungen, filterKennung, trefferText } from '../lib/filter-beschreibung';
import { SuchprofilFormular } from './suchprofil-formular';

// `nr` zaehlt hoch: dieselbe Meldung zweimal hintereinander ("Filter
// pausiert." auf zwei Karten) bekommt so einen neuen Knoten und wird erneut
// angesagt - unveraenderter Text in einer aria-live-Region bliebe stumm.
type Meldung = { text: string; fehler: boolean; nr: number };

const ZU_VIELE = `Du kannst höchstens ${SUCHPROFILE_MAX} Filter speichern. Lösche erst einen, bevor du einen neuen hinzufügst.`;

function fehlertext(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt. Bitte versuch es später erneut.';
}

/**
 * Bereich „Suchprofil" auf „Mein Konto": eine Karte je gespeichertem Filter
 * (mehrere Filter je Konto). Es ist immer nur EIN
 * Formular offen - Bearbeiten einer Karte oder „Filter hinzufügen". Ergebnisse
 * stehen in einer Statuszeile (aria-live) statt in einem Toast, damit sie auch
 * nach dem Wegklicken nachlesbar bleiben.
 */
export function SuchprofileBereich({ sicht }: { sicht: KontoSicht }) {
  const user = useAuthUser();
  const uid = user?.uid ?? '';
  const queryClient = useQueryClient();
  const formularId = useId();
  const [offen, setOffen] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const meldungRef = useRef<HTMLParagraphElement>(null);
  const hinzufuegenRef = useRef<HTMLButtonElement>(null);
  // Nach dem Loeschen verschwindet die Karte samt Knopf und Dialog - der Fokus
  // geht auf die Statuszeile, statt auf <body> zu fallen (wie „Meine Angaben").
  const fokusAufMeldung = useRef(false);

  const liste = sicht.suchprofile;

  useEffect(() => {
    if (!fokusAufMeldung.current) return;
    fokusAufMeldung.current = false;
    // Ein Frame Abstand: erst muss der Loeschdialog seinen eigenen
    // Fokus-Ruecksprung erledigt haben.
    const frame = requestAnimationFrame(() => meldungRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [meldung]);

  // Die Antwort traegt die vollstaendige neue Liste - direkt in den Cache, statt
  // das ganze Konto mit kontoLaden neu zu holen. Vorher einen laufenden
  // kontoLaden-Refetch (z. B. nach Tabwechsel) abbrechen, sonst ueberschreibt
  // sein aelterer Stand die neue Liste.
  async function uebernehmen(antwort: SuchprofileAntwort) {
    await queryClient.cancelQueries({ queryKey: kontoKeys.detail(uid), exact: true });
    queryClient.setQueryData<KontoSicht>(kontoKeys.detail(uid), (alt) =>
      alt ? { ...alt, suchprofile: antwort.suchprofile } : alt
    );
  }

  function melde(text: string, fehler = false, fokus = false) {
    fokusAufMeldung.current = fokus;
    setMeldung((alt) => ({ text, fehler, nr: (alt?.nr ?? 0) + 1 }));
  }

  function oeffneNeu() {
    if (offen === 'neu') {
      setOffen(null);
      return;
    }
    if (liste.length >= SUCHPROFILE_MAX) {
      melde(ZU_VIELE, true);
      return;
    }
    setMeldung(null);
    setOffen('neu');
  }

  // Kein useMutation: das Formular (TanStack Form) haelt selbst den
  // Sendezustand, und der try/catch hier ist die Formulargrenze.
  async function speichereNeu({ filter, name }: { filter: Suchprofil; name: string }) {
    try {
      const antwort = await fuegeSuchfilterHinzu([{ filter, quelle: 'hand', ...(name ? { name } : {}) }]);
      await uebernehmen(antwort);
      if (!antwort.hinzugefuegt?.length) {
        melde('Genau diesen Filter hast du schon gespeichert.', true);
        return;
      }
      setOffen(null);
      melde('Filter gespeichert.');
      hinzufuegenRef.current?.focus();
    } catch (fehler) {
      melde(fehlertext(fehler), true);
    }
  }

  async function speichereAenderung(
    eintrag: SuchprofilEintrag,
    { filter, name }: { filter: Suchprofil; name: string },
    zurueck: () => void
  ) {
    try {
      await uebernehmen(await aendereSuchfilter(eintrag.id, { filter, name }));
      setOffen(null);
      melde('Änderungen gespeichert.');
      zurueck();
    } catch (fehler) {
      melde(fehlertext(fehler), true);
    }
  }

  return (
    <Card id='suchprofil'>
      <CardHeader>
        <CardTitle>
          <h2>Suchprofil</h2>
        </CardTitle>
        <CardDescription>
          Deine gespeicherten Filter. Eine Stelle passt zu dir, wenn sie zu einem deiner aktiven Filter
          passt. Pausierte Filter bleiben gespeichert, zählen aber nicht für Benachrichtigungen.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p
          ref={meldungRef}
          tabIndex={-1}
          aria-live='polite'
          className={cn(
            'focus-visible:ring-ring/50 rounded-sm text-sm outline-none focus-visible:ring-[3px] empty:sr-only',
            meldung?.fehler ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {meldung && <span key={meldung.nr}>{meldung.text}</span>}
        </p>

        {liste.length === 0 ? (
          <p className='text-muted-foreground text-sm'>Du hast noch keinen Filter gespeichert.</p>
        ) : (
          <ul className='space-y-3'>
            {liste.map((eintrag, index) => (
              <li key={eintrag.id}>
                <SuchfilterKarte
                  uid={uid}
                  eintrag={eintrag}
                  nummer={index + 1}
                  optionen={sicht.optionen}
                  offen={offen === eintrag.id}
                  onOeffnen={() => {
                    setMeldung(null);
                    setOffen(offen === eintrag.id ? null : eintrag.id);
                  }}
                  onSchliessen={() => setOffen(null)}
                  onSpeichern={(werte, zurueck) => speichereAenderung(eintrag, werte, zurueck)}
                  onAntwort={async (antwort, text) => {
                    await uebernehmen(antwort);
                    melde(text);
                  }}
                  onGeloescht={async (antwort) => {
                    if (offen === eintrag.id) setOffen(null);
                    await uebernehmen(antwort);
                    melde('Filter gelöscht.', false, true);
                  }}
                  onFehler={(fehler) => melde(fehlertext(fehler), true)}
                />
              </li>
            ))}
          </ul>
        )}

        <Button
          ref={hinzufuegenRef}
          type='button'
          variant='outline'
          aria-expanded={offen === 'neu'}
          aria-controls={offen === 'neu' ? formularId : undefined}
          onClick={oeffneNeu}
        >
          Filter hinzufügen
        </Button>

        {offen === 'neu' && (
          <section id={formularId} aria-labelledby={`${formularId}-titel`} className='space-y-4 rounded-md border p-4'>
            <h3 id={`${formularId}-titel`} className='font-medium'>
              Neuer Filter
            </h3>
            <SuchprofilFormular
              optionen={sicht.optionen}
              eintrag={null}
              onSpeichern={speichereNeu}
              onAbbrechen={() => {
                setOffen(null);
                hinzufuegenRef.current?.focus();
              }}
            />
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function SuchfilterKarte({
  uid,
  eintrag,
  nummer,
  optionen,
  offen,
  onOeffnen,
  onSchliessen,
  onSpeichern,
  onAntwort,
  onGeloescht,
  onFehler
}: {
  uid: string;
  eintrag: SuchprofilEintrag;
  nummer: number;
  optionen: Suchoptionen;
  offen: boolean;
  onOeffnen: () => void;
  onSchliessen: () => void;
  onSpeichern: (werte: { filter: Suchprofil; name: string }, zurueck: () => void) => Promise<void>;
  onAntwort: (antwort: SuchprofileAntwort, text: string) => Promise<void>;
  onGeloescht: (antwort: SuchprofileAntwort) => Promise<void>;
  onFehler: (fehler: unknown) => void;
}) {
  const titelId = useId();
  const formularId = useId();
  const bearbeitenRef = useRef<HTMLButtonElement>(null);
  const [loeschDialog, setLoeschDialog] = useState(false);
  const beschreibung = beschreibeFilter(eintrag.filter);
  const erklaerungen = filterErklaerungen(eintrag.filter, optionen);
  const titel = eintrag.name ?? beschreibung;

  const umschaltenMutation = useMutation({
    mutationFn: () => aendereSuchfilter(eintrag.id, { aktiv: !eintrag.aktiv }),
    onSuccess: (antwort) => onAntwort(antwort, eintrag.aktiv ? 'Filter pausiert.' : 'Filter läuft wieder.'),
    onError: onFehler
  });

  const loeschenMutation = useMutation({
    mutationFn: () => loescheSuchfilter(eintrag.id),
    onSuccess: (antwort) => {
      setLoeschDialog(false);
      onGeloescht(antwort);
    },
    onError: (fehler) => {
      setLoeschDialog(false);
      onFehler(fehler);
    }
  });

  return (
    <article aria-labelledby={titelId} className={cn('space-y-3 rounded-md border p-4', !eintrag.aktiv && 'bg-muted/40')}>
      <div className='flex flex-wrap items-center gap-2'>
        <h3 id={titelId} className='font-medium'>
          <span className='sr-only'>Filter {nummer}: </span>
          {titel}
        </h3>
        {eintrag.quelle === 'ki' && <Badge variant='secondary'>von deiner KI</Badge>}
        {!eintrag.aktiv && <Badge variant='outline'>pausiert</Badge>}
      </div>

      {eintrag.name && <p className='text-sm'>{beschreibung}</p>}

      {erklaerungen.length > 0 && (
        <dl className='text-muted-foreground space-y-1 text-xs'>
          {erklaerungen.map((e) => (
            <div key={e.begriff}>
              <dt className='inline font-medium'>{e.begriff}: </dt>
              <dd className='inline'>{e.bedeutung}</dd>
            </div>
          ))}
        </dl>
      )}

      <SuchfilterTreffer uid={uid} eintrag={eintrag} />

      <div className='flex flex-wrap gap-2'>
        <Button
          ref={bearbeitenRef}
          type='button'
          variant='outline'
          size='sm'
          aria-describedby={titelId}
          aria-expanded={offen}
          aria-controls={offen ? formularId : undefined}
          onClick={onOeffnen}
        >
          Bearbeiten
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          aria-describedby={titelId}
          disabled={umschaltenMutation.isPending}
          isLoading={umschaltenMutation.isPending}
          onClick={() => umschaltenMutation.mutate()}
        >
          {eintrag.aktiv ? 'Pausieren' : 'Fortsetzen'}
        </Button>
        <AlertDialog open={loeschDialog} onOpenChange={setLoeschDialog}>
          <AlertDialogTrigger
            render={
              <Button type='button' variant='outline' size='sm' aria-describedby={titelId}>
                Löschen
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Diesen Filter wirklich löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                „{titel}" wird sofort gelöscht. Das lässt sich nicht rückgängig machen.
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

      {offen && (
        <div id={formularId} className='border-t pt-4'>
          <SuchprofilFormular
            optionen={optionen}
            eintrag={eintrag}
            onSpeichern={(werte) => onSpeichern(werte, () => bearbeitenRef.current?.focus())}
            onAbbrechen={() => {
              onSchliessen();
              bearbeitenRef.current?.focus();
            }}
          />
        </div>
      )}
    </article>
  );
}

/**
 * Die Trefferzahl wird je Karte nachgeladen (eigener Endpunkt, eigener Cache,
 * s. suchfilterTrefferQueryOptions) - bewusst `useQuery` statt
 * `useSuspenseQuery`: die Karte selbst steht sofort, nur diese eine Zeile hat
 * einen eigenen Ladezustand. Fehlt der Endpunkt noch, zeigt die Karte keine Zahl.
 */
function SuchfilterTreffer({ uid, eintrag }: { uid: string; eintrag: SuchprofilEintrag }) {
  const treffer = useQuery({
    ...suchfilterTrefferQueryOptions(uid, eintrag.id, filterKennung(eintrag.filter)),
    enabled: Boolean(uid)
  });

  if (treffer.isPending) return <p className='text-muted-foreground text-sm'>Zählt passende Stellen…</p>;
  if (treffer.isError) {
    return <p className='text-muted-foreground text-sm'>Die Zahl der passenden Stellen lässt sich gerade nicht abrufen.</p>;
  }
  if (treffer.data === 'nicht-verfuegbar') return null;
  return <p className='text-sm'>{trefferText(treffer.data)}</p>;
}
