'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/icons';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { cn } from '@/lib/utils';
import { kontoKeys, kontoQueryOptions } from '../api/queries';
import { fuegeSuchfilterHinzu, setzeBenachrichtigung } from '../api/service';
import { SUCHPROFILE_MAX, type KontoSicht, type Suchoptionen, type Suchprofil } from '../api/types';
import { useEmailBestaetigung } from '../hooks/use-email-bestaetigung';
import { beschreibeFilter, filterErklaerungen } from '../lib/filter-beschreibung';
import { dekodiereSuchprofile, type SuchprofilLinkErgebnis } from '../lib/suchprofil-link';
import {
  ergebnisText,
  holeImportLink,
  IMPORT_PFAD,
  merkeImportLink,
  nimmFragmentAusAdresse,
  nurNochImArbeitsspeicher,
  planeImport,
  vergissImportLink
} from '../lib/suchprofil-import';

const TITEL = 'Suchfilter von deiner KI übernehmen';
const WEITER = `weiter=${encodeURIComponent(IMPORT_PFAD)}`;
const MAIL_REGEL =
  'Wir schreiben dir nur, wenn eine neue Stelle zu einem deiner gespeicherten Filter passt, höchstens einmal am Tag. Die gemeldeten Stellen setzen wir auch auf deine Merkliste; Stellen, die nicht mehr ausgeschrieben sind, nehmen wir dort wieder heraus. Abschalten kannst du das jederzeit in deinem Konto.';

function fehlertext(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : 'Das hat gerade nicht geklappt. Bitte versuch es später erneut.';
}

/** Setzt den Fokus einmal auf das Element, sobald es erscheint (Ergebnis-Ueberschrift). */
function useFokusBeimErscheinen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

/**
 * Seite `/suchprofil/uebernehmen#v1.…`: die KI des Bewerbers hat Suchfilter
 * als Link gebaut (MCP-Werkzeug `erstelle_suchprofil_link`). Die Filter stehen
 * im Fragment - es wird einmal gelesen und sofort aus der Adresszeile
 * entfernt. Nie in einen Query-String, Request oder Log (DSFA.md); fuer den
 * Weg ueber die Anmeldung wartet es im `sessionStorage` dieses Tabs.
 */
