'use client';

import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { MAX_TEXT_ZEICHEN } from '../api/types';
import type { PlatzhalterAngaben } from '../lib/platzhalter';
import { parseRueckgabeblock } from '../lib/rueckgabeblock';
import { offenerPlatzhalterSatz, uebernimmMitPlatzhaltern } from '../lib/texte-platzhalter';
import { OffenePlatzhalterHinweis } from './offene-platzhalter-hinweis';

interface Props {
  anschreiben: string;
  lebenslauf: string;
  onAnschreibenChange: (wert: string) => void;
  onLebenslaufChange: (wert: string) => void;
  /** Eigene Angaben fuer Platzhalter wie "[Adresse]" - nur im Browser, nie gesendet (s. lib/texte-platzhalter.ts). */
  platzhalterAngaben: PlatzhalterAngaben;
  gesperrt: boolean;
}

type TextArt = 'anschreiben' | 'lebenslauf';

const TEXT_ARTEN = ['anschreiben', 'lebenslauf'] as const;
const TEXT_LABEL: Record<TextArt, string> = { anschreiben: 'Anschreiben', lebenslauf: 'Lebenslauf' };

function eingesetztSatz(ersetzt: string[]): string | null {
  return ersetzt.length > 0 ? `Aus deinen Angaben eingesetzt: ${ersetzt.join(', ')}.` : null;
}

/**
 * Der geklickte Knopf wird nach der Aktion gesperrt bzw. verschwindet - ohne
 * gezielten Fokus fiele der auf <body>. flushSync, damit
 * das Ziel beim Fokussieren schon den neuen Inhalt traegt.
 */
function fokussiereNach(ziel: RefObject<HTMLElement | null>, aenderungen: () => void) {
  flushSync(aenderungen);
  ziel.current?.focus();
}

/**
 * Die Meldung kommt erst kurz NACH dem Fokuswechsel in die Live-Region: ein
 * Fokuswechsel bricht eine gerade laufende hoefliche Ansage bei vielen
 * Screenreadern ab, eine danach geaenderte Region wird hinter dem Feld
 * vorgelesen.
 */
const ANSAGE_NACH_FOKUS_MS = 150;

