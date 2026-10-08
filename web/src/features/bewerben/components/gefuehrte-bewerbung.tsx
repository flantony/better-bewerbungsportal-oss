'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { bewerbungsplanQueryOptions } from '../api/queries';
import type { Bewerbungsplan } from '../api/types';
import { kontoAngabenQueryOptions } from '@/features/konto/api/queries';
import { formularLueckenStand } from '../lib/formular-luecken';
import { platzhalterAngabenAus } from '../lib/texte-platzhalter';
import { vorausgewaehlteUnterlagen } from '../lib/unterlagen-vorauswahl';
import { FortschrittAnzeige, type FortschrittSchritt } from './fortschritt-anzeige';
import { SchrittFormulare } from './schritt-formulare';
import { SchrittPaket } from './schritt-paket';
import { SchrittStelle } from './schritt-stelle';
import { SchrittTexte } from './schritt-texte';
import { SchrittUnterlagen } from './schritt-unterlagen';

/**
 * Geführte Bewerbung: eine Seite, fünf Abschnitte, eigene
 * Fortschrittsanzeige. Robust wie der Bewerben-Knopf, falls Web und Functions
 * getrennt ausgerollt werden: ist `kontoBewerbungsplan` nicht erreichbar
 * (404/TypeError - Endpunkt fehlt ODER die Stelle gibt es nicht),
 * geht es zurück zur Detailseite, ohne eigenen Platzhaltertext.
 */
export function GefuehrteBewerbung({ pinstGuid }: { pinstGuid: string }) {
  const user = useAuthUser();
  const router = useRouter();
  const planQuery = useQuery({
    ...bewerbungsplanQueryOptions(user?.uid ?? '', pinstGuid),
    enabled: Boolean(user)
  });

  useEffect(() => {
    if (planQuery.data === 'nicht-verfuegbar') {
      router.replace(`/dashboard/jobs/${pinstGuid}`);
    }
  }, [planQuery.data, pinstGuid, router]);

  if (user === undefined || planQuery.isPending) {
    return <p className='text-muted-foreground text-sm'>Lädt deine Bewerbung…</p>;
  }
  if (planQuery.isError) {
    return <p className='text-destructive text-sm'>{planQuery.error.message}</p>;
  }
  if (planQuery.data === 'nicht-verfuegbar') {
    // Redirect laeuft bereits (s. oben) - hier bewusst nichts anzeigen.
    return null;
  }

  return <BewerbungAssistent plan={planQuery.data} />;
}

function BewerbungAssistent({ plan }: { plan: Bewerbungsplan }) {
  const user = useAuthUser();
  // Dieselbe Query wie „Meine Angaben" - kein eigener Endpunkt. Die Werte
  // bleiben im Browser und dienen nur dem Einsetzen von Platzhaltern wie
  // "[Adresse]" in den Texten einer KI (s. SchrittTexte).
  const angabenQuery = useQuery({ ...kontoAngabenQueryOptions(user?.uid ?? ''), enabled: Boolean(user) });
  const platzhalterAngaben = platzhalterAngabenAus(angabenQuery.data);
  const [ausgewaehlteFormulare, setAusgewaehlteFormulare] = useState<string[]>(() => {
    const ausfuellbar = plan.formulare.filter((f) => f.ausfuellbar);
    // Genau ein ausfuellbarer Bogen -> keine echte Wahl noetig, vorausgewaehlt.
    // Mehrere -> keine eigene Vermutung, welcher der richtige ist.
    return ausfuellbar.length === 1 ? [ausfuellbar[0].docId] : [];
  });
  const [luekenAkzeptiert, setLuekenAkzeptiert] = useState(false);
  const [ausgewaehlteUnterlagen, setAusgewaehlteUnterlagen] = useState<string[]>(() =>
    vorausgewaehlteUnterlagen(plan.ablage)
  );
  const [anschreiben, setAnschreiben] = useState('');
  const [lebenslauf, setLebenslauf] = useState('');
  const [paketErstellt, setPaketErstellt] = useState(false);

  const gesperrt = !plan.stelle.aktiv;
  // Erledigt erst, wenn kein gewaehlter Bogen mehr eine offene Luecke hat:
  // Kernluecken nie, sonstige nur mit Haken (s. formularLueckenStand).
  const formulareErledigt =
    (plan.formulare.filter((f) => f.ausfuellbar).length === 0 || ausgewaehlteFormulare.length > 0) &&
    formularLueckenStand(plan.formulare, ausgewaehlteFormulare, luekenAkzeptiert).bauBereit;
  const unterlagenErledigt = plan.geforderteUnterlagen.length === 0 || ausgewaehlteUnterlagen.length > 0;
  const texteErledigt = anschreiben.trim().length > 0 || lebenslauf.trim().length > 0;

  const schritte: FortschrittSchritt[] = [
    { id: 'schritt-stelle', label: 'Die Stelle', erledigt: true },
    { id: 'schritt-formulare', label: 'Formulare', erledigt: !gesperrt && formulareErledigt },
    { id: 'schritt-unterlagen', label: 'Unterlagen', erledigt: !gesperrt && unterlagenErledigt },
    { id: 'schritt-texte', label: 'Anschreiben und Lebenslauf', erledigt: !gesperrt && texteErledigt },
    { id: 'schritt-paket', label: 'Paket', erledigt: paketErstellt }
  ];

  function toggleFormular(docId: string) {
    setAusgewaehlteFormulare((aktuell) => (aktuell.includes(docId) ? aktuell.filter((id) => id !== docId) : [...aktuell, docId]));
  }
  function toggleUnterlage(docId: string) {
    setAusgewaehlteUnterlagen((aktuell) => (aktuell.includes(docId) ? aktuell.filter((id) => id !== docId) : [...aktuell, docId]));
  }

  return (
    <div className='max-w-3xl space-y-6'>
      <FortschrittAnzeige schritte={schritte} />

      <SchrittStelle stelle={plan.stelle} />

      <SchrittFormulare
        pinstGuid={plan.stelle.pinstGuid}
        formulare={plan.formulare}
        hinweise={plan.hinweise}
        selbstAuszufuellen={plan.selbstAuszufuellen}
        ausgewaehlt={ausgewaehlteFormulare}
        onToggle={toggleFormular}
        luekenAkzeptiert={luekenAkzeptiert}
        onLuekenAkzeptiertChange={setLuekenAkzeptiert}
        gesperrt={gesperrt}
      />

      <SchrittUnterlagen
        geforderteUnterlagen={plan.geforderteUnterlagen}
        ausweiskopieHinweis={plan.ausweiskopieHinweis}
        ablage={plan.ablage}
        ausgewaehlt={ausgewaehlteUnterlagen}
        onToggle={toggleUnterlage}
        gesperrt={gesperrt}
      />

      <SchrittTexte
        anschreiben={anschreiben}
        lebenslauf={lebenslauf}
        onAnschreibenChange={setAnschreiben}
        onLebenslaufChange={setLebenslauf}
        platzhalterAngaben={platzhalterAngaben}
        gesperrt={gesperrt}
      />

      <SchrittPaket
        plan={plan}
        auswahl={{ formulare: ausgewaehlteFormulare, unterlagen: ausgewaehlteUnterlagen, anschreiben, lebenslauf }}
        luekenAkzeptiert={luekenAkzeptiert}
        gesperrt={gesperrt}
        onErstellt={() => setPaketErstellt(true)}
      />
    </div>
  );
}