export function SuchprofilImport() {
  const user = useAuthUser();
  // undefined: noch nicht gelesen (Server-Rendering, erster Durchlauf).
  const [fragment, setFragment] = useState<string | null | undefined>(undefined);
  const [dauerhaftGemerkt, setDauerhaftGemerkt] = useState(true);

  const angemeldet = useRef(false);

  useEffect(() => {
    // Ausserhalb des Updaters gelesen (Seiteneffekt replaceState); ein schon
    // gesetzter Stand bleibt - im StrictMode-Doppellauf ist die Adresse leer.
    const gelesen = nimmFragmentAusAdresse() ?? holeImportLink();
    setFragment((alt) => alt ?? gelesen);

    // Ein Link, der in die schon offene Seite eingefuegt wird, aendert nur den Hash.
    function beiHashAenderung() {
      if (!/^#v\d/.test(window.location.hash)) return;
      const neu = nimmFragmentAusAdresse();
      if (neu) setFragment(neu);
    }
    window.addEventListener('hashchange', beiHashAenderung);
    return () => {
      window.removeEventListener('hashchange', beiHashAenderung);
      // Angemeldet verlassen (ohne Speichern oder Verwerfen): nichts im Tab
      // zuruecklassen. Ohne Anmeldung geht es gerade zu /anmelden - dann bleibt es.
      if (angemeldet.current) vergissImportLink();
    };
  }, []);

  useEffect(() => {
    angemeldet.current = Boolean(user);
    if (!fragment) return;
    if (user === null) setDauerhaftGemerkt(merkeImportLink(fragment));
    else if (user) nurNochImArbeitsspeicher(fragment);
  }, [user, fragment]);

  let inhalt: React.ReactNode;
  if (fragment === undefined || (fragment && user === undefined)) {
    inhalt = <Lade text='Lädt…' />;
  } else if (!fragment) {
    inhalt = <KeinLink />;
  } else if (user === null) {
    inhalt = <AnmeldenHinweis dauerhaftGemerkt={dauerhaftGemerkt} />;
  } else if (user) {
    // Neuer Link oder anderes Konto: Auswahl und Ergebnis von vorn.
    inhalt = <ImportPruefen key={`${user.uid}:${fragment}`} uid={user.uid} fragment={fragment} />;
  }

  return (
    <div className='space-y-6'>
      <h1 className='font-serif text-2xl font-bold tracking-tight'>{TITEL}</h1>
      {inhalt}
    </div>
  );
}

function Lade({ text }: { text: string }) {
  return (
    <p role='status' className='text-muted-foreground text-sm'>
      {text}
    </p>
  );
}

function KeinLink() {
  return (
    <div className='space-y-4'>
      <p>
        Hier ist kein Suchfilter angekommen. Öffne den Link aus deinem KI-Chat noch einmal, und zwar vollständig,
        so wie deine KI ihn geschrieben hat. Das ist auch nötig, wenn du diese Seite neu geladen hast: Aus
        Datenschutzgründen speichern wir den Link nicht dauerhaft.
      </p>
      <p className='text-muted-foreground text-sm'>
        Noch keinen Link? Sag deiner KI: „Erstelle mir einen Suchprofil-Link“ und beschreib, welche Stellen dich
        interessieren.
      </p>
      <div className='flex flex-wrap gap-2'>
        <Link href='/ki' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          So verbindest du deine KI
        </Link>
        <Link href='/dashboard/konto#suchprofil' className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
          Zu deinen Suchfiltern
        </Link>
      </div>
    </div>
  );
}

function AnmeldenHinweis({ dauerhaftGemerkt }: { dauerhaftGemerkt: boolean }) {
  return (
    <div className='space-y-4'>
      <p>
        Deine KI hat Suchfilter für dich zusammengestellt. Um sie anzusehen und zu speichern, melde dich an oder
        erstelle ein kostenloses Konto. Danach kommst du hierher zurück.
      </p>
      <p className='text-muted-foreground text-sm'>
        Gespeichert wird erst, wenn du die Filter geprüft und bestätigt hast.
      </p>
      {!dauerhaftGemerkt && (
        <p className='text-sm'>
          Dein Browser lässt uns den Link für die Anmeldung nicht zwischenspeichern. Falls die Filter danach fehlen,
          öffne den Link aus deinem Chat noch einmal.
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Link href={`/anmelden?${WEITER}`} className={buttonVariants({ size: 'lg' })}>
          <Icons.login className='h-4 w-4' aria-hidden='true' />
          Anmelden
        </Link>
        <Link href={`/registrieren?${WEITER}`} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Konto erstellen
        </Link>
      </div>
    </div>
  );
}

// ─── Pruefen und Speichern ──────────────────────────────────────────────────

type Benachrichtigungsstand = 'an' | 'schon-an' | 'nicht-gewuenscht' | 'unbestaetigt' | { fehler: string };

interface Gespeichert {
  hinzugefuegt: number;
  uebersprungen: number;
  benachrichtigung: Benachrichtigungsstand;
  /** Bietet der Server Benachrichtigungen ueberhaupt an? */
  benachrichtigungMoeglich: boolean;
}

function ImportPruefen({ uid, fragment }: { uid: string; fragment: string }) {
  const konto = useQuery(kontoQueryOptions(uid));
  const optionen = konto.data?.optionen;
  const [link, setLink] = useState<SuchprofilLinkErgebnis | null>(null);

  // Dekodieren, sobald die Listenwerte des Servers da sind. Laeuft es wegen
  // neuer `optionen` noch einmal, bleibt die Auswahl stehen (gleiche Filterzahl).
  useEffect(() => {
    if (!optionen) return;
    let abgebrochen = false;
    const fertig = (ergebnis: SuchprofilLinkErgebnis) => {
      if (abgebrochen) return;
      if (!ergebnis.ok) vergissImportLink();
      setLink(ergebnis);
    };
    dekodiereSuchprofile(fragment, optionen).then(fertig, () =>
      // Sollte nie werfen - fehlt dem Browser aber z. B. `DecompressionStream`,
      // haengt die Seite sonst auf „Lädt…".
      fertig({
        ok: false,
        code: 'kaputt',
        grund: 'Dein Browser kann diesen Link nicht lesen. Bitte öffne ihn in einem aktuellen Browser.'
      })
    );
    return () => {
      abgebrochen = true;
    };
  }, [fragment, optionen]);

  if (konto.isError) {
    return (
      <div className='space-y-3'>
        <p role='alert' className='text-destructive text-sm'>
          {konto.error.message}
        </p>
        <Button type='button' variant='outline' onClick={() => konto.refetch()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }
  if (!konto.data || !link) return <Lade text='Lädt deine Suchfilter…' />;

  if (!link.ok) {
    return (
      <div className='space-y-4'>
        <Alert variant='destructive'>
          <Icons.alertCircle aria-hidden='true' />
          <AlertTitle>Dieser Link lässt sich nicht übernehmen</AlertTitle>
          <AlertDescription>
            <p>{link.grund}</p>
            <p>Bitte deine KI, dir einen neuen Suchprofil-Link zu erstellen.</p>
          </AlertDescription>
        </Alert>
        <Link href='/dashboard/konto#suchprofil' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Zu deinen Suchfiltern
        </Link>
      </div>
    );
  }

  return <ImportAuswahl uid={uid} sicht={konto.data} filter={link.filter} namen={link.namen} />;
}

function ImportAuswahl({
  uid,
  sicht,
  filter,
  namen
}: {
  uid: string;
  sicht: KontoSicht;
  filter: Suchprofil[];
  namen: (string | null)[];
}) {
  const queryClient = useQueryClient();
  const platzId = useId();
  const mailRegelId = useId();
  const [auswahl, setAuswahl] = useState<boolean[]>(() => filter.map(() => true));
  const [gespeichert, setGespeichert] = useState<Gespeichert | null>(null);
  const [verworfen, setVerworfen] = useState(false);

  const plan = planeImport(
    filter,
    auswahl,
    sicht.suchprofile.map((e) => e.filter)
  );
  const benachrichtigung = sicht.benachrichtigung;
  const benachrichtigungAn = benachrichtigung?.aktiv === true;
  const benachrichtigungAnbieten = benachrichtigung !== null && !benachrichtigungAn;
  const kannSpeichern = plan.ausgewaehlt > 0 && plan.passt;

  // Die Antwort traegt die vollstaendige neue Liste - direkt in den Cache, wie
  // suchprofile-bereich.tsx. Ein laufender kontoLaden-Refetch wuerde sie mit
  // einem aelteren Stand ueberschreiben, deshalb vorher abbrechen.
  async function inDenCache(aendern: (alt: KontoSicht) => KontoSicht) {
    await queryClient.cancelQueries({ queryKey: kontoKeys.detail(uid), exact: true });
    queryClient.setQueryData<KontoSicht>(kontoKeys.detail(uid), (alt) => (alt ? aendern(alt) : alt));
  }

  async function schalteBenachrichtigungEin(): Promise<Benachrichtigungsstand> {
    try {
      await setzeBenachrichtigung(true);
      await inDenCache((alt) => ({
        ...alt,
        benachrichtigung: alt.benachrichtigung ? { ...alt.benachrichtigung, aktiv: true } : alt.benachrichtigung
      }));
      return 'an';
    } catch (fehler) {
      return { fehler: fehlertext(fehler) };
    }
  }

  const speichern = useMutation({
    mutationFn: async (mitBenachrichtigung: boolean): Promise<Gespeichert> => {
      const antwort = await fuegeSuchfilterHinzu(
        filter.flatMap((f, index) => {
          if (!auswahl[index]) return [];
          const name = namen[index];
          return [{ filter: f, quelle: 'ki' as const, ...(name ? { name } : {}) }];
        })
      );
      await inDenCache((alt) => ({ ...alt, suchprofile: antwort.suchprofile }));
      vergissImportLink();

      let stand: Benachrichtigungsstand = benachrichtigungAn ? 'schon-an' : 'nicht-gewuenscht';
      // Einschalten nur auf ausdruecklichen Wunsch (Einwilligung, Art. 6 Abs. 1
      // lit. a DSGVO) - nie nebenbei mit „Nur speichern".
      if (mitBenachrichtigung && !benachrichtigungAn) {
        stand = benachrichtigung?.emailBestaetigt ? await schalteBenachrichtigungEin() : 'unbestaetigt';
      }
      return {
        hinzugefuegt: antwort.hinzugefuegt?.length ?? 0,
        uebersprungen: antwort.uebersprungen ?? 0,
        benachrichtigung: stand,
        benachrichtigungMoeglich: benachrichtigung !== null
      };
    },
    onSuccess: setGespeichert
  });

  if (gespeichert) {
    return (
      <ImportErgebnis
        gespeichert={gespeichert}
        onBenachrichtigung={(stand) => setGespeichert({ ...gespeichert, benachrichtigung: stand })}
        nachBestaetigungEinschalten={async () => {
          // Die Adresse ist jetzt bestaetigt - auch fuer „Mein Konto", falls das
          // Einschalten selbst noch scheitert.
          await inDenCache((alt) => ({
            ...alt,
            benachrichtigung: alt.benachrichtigung
              ? { ...alt.benachrichtigung, emailBestaetigt: true }
              : alt.benachrichtigung
          }));
          return schalteBenachrichtigungEin();
        }}
      />
    );
  }
  if (verworfen) return <ImportVerworfen />;

  const platzText =
    plan.frei === 0
      ? `In deinem Konto sind schon alle ${SUCHPROFILE_MAX} Plätze für Filter belegt.`
      : `In deinem Konto ${plan.belegt === 1 ? 'ist' : 'sind'} ${plan.belegt} von ${SUCHPROFILE_MAX} Plätzen für Filter belegt. Platz ist noch für ${plan.frei} weitere.`;
  const sendet = speichern.isPending;

  return (
    <div className='space-y-6'>
      <p>Deine KI hat diese Filter für dich zusammengestellt. Prüfe sie, bevor du sie speicherst.</p>

      <ul className='space-y-3'>
        {filter.map((f, index) => (
          <li key={index}>
            <FilterKarte
              nummer={index + 1}
              filter={f}
              name={namen[index]}
              optionen={sicht.optionen}
              ausgewaehlt={auswahl[index]}
              schonGespeichert={plan.schonGespeichert[index]}
              disabled={sendet}
              onAuswahl={(an) => setAuswahl((alt) => alt.map((wert, i) => (i === index ? an : wert)))}
            />
          </li>
        ))}
      </ul>

      <div id={platzId} aria-live='polite' className='space-y-1 text-sm'>
        <p className='text-muted-foreground'>{platzText}</p>
        {plan.ausgewaehlt === 0 && <p className='font-medium'>Wähle mindestens einen Filter aus.</p>}
        {plan.ausgewaehlt > 0 && !plan.passt && (
          <p className='text-destructive font-medium'>
            Du hast {plan.neu} neue Filter ausgewählt, es ist aber nur Platz für {plan.frei}. Wähle{' '}
            {plan.neu - plan.frei} ab oder lösche vorher Filter{' '}
            {/* Neuer Tab: der Link steckt nur im Arbeitsspeicher dieser Seite. */}
            <Link href='/dashboard/konto#suchprofil' target='_blank' className='underline underline-offset-4'>
              in deinem Konto (öffnet einen neuen Tab)
            </Link>
            . Tippe danach hier auf „Plätze neu zählen“. Lade diese Seite dabei nicht neu, sonst ist der
            Link weg.
          </p>
        )}
        {plan.ausgewaehlt > 0 && !plan.passt && (
          <Button
            type='button'
            variant='outline'
            size='lg'
            className='min-h-11'
            onClick={() => queryClient.invalidateQueries({ queryKey: kontoKeys.detail(uid), exact: true })}
          >
            Plätze neu zählen
          </Button>
        )}
      </div>
      <p role='status' className='sr-only'>
        {sendet ? 'Wird gespeichert…' : ''}
      </p>

      {speichern.isError && (
        <p role='alert' className='text-destructive text-sm'>
          {fehlertext(speichern.error)}
        </p>
      )}

      <div className='space-y-3'>
        {benachrichtigungAnbieten && (
          <p id={mailRegelId} className='text-muted-foreground text-sm'>
            {MAIL_REGEL} Mehr dazu in der{' '}
            <Link href='/datenschutz' className='underline underline-offset-4' target='_blank'>
              Datenschutzerklärung
            </Link>
            .
          </p>
        )}
        {benachrichtigungAn && (
          <p className='text-muted-foreground text-sm'>
            Deine Benachrichtigungen sind schon eingeschaltet. Neue Filter zählen ab dem Speichern mit.
          </p>
        )}
        <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap'>
          {benachrichtigungAnbieten ? (
            <>
              <Button
                type='button'
                size='lg'
                className='h-auto min-h-11 whitespace-normal'
                disabled={!kannSpeichern || sendet}
                isLoading={sendet && speichern.variables === true}
                aria-describedby={`${platzId} ${mailRegelId}`}
                onClick={() => speichern.mutate(true)}
              >
                Speichern und bei neuen Stellen benachrichtigen
              </Button>
              <Button
                type='button'
                variant='outline'
                size='lg'
                className='min-h-11'
                disabled={!kannSpeichern || sendet}
                isLoading={sendet && speichern.variables === false}
                aria-describedby={platzId}
                onClick={() => speichern.mutate(false)}
              >
                Nur speichern
              </Button>
            </>
          ) : (
            <Button
              type='button'
              size='lg'
              className='min-h-11'
              disabled={!kannSpeichern || sendet}
              isLoading={sendet}
              aria-describedby={platzId}
              onClick={() => speichern.mutate(false)}
            >
              Speichern
            </Button>
          )}
          <Button
            type='button'
            variant='ghost'
            size='lg'
            className='min-h-11'
            disabled={sendet}
            onClick={() => {
              vergissImportLink();
              setVerworfen(true);
            }}
          >
            Nicht übernehmen
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterKarte({
  nummer,
  filter,
  name,
  optionen,
  ausgewaehlt,
  schonGespeichert,
  disabled,
  onAuswahl
}: {
  nummer: number;
  filter: Suchprofil;
  name: string | null;
  optionen: Suchoptionen;
  ausgewaehlt: boolean;
  schonGespeichert: boolean;
  disabled: boolean;
  onAuswahl: (an: boolean) => void;
}) {
  const id = useId();
  const beschreibungId = useId();
  const beschreibung = beschreibeFilter(filter);
  const erklaerungen = filterErklaerungen(filter, optionen);

  return (
    <article
      aria-labelledby={`${id}-titel`}
      className={cn(
        'has-focus-visible:ring-ring/50 relative flex items-start gap-3 rounded-md border p-4 has-focus-visible:ring-[3px]',
        !ausgewaehlt && 'bg-muted/40'
      )}
    >
      {/* Die Ueberschrift ist das Label, und ihre ::after-Flaeche deckt die
          ganze Karte: ein Tipp irgendwo auf die Karte schaltet - am Handy
          statt des 16px-Kaestchens. */}
      <Checkbox
        id={id}
        className='relative z-10 mt-1'
        checked={ausgewaehlt}
        disabled={disabled}
        aria-describedby={beschreibungId}
        onCheckedChange={(checked) => onAuswahl(Boolean(checked))}
      />
      <div className='min-w-0 flex-1 space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <h2 id={`${id}-titel`} className='font-medium break-words'>
            <Label
              htmlFor={id}
              className="block cursor-pointer text-base leading-snug font-medium after:absolute after:inset-0 after:rounded-md after:content-['']"
            >
              <span className='sr-only'>Filter {nummer}: </span>
              {name ?? beschreibung}
            </Label>
          </h2>
        </div>
        <div id={beschreibungId} className='space-y-2'>
          {name && <p className='text-sm break-words'>{beschreibung}</p>}
          {schonGespeichert && (
            <p className='text-sm font-medium'>Diesen Filter hast du schon. Wir speichern ihn nicht doppelt.</p>
          )}
        </div>
        {erklaerungen.length > 0 && (
          <dl className='text-muted-foreground space-y-1 text-sm'>
            {erklaerungen.map((e) => (
              <div key={e.begriff}>
                <dt className='inline font-medium'>{e.begriff}: </dt>
                <dd className='inline'>{e.bedeutung}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

// ─── Ergebnis ───────────────────────────────────────────────────────────────

function ImportErgebnis({
  gespeichert,
  onBenachrichtigung,
  nachBestaetigungEinschalten
}: {
  gespeichert: Gespeichert;
  onBenachrichtigung: (stand: Benachrichtigungsstand) => void;
  nachBestaetigungEinschalten: () => Promise<Benachrichtigungsstand>;
}) {
  const ueberschrift = useFokusBeimErscheinen<HTMLHeadingElement>();
  const stand = gespeichert.benachrichtigung;

  return (
    <section aria-labelledby='import-ergebnis' className='space-y-4'>
      <h2
        id='import-ergebnis'
        ref={ueberschrift}
        tabIndex={-1}
        className='focus-visible:ring-ring/50 flex items-start gap-2 rounded-sm text-lg font-semibold outline-none focus-visible:ring-[3px]'
      >
        <Icons.circleCheck className='text-brand mt-1 h-5 w-5 shrink-0' aria-hidden='true' />
        {ergebnisText(gespeichert.hinzugefuegt, gespeichert.uebersprungen)}
      </h2>

      {stand === 'an' && (
        <p>
          Benachrichtigungen sind eingeschaltet. Wir schreiben dir, sobald eine neue Stelle zu einem deiner
          Filter passt, höchstens einmal am Tag.
        </p>
      )}
      {stand === 'schon-an' && <p>Deine Benachrichtigungen sind eingeschaltet. Die Filter zählen ab sofort mit.</p>}
      {stand === 'nicht-gewuenscht' && gespeichert.benachrichtigungMoeglich && (
        <p className='text-muted-foreground text-sm'>
          Möchtest du eine Mail, wenn neue passende Stellen erscheinen? Das kannst du jederzeit in deinem Konto unter
          „Benachrichtigungen“ einschalten.
        </p>
      )}
      {stand === 'unbestaetigt' && (
        <BestaetigungNoetig
          onBestaetigt={async () => onBenachrichtigung(await nachBestaetigungEinschalten())}
        />
      )}
      {typeof stand === 'object' && (
        <p role='alert' className='text-destructive text-sm'>
          Die Filter sind gespeichert, aber die Benachrichtigungen ließen sich gerade nicht einschalten: {stand.fehler}{' '}
          Du kannst sie in deinem Konto unter „Benachrichtigungen“ einschalten.
        </p>
      )}

      <p className='text-muted-foreground text-sm'>
        Wie viele Stellen gerade zu jedem Filter passen, siehst du bei deinen Suchfiltern.
      </p>
      <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap'>
        <Link href='/dashboard/konto#suchprofil' className={buttonVariants({ size: 'lg' })}>
          Zu deinen Suchfiltern
        </Link>
        <Link href='/dashboard/jobs' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          <Icons.search className='h-4 w-4' aria-hidden='true' />
          Stellen durchsuchen
        </Link>
      </div>
    </section>
  );
}

/**
 * Derselbe Weg wie auf „Mein Konto" (benachrichtigungen.tsx): ohne bestaetigte
 * Adresse schalten wir keine Mails ein. Der Bewerber hat das Einschalten schon
 * ausdruecklich gewaehlt - nach der Bestaetigung holen wir es nach und sagen das
 * vorher so.
 */
function BestaetigungNoetig({ onBestaetigt }: { onBestaetigt: () => Promise<void> }) {
  const bestaetigung = useEmailBestaetigung();
  const [schaltetEin, setSchaltetEin] = useState(false);

  async function pruefen() {
    if (!(await bestaetigung.pruefen())) return;
    setSchaltetEin(true);
    try {
      await onBestaetigt();
    } finally {
      setSchaltetEin(false);
    }
  }

  return (
    <div className='space-y-3 rounded-md border p-4'>
      <p>
        Bevor wir dir schreiben dürfen, bestätige bitte deine E-Mail-Adresse. Wir haben dir dazu eine Mail geschickt.
        Wenn du den Link darin geöffnet hast, klick auf „Ich habe bestätigt“. Dann schalten wir die Benachrichtigungen
        ein.
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          size='lg'
          onClick={bestaetigung.erneutSenden}
          disabled={bestaetigung.sendet}
        >
          Bestätigungsmail erneut senden
        </Button>
        <Button
          type='button'
          size='lg'
          onClick={pruefen}
          disabled={bestaetigung.prueft || schaltetEin}
          isLoading={bestaetigung.prueft || schaltetEin}
        >
          Ich habe bestätigt
        </Button>
      </div>
      <p role='status' className='text-sm'>
        {bestaetigung.status}
      </p>
    </div>
  );
}

function ImportVerworfen() {
  const ueberschrift = useFokusBeimErscheinen<HTMLHeadingElement>();
  return (
    <section aria-labelledby='import-verworfen' className='space-y-4'>
      <h2
        id='import-verworfen'
        ref={ueberschrift}
        tabIndex={-1}
        className='focus-visible:ring-ring/50 rounded-sm text-lg font-semibold outline-none focus-visible:ring-[3px]'
      >
        Nichts übernommen
      </h2>
      <p>Wir haben die Filter aus dem Link nicht gespeichert.</p>
      <Link href='/dashboard/konto#suchprofil' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        Zu deinen Suchfiltern
      </Link>
    </section>
  );
}