/** Schritt 4: Anschreiben und Lebenslauf, plus ein Einfuege-Feld für den Textblock einer KI. */
export function SchrittTexte({
  anschreiben,
  lebenslauf,
  onAnschreibenChange,
  onLebenslaufChange,
  platzhalterAngaben,
  gesperrt
}: Props) {
  const [einfuegetext, setEinfuegetext] = useState('');
  // Einzige Live-Region des Schritts: meldet das Ergebnis einer Aktion genau
  // einmal. Bewusst NICHT per aria-describedby am Einfuegefeld (wuerde sonst bei
  // jedem Fokus neu vorgelesen) und weg mit der naechsten eigenen Eingabe.
  const [meldung, setMeldung] = useState<string | null>(null);
  const ids = { anschreiben: useId(), lebenslauf: useId() };
  const einfuegenId = useId();
  const textRefs = {
    anschreiben: useRef<HTMLTextAreaElement>(null),
    lebenslauf: useRef<HTMLTextAreaElement>(null)
  };
  const ansageTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(ansageTimer.current), []);
  const texte = { anschreiben, lebenslauf };
  const onTextChange = { anschreiben: onAnschreibenChange, lebenslauf: onLebenslaufChange };

  function uebernehmen() {
    const ergebnis = parseRueckgabeblock(einfuegetext);
    const eingesetzt = uebernimmMitPlatzhaltern(ergebnis, platzhalterAngaben);
    const uebernommen = TEXT_ARTEN.filter((art) => eingesetzt[art] !== undefined);

    const teile: string[] = [];
    teile.push(
      uebernommen.length > 0
        ? `Übernommen: ${uebernommen.map((art) => TEXT_LABEL[art]).join(' und ')}.`
        : 'Kein bekannter Abschnitt gefunden.'
    );
    const eingesetztText = eingesetztSatz(eingesetzt.ersetzt);
    if (eingesetztText) teile.push(eingesetztText);
    if (ergebnis.unbekannteAbschnitte.length > 0) {
      teile.push(`Nicht übernommen: ${ergebnis.unbekannteAbschnitte.join(', ')}.`);
    }

    if (uebernommen.length === 0) {
      // Eingefuegter Text bleibt stehen (zum Nachbessern), der Knopf damit
      // bedienbar und fokussiert - die Meldung kommt ohne Fokuswechsel.
      setMeldung(teile.join(' '));
      return;
    }
    fokussiereNach(textRefs[uebernommen[0]], () => {
      for (const art of uebernommen) onTextChange[art](eingesetzt[art] ?? '');
      setEinfuegetext('');
    });
    meldeNachFokus(teile.join(' '));
  }

  function platzhalterEinsetzen(art: TextArt) {
    const eingesetzt = uebernimmMitPlatzhaltern({ [art]: texte[art] }, platzhalterAngaben);
    fokussiereNach(textRefs[art], () => onTextChange[art](eingesetzt[art] ?? texte[art]));
    meldeNachFokus(eingesetztSatz(eingesetzt.ersetzt));
  }

  function meldeNachFokus(text: string | null) {
    meldungLeeren();
    ansageTimer.current = window.setTimeout(() => setMeldung(text), ANSAGE_NACH_FOKUS_MS);
  }

  function meldungLeeren() {
    window.clearTimeout(ansageTimer.current);
    setMeldung(null);
  }

  function textGeaendert(art: TextArt, wert: string) {
    meldungLeeren();
    onTextChange[art](wert);
  }

  return (
    <Card
      id='schritt-texte'
      tabIndex={-1}
      className='scroll-mt-4 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none'
    >
      <CardHeader>
        <CardTitle>
          <h2>4. Anschreiben und Lebenslauf</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-6'>
        {gesperrt ? (
          <p className='text-muted-foreground text-sm'>Gesperrt, weil diese Ausschreibung nicht mehr aktuell ist.</p>
        ) : (
          <>
            <p className='text-muted-foreground text-sm'>
              Diese Texte speichern wir nicht. Sie landen nur in deinem Bewerbungspaket.
            </p>

            <Field>
              <FieldContent>
                <FieldLabel htmlFor={einfuegenId}>Text aus deiner KI einfügen</FieldLabel>
                <FieldDescription>
                  Füge hier den Textblock ein, den deine KI am Ende ausgibt (er beginnt mit „=== BEWERBUNG:“).
                  Anschreiben und Lebenslauf werden daraus erkannt und unten eingesetzt.
                </FieldDescription>
                <Textarea
                  id={einfuegenId}
                  rows={3}
                  value={einfuegetext}
                  onChange={(e) => {
                    meldungLeeren();
                    setEinfuegetext(e.target.value);
                  }}
                />
                <Button type='button' variant='outline' size='sm' disabled={!einfuegetext.trim()} onClick={uebernehmen}>
                  Übernehmen
                </Button>
                <p role='status' className='text-muted-foreground text-sm'>
                  {meldung}
                </p>
              </FieldContent>
            </Field>

            {TEXT_ARTEN.map((art) => {
              // "[Adresse]" usw. aus dem Briefkopf der KI gingen sonst
              // unveraendert ins PDF. Was noch in Klammern steht, zeigt
              // die Seite direkt unter dem jeweiligen Feld und am Knopf in
              // Schritt 5 - der Paketbau bleibt trotzdem moeglich.
              const einsetzbar = uebernimmMitPlatzhaltern({ [art]: texte[art] }, platzhalterAngaben).ersetzt;
              return (
                <TextFeld
                  key={art}
                  id={ids[art]}
                  textareaRef={textRefs[art]}
                  label={TEXT_LABEL[art]}
                  wert={texte[art]}
                  onChange={(wert) => textGeaendert(art, wert)}
                  platzhalterSatz={offenerPlatzhalterSatz(art, texte[art])}
                >
                  {einsetzbar.length > 0 && (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='mt-2'
                      onClick={() => platzhalterEinsetzen(art)}
                    >
                      Aus meinen Angaben einsetzen ({einsetzbar.join(', ')})
                    </Button>
                  )}
                </TextFeld>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TextFeld({
  id,
  textareaRef,
  label,
  wert,
  onChange,
  platzhalterSatz,
  children
}: {
  id: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  label: string;
  wert: string;
  onChange: (wert: string) => void;
  platzhalterSatz: string | null;
  children?: ReactNode;
}) {
  const zaehlerId = `${id}-zaehler`;
  const hinweisId = `${id}-platzhalter`;
  const ueberLimit = wert.length > MAX_TEXT_ZEICHEN;
  return (
    <Field>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Textarea
          ref={textareaRef}
          id={id}
          rows={10}
          maxLength={MAX_TEXT_ZEICHEN}
          value={wert}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={platzhalterSatz ? `${zaehlerId} ${hinweisId}` : zaehlerId}
        />
        <p id={zaehlerId} className={ueberLimit ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}>
          {wert.length.toLocaleString('de-DE')} / {MAX_TEXT_ZEICHEN.toLocaleString('de-DE')} Zeichen
        </p>
        {/* Keine Live-Region: der Satz aendert sich beim Tippen in eckigen
            Klammern mit jedem Zeichen. Vorgelesen wird er ueber
            aria-describedby, sobald das Feld den Fokus bekommt - auch nach
            "Übernehmen" und "Aus meinen Angaben einsetzen". */}
        {platzhalterSatz && (
          <OffenePlatzhalterHinweis saetze={[platzhalterSatz]} saetzeId={hinweisId}>
            {children}
          </OffenePlatzhalterHinweis>
        )}
      </FieldContent>
    </Field>
  );
}
