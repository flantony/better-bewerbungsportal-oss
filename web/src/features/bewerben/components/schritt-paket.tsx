'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { baueBewerbungspaket } from '../api/service';
import type { Bewerbungsplan, VordruckZumSelbstAusfuellen } from '../api/types';
import { formularLueckenStand, KERN_LUECKEN_SATZ } from '../lib/formular-luecken';
import { formularAnzeigeTitel } from '../lib/formular-titel';
import { offenePlatzhalterSaetze } from '../lib/texte-platzhalter';
import { baueZusammenfassung, type BewerbungAuswahl } from '../lib/zusammenfassung';
import { OffenePlatzhalterHinweis } from './offene-platzhalter-hinweis';

interface Props {
  plan: Bewerbungsplan;
  auswahl: BewerbungAuswahl;
  luekenAkzeptiert: boolean;
  gesperrt: boolean;
  onErstellt: (dateiname: string) => void;
}

/**
 * Schritt 5: Zusammenfassung, Knopf "Bewerbungspaket
 * erstellen" -> Download, danach eine kurze Anleitung "So reichst du ein".
 * Die Download-URL selbst wird nirgends gespeichert - nur direkt fuer die
 * eine Navigation verwendet (wie `holeUnterlageDownloadUrl` in
 * meine-unterlagen.tsx).
 */
