// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KontoFehler } from '../api/fehler';
import type { KontoSicht, Suchprofil, SuchprofilEintrag } from '../api/types';
import { IMPORT_SPEICHER_SCHLUESSEL, vergissImportLink } from '../lib/suchprofil-import';
import { SuchprofilImport } from './suchprofil-import';

const auth = vi.hoisted(() => ({ nutzer: undefined as { uid: string } | null | undefined }));
vi.mock('@/features/auth/components/auth-provider', () => ({ useAuthUser: () => auth.nutzer }));

const service = vi.hoisted(() => ({
  ladeKonto: vi.fn(),
  fuegeSuchfilterHinzu: vi.fn(),
  setzeBenachrichtigung: vi.fn()
}));
vi.mock('../api/service', () => service);

const link = vi.hoisted(() => ({ dekodiereSuchprofile: vi.fn() }));
vi.mock('../lib/suchprofil-link', () => link);

const bestaetigung = vi.hoisted(() => ({ pruefen: vi.fn(), erneutSenden: vi.fn() }));
vi.mock('../hooks/use-email-bestaetigung', () => ({
  useEmailBestaetigung: () => ({ sendet: false, prueft: false, status: null, ...bestaetigung })
}));

const OPTIONEN = {
  organisationsbereich: [],
  laufbahngruppe: ['Mannschaften'],
  bundesland: ['Bayern'],
  vertragsarten: [],
  einstiegswege: [],
  laufbahngruppeBedeutung: { Mannschaften: 'Bedeutungstext vom Server' },
  einstiegswegBedeutung: {}
};

const IT: Suchprofil = { suchbegriff: 'IT', bundesland: ['Bayern'] };
const MANNSCHAFT: Suchprofil = { laufbahngruppe: ['Mannschaften'] };
const PFLEGE: Suchprofil = { suchbegriff: 'Pflege' };

function eintrag(id: string, filter: Suchprofil): SuchprofilEintrag {
  return { id, filter, aktiv: true, quelle: 'hand', erstelltAm: '2026-10-08T00:00:00.000Z' };
}

function sicht(teile: Partial<KontoSicht> = {}): KontoSicht {
  return {
    suchprofile: [],
    merkliste: [],
    optionen: OPTIONEN,
    benachrichtigung: { aktiv: false, emailBestaetigt: true },
    bewerberdatenAktiv: false,
    ...teile
  };
}