export function SchrittPaket({ plan, auswahl, luekenAkzeptiert, gesperrt, onErstellt }: Props) {
  const [erfolg, setErfolg] = useState<{ dateiname: string } | null>(null);
  const zusammenfassung = baueZusammenfassung(plan, auswahl);

  // Zwei Faelle, die der Server ohnehin mit 400 ablehnen wuerde (s.
  // pruefePaketAnfrage/pruefeFormularLuecken), hier aber schon lokal bekannt
  // sind - kein leeres Paket anbieten, keine unnoetige Anfrage fuer offene
  // Luecken schicken, die der Bewerber noch nicht akzeptiert hat.
  const lueckenStand = formularLueckenStand(plan.formulare, auswahl.formulare, luekenAkzeptiert);
  const offeneLuecken = !lueckenStand.bauBereit;
  const nichtsAusgewaehlt = zusammenfassung.dateianzahl === 0;
  // Sperrt nicht (der Bewerber kann "[Datum]" auch bewusst im PDF ergaenzen
  // wollen), steht aber direkt ueber dem Knopf. Keine Live-Region - in
  // Schritt 4 haengt derselbe Satz am jeweiligen Feld.
  const offenePlatzhalter = offenePlatzhalterSaetze({ anschreiben: auswahl.anschreiben, lebenslauf: auswahl.lebenslauf });

  const mutation = useMutation({
    mutationFn: () =>
      baueBewerbungspaket({
        pinstGuid: plan.stelle.pinstGuid,
        formulare: auswahl.formulare,
        unterlagen: auswahl.unterlagen,
        ...(auswahl.anschreiben.trim() ? { anschreiben: auswahl.anschreiben } : {}),
        ...(auswahl.lebenslauf.trim() ? { lebenslauf: auswahl.lebenslauf } : {}),
        luekenAkzeptiert
      }),
    onSuccess: (ergebnis) => {
      setErfolg({ dateiname: ergebnis.dateiname });
      onErstellt(ergebnis.dateiname);
      window.location.href = ergebnis.url;
    }
  });

  return (
    <Card
      id='schritt-paket'
      tabIndex={-1}
      className='scroll-mt-4 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none'
    >
      <CardHeader>
        <CardTitle>
          <h2>5. Paket</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {gesperrt ? (
          <p className='text-muted-foreground text-sm'>Gesperrt, weil diese Ausschreibung nicht mehr aktuell ist.</p>
        ) : (
          <>
            <div className='space-y-1 text-sm'>
              <p className='font-medium'>{zusammenfassung.stelleTitel}</p>
              <p>
                {zusammenfassung.dateianzahl} {zusammenfassung.dateianzahl === 1 ? 'Datei' : 'Dateien'} im Paket:
              </p>
              <ul className='text-muted-foreground list-disc space-y-0.5 pl-5'>
                {zusammenfassung.formulare.map((formular) => (
                  <li key={formular.docId}>{formularAnzeigeTitel(formular.name)} (ausgefüllt)</li>
                ))}
                {zusammenfassung.unterlagen.map((unterlage) => (
                  <li key={unterlage.docId}>{unterlage.name}</li>
                ))}
                {zusammenfassung.anschreiben && <li>Anschreiben</li>}
                {zusammenfassung.lebenslauf && <li>Lebenslauf</li>}
                {zusammenfassung.dateianzahl === 0 && <li>Noch nichts ausgewählt.</li>}
              </ul>
            </div>

            <OffenePlatzhalterHinweis saetze={offenePlatzhalter} />

            <Button
              type='button'
              disabled={mutation.isPending || nichtsAusgewaehlt || offeneLuecken}
              isLoading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Icons.fileZip className='mr-2 h-4 w-4' />
              Bewerbungspaket erstellen
            </Button>
            {lueckenStand.kernLuecken && <p className='text-muted-foreground text-sm'>{KERN_LUECKEN_SATZ}</p>}
            {offeneLuecken && !lueckenStand.kernLuecken && (
              <p className='text-muted-foreground text-sm'>
                Ergänze zuerst die fehlenden Angaben oder setze den Haken bei „Ich trage die fehlenden Angaben selbst
                von Hand ein" in Schritt 2.
              </p>
            )}

            {mutation.isError && (
              <Alert variant='destructive'>
                <Icons.alertCircle aria-hidden='true' />
                <AlertDescription>
                  {mutation.error instanceof Error ? mutation.error.message : 'Das hat gerade nicht geklappt.'}
                </AlertDescription>
              </Alert>
            )}

            {erfolg && (
              <SoReichstDuEin
                dateiname={erfolg.dateiname}
                refCode={plan.stelle.refCode}
                einreichen={plan.einreichen}
                selbstAuszufuellen={plan.selbstAuszufuellen}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Der Einreichweg kommt fertig formuliert vom Server (`plan.einreichen`, mit
 * Portaladresse). Der Satz darunter ist nur der Rueckfall fuer eine
 * Serverantwort ohne das Feld.
 */
export function SoReichstDuEin({
  dateiname,
  refCode,
  einreichen,
  selbstAuszufuellen = []
}: {
  dateiname: string;
  refCode: string;
  einreichen?: string[];
  selbstAuszufuellen?: VordruckZumSelbstAusfuellen[];
}) {
  return (
    <Alert>
      <Icons.circleCheck aria-hidden='true' />
      <AlertTitle>„{dateiname}" wird heruntergeladen.</AlertTitle>
      <AlertDescription>
        <p>So reichst du ein:</p>
        <ul className='list-disc space-y-1 pl-5'>
          <li>Amtliche Vordrucke ausdrucken, von Hand unterschreiben und einscannen oder mitschicken.</li>
          {selbstAuszufuellen.length > 0 && (
            <li>
              Selbst ausfüllen und unterschreiben:{' '}
              {selbstAuszufuellen.map((vordruck) => formularAnzeigeTitel(vordruck.titel)).join(', ')} (Link auch in
              WAS-NOCH-ZU-TUN.txt).
            </li>
          )}
          {einreichen && einreichen.length > 0 ? (
            einreichen.map((schritt) => <li key={schritt}>{schritt}</li>)
          ) : (
            <li>
              Im Bewerbungsportal der Bundeswehr die Stelle über die Kennung {refCode} suchen oder den in der
              Ausschreibung genannten Weg nutzen.
            </li>
          )}
          <li>Bei Fragen: die in der Ausschreibung genannte Ansprechperson.</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}