function zeige({ hash = '#v1.abc', konto = sicht() }: { hash?: string; konto?: KontoSicht } = {}) {
  window.history.replaceState(null, '', `/suchprofil/uebernehmen${hash}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['konto', 'u1'], konto);
  render(
    <QueryClientProvider client={client}>
      <SuchprofilImport />
    </QueryClientProvider>
  );
  return client;
}

function linkMit(filter: Suchprofil[], namen: (string | null)[] = filter.map(() => null)) {
  link.dekodiereSuchprofile.mockResolvedValue({ ok: true, filter, namen });
}

afterEach(cleanup);
beforeEach(() => {
  vi.restoreAllMocks();
  for (const fn of [...Object.values(service), ...Object.values(link), ...Object.values(bestaetigung)]) fn.mockReset();
  auth.nutzer = { uid: 'u1' };
  vergissImportLink();
  window.sessionStorage.clear();
});

// WOZU: die KI des Bewerbers legt Suchfilter in das Fragment eines Links. Das
// Fragment darf nie einen Server erreichen (DSFA.md, erstelle_suchprofil_link) -
// und gespeichert wird nur, was der Bewerber geprueft und angekreuzt hat.
describe('SuchprofilImport', () => {
  it('liest das Fragment, nimmt es aus der Adresszeile und zeigt je Filter eine Karte', async () => {
    linkMit([IT, MANNSCHAFT], ['IT in Bayern', null]);
    zeige();

    expect(await screen.findByRole('checkbox', { name: /IT in Bayern/ })).toBeTruthy();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/suchprofil/uebernehmen');
    expect(link.dekodiereSuchprofile).toHaveBeenCalledWith('v1.abc', OPTIONEN);
    // Angemeldet: nichts im sessionStorage.
    expect(window.sessionStorage.getItem(IMPORT_SPEICHER_SCHLUESSEL)).toBeNull();

    expect(screen.getByRole('heading', { level: 1, name: 'Suchfilter von deiner KI übernehmen' })).toBeTruthy();
    expect(screen.getByText(/Prüfe sie, bevor du sie speicherst/)).toBeTruthy();
    // Name als Ueberschrift, Beschreibung darunter; ohne Namen die Beschreibung.
    expect(screen.getByRole('heading', { level: 2, name: /IT in Bayern/ })).toBeTruthy();
    expect(screen.getByText('„IT“ · Bayern')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: /Mannschaften/ })).toBeTruthy();
    expect(screen.getByText('Bedeutungstext vom Server')).toBeTruthy();
    for (const box of screen.getAllByRole('checkbox')) expect(box.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/0 von 10 Plätzen für Filter belegt\. Platz ist noch für 10 weitere/)).toBeTruthy();
  });

  it('legt das Fragment ohne Anmeldung in den sessionStorage - nie in den Rueckkehr-Link', async () => {
    auth.nutzer = null;
    zeige();

    const anmelden = await screen.findByRole('link', { name: 'Anmelden' });
    const registrieren = screen.getByRole('link', { name: 'Konto erstellen' });
    expect(anmelden.getAttribute('href')).toBe('/anmelden?weiter=%2Fsuchprofil%2Fuebernehmen');
    expect(registrieren.getAttribute('href')).toBe('/registrieren?weiter=%2Fsuchprofil%2Fuebernehmen');
    expect(window.sessionStorage.getItem(IMPORT_SPEICHER_SCHLUESSEL)).toBe('v1.abc');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('v1.abc');
    expect(link.dekodiereSuchprofile).not.toHaveBeenCalled();
    expect(screen.queryByText(/lässt uns den Link für die Anmeldung nicht zwischenspeichern/)).toBeNull();
  });

  it('erklaert, wenn der sessionStorage gesperrt ist, und behaelt das Fragment im Arbeitsspeicher', async () => {
    auth.nutzer = null;
    // Wie in einem Browser mit gesperrten Websitedaten: schon der Zugriff wirft.
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('gesperrt', 'SecurityError');
    });
    zeige();

    expect(await screen.findByText(/lässt uns den Link für die Anmeldung nicht zwischenspeichern/)).toBeTruthy();

    // Anmeldung innerhalb der Seite (Client-Navigation): der Arbeitsspeicher reicht.
    cleanup();
    auth.nutzer = { uid: 'u1' };
    linkMit([PFLEGE]);
    zeige({ hash: '' });
    await screen.findByRole('checkbox', { name: /Pflege/ });
    expect(link.dekodiereSuchprofile).toHaveBeenCalledWith('v1.abc', OPTIONEN);
  });

  it('holt das Fragment nach der Anmeldung aus dem sessionStorage und loescht es nach dem Speichern', async () => {
    window.sessionStorage.setItem(IMPORT_SPEICHER_SCHLUESSEL, 'v1.gemerkt');
    linkMit([PFLEGE]);
    service.fuegeSuchfilterHinzu.mockResolvedValue({
      ergebnis: 'hinzugefuegt',
      hinzugefuegt: ['n1'],
      uebersprungen: 0,
      suchprofile: [eintrag('n1', PFLEGE)]
    });
    const client = zeige({ hash: '' });

    await screen.findByRole('checkbox', { name: /Pflege/ });
    expect(link.dekodiereSuchprofile).toHaveBeenCalledWith('v1.gemerkt', OPTIONEN);

    await userEvent.click(screen.getByRole('button', { name: /Nur speichern/ }));

    const ergebnis = await screen.findByRole('heading', { level: 2, name: /1 Filter gespeichert/ });
    await waitFor(() => expect(document.activeElement).toBe(ergebnis));
    expect(window.sessionStorage.getItem(IMPORT_SPEICHER_SCHLUESSEL)).toBeNull();
    expect(client.getQueryData<KontoSicht>(['konto', 'u1'])?.suchprofile).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Zu deinen Suchfiltern' }).getAttribute('href')).toBe(
      '/dashboard/konto#suchprofil'
    );
  });

  it('laesst angemeldet nichts im Tab zurueck, wenn man die Seite ohne Entscheidung verlaesst', async () => {
    window.sessionStorage.setItem(IMPORT_SPEICHER_SCHLUESSEL, 'v1.gemerkt');
    linkMit([PFLEGE]);
    zeige({ hash: '' });

    await screen.findByRole('checkbox', { name: /Pflege/ });
    expect(window.sessionStorage.getItem(IMPORT_SPEICHER_SCHLUESSEL)).toBeNull();

    cleanup();
    zeige({ hash: '' });
    expect(await screen.findByText(/Hier ist kein Suchfilter angekommen/)).toBeTruthy();
  });

  it('liest einen Link, der in die schon offene Seite eingefuegt wird', async () => {
    linkMit([PFLEGE]);
    zeige({ hash: '' });
    await screen.findByText(/Hier ist kein Suchfilter angekommen/);

    window.history.replaceState(null, '', '/suchprofil/uebernehmen#v1.neu');
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await screen.findByRole('checkbox', { name: /Pflege/ });
    expect(link.dekodiereSuchprofile).toHaveBeenCalledWith('v1.neu', OPTIONEN);
    expect(window.location.hash).toBe('');
  });

  it('sperrt beide Speichern-Knoepfe, solange gespeichert wird', async () => {
    linkMit([IT]);
    service.fuegeSuchfilterHinzu.mockReturnValue(new Promise(() => undefined));
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: /Speichern und bei neuen Stellen benachrichtigen/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Nur speichern/ }).hasAttribute('disabled')).toBe(true));
    expect(service.fuegeSuchfilterHinzu).toHaveBeenCalledTimes(1);
  });

  it('zeigt bei einem unlesbaren Link den Grund und keinen Speichern-Knopf', async () => {
    window.sessionStorage.setItem(IMPORT_SPEICHER_SCHLUESSEL, 'v1.kaputt');
    link.dekodiereSuchprofile.mockResolvedValue({ ok: false, code: 'kaputt', grund: 'Der Link ist beschädigt.' });
    zeige({ hash: '' });

    expect(await screen.findByText('Der Link ist beschädigt.')).toBeTruthy();
    expect(screen.getByText(/Bitte deine KI, dir einen neuen Suchprofil-Link zu erstellen/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /speichern/i })).toBeNull();
    expect(window.sessionStorage.getItem(IMPORT_SPEICHER_SCHLUESSEL)).toBeNull();
  });

  it('sagt ohne Fragment, wie man zu einem Link kommt', async () => {
    zeige({ hash: '' });
    expect(await screen.findByText(/Hier ist kein Suchfilter angekommen/)).toBeTruthy();
    expect(screen.getByText(/Erstelle mir einen Suchprofil-Link/)).toBeTruthy();
  });

  it('sperrt das Speichern, solange die Auswahl nicht in die freien Plaetze passt', async () => {
    linkMit([IT, PFLEGE]);
    const neun = Array.from({ length: 9 }, (_, i) => eintrag(`e${i}`, { suchbegriff: `alt${i}` }));
    zeige({ konto: sicht({ suchprofile: neun }) });

    await screen.findByRole('checkbox', { name: /IT/ });
    expect(screen.getByText(/Du hast 2 neue Filter ausgewählt, es ist aber nur Platz für 1/)).toBeTruthy();
    const nurSpeichern = screen.getByRole('button', { name: /Nur speichern/ });
    expect(nurSpeichern.hasAttribute('disabled')).toBe(true);

    expect(screen.getByRole('button', { name: 'Plätze neu zählen' })).toBeTruthy();

    // Ein Tipp auf den Titel (das Label) schaltet die Checkbox mit.
    await userEvent.click(screen.getByText('„Pflege“'));

    expect(screen.getByRole('checkbox', { name: /Pflege/ }).getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText(/es ist aber nur Platz/)).toBeNull();
    expect(nurSpeichern.hasAttribute('disabled')).toBe(false);
  });

  it('schickt nur die angekreuzten Filter mit quelle "ki" und schaltet bei „Nur speichern“ nichts ein', async () => {
    linkMit([IT, MANNSCHAFT, PFLEGE], ['IT in Bayern', null, null]);
    service.fuegeSuchfilterHinzu.mockResolvedValue({
      ergebnis: 'hinzugefuegt',
      hinzugefuegt: ['n1'],
      uebersprungen: 1,
      suchprofile: [eintrag('n1', IT), eintrag('alt', PFLEGE)]
    });
    zeige();

    await userEvent.click(await screen.findByRole('checkbox', { name: /Mannschaften/ }));
    await userEvent.click(screen.getByRole('button', { name: /Nur speichern/ }));

    expect(service.fuegeSuchfilterHinzu).toHaveBeenCalledWith([
      { filter: IT, quelle: 'ki', name: 'IT in Bayern' },
      { filter: PFLEGE, quelle: 'ki' }
    ]);
    expect(await screen.findByRole('heading', { name: /1 Filter gespeichert, 1 hattest du schon/ })).toBeTruthy();
    expect(service.setzeBenachrichtigung).not.toHaveBeenCalled();
  });

  it('schaltet die Benachrichtigung nur ueber den ausdruecklichen Knopf ein', async () => {
    linkMit([IT]);
    service.fuegeSuchfilterHinzu.mockResolvedValue({
      ergebnis: 'hinzugefuegt',
      hinzugefuegt: ['n1'],
      uebersprungen: 0,
      suchprofile: [eintrag('n1', IT)]
    });
    service.setzeBenachrichtigung.mockResolvedValue(undefined);
    const client = zeige();

    await userEvent.click(await screen.findByRole('button', { name: /Speichern und bei neuen Stellen benachrichtigen/ }));

    expect(service.setzeBenachrichtigung).toHaveBeenCalledWith(true);
    expect(await screen.findByText(/Benachrichtigungen sind eingeschaltet/)).toBeTruthy();
    expect(client.getQueryData<KontoSicht>(['konto', 'u1'])?.benachrichtigung?.aktiv).toBe(true);
  });

  it('verlangt vor dem Einschalten die bestaetigte Adresse und holt es danach nach', async () => {
    linkMit([IT]);
    service.fuegeSuchfilterHinzu.mockResolvedValue({
      ergebnis: 'hinzugefuegt',
      hinzugefuegt: ['n1'],
      uebersprungen: 0,
      suchprofile: [eintrag('n1', IT)]
    });
    service.setzeBenachrichtigung.mockResolvedValue(undefined);
    bestaetigung.pruefen.mockResolvedValue(true);
    zeige({ konto: sicht({ benachrichtigung: { aktiv: false, emailBestaetigt: false } }) });

    await userEvent.click(await screen.findByRole('button', { name: /Speichern und bei neuen Stellen benachrichtigen/ }));

    expect(await screen.findByText(/bestätige bitte deine E-Mail-Adresse/)).toBeTruthy();
    expect(service.setzeBenachrichtigung).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Ich habe bestätigt/ }));

    expect(service.setzeBenachrichtigung).toHaveBeenCalledWith(true);
    expect(await screen.findByText(/Benachrichtigungen sind eingeschaltet/)).toBeTruthy();
  });

  it('bietet bei schon eingeschalteten Benachrichtigungen nur „Speichern“ an', async () => {
    linkMit([IT]);
    zeige({ konto: sicht({ benachrichtigung: { aktiv: true, emailBestaetigt: true } }) });

    await screen.findByRole('checkbox', { name: /IT/ });
    expect(screen.getByRole('button', { name: /^Speichern\s*(Lädt)?$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /benachrichtigen/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Nur speichern/ })).toBeNull();
  });

  it('zeigt die Meldung des Servers, wenn das Konto voll ist (409)', async () => {
    linkMit([IT]);
    service.fuegeSuchfilterHinzu.mockRejectedValue(
      new KontoFehler('Du kannst höchstens 10 Filter speichern. Es ist nur noch Platz für 0.', 409)
    );
    zeige();

    await userEvent.click(await screen.findByRole('button', { name: /Nur speichern/ }));

    const alarm = await screen.findByRole('alert');
    expect(within(alarm).getByText(/Es ist nur noch Platz für 0/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nur speichern/ })).toBeTruthy();
  });

  it('verwirft auf Wunsch und loescht das gemerkte Fragment', async () => {
    window.sessionStorage.setItem(IMPORT_SPEICHER_SCHLUESSEL, 'v1.gemerkt');
    linkMit([IT]);
    zeige({ hash: '' });

    await userEvent.click(await screen.findByRole('button', { name: 'Nicht übernehmen' }));

    expect(await screen.findByRole('heading', { name: 'Nichts übernommen' })).toBeTruthy();
    expect(window.sessionStorage.getItem(IMPORT_SPEICHER_SCHLUESSEL)).toBeNull();
    expect(service.fuegeSuchfilterHinzu).not.toHaveBeenCalled();
  });
});
