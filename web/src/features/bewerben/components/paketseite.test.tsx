// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bewerbungsplan } from '../api/types';
import { SchrittFormulare } from './schritt-formulare';
import { SchrittPaket, SoReichstDuEin } from './schritt-paket';
import { SchrittStelle } from './schritt-stelle';
import { SchrittTexte } from './schritt-texte';
import { SchrittUnterlagen } from './schritt-unterlagen';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));

afterEach(cleanup);

const PLAN: Bewerbungsplan = {
  stelle: {
    pinstGuid: 'p1',
    refCode: '2026-1-CIR-Fw-IT-E',
    titel: 'IT-Feldwebel',
    bewerbungsschluss: '2026-12-01',
    aktiv: true
  },
  formulare: [
    { docId: 'f1', titel: 'Bewerbungsbogen_Militärisch', ausfuellbar: true, fehlendeAngaben: [], optionaleAngaben: [] }
  ],
  geforderteUnterlagen: ['Lebenslauf'],
  hinweise: [],
  ablage: [],
  angabenVorhanden: true
};

function nichts() {}

function alleSchritte() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <h1>Bewerben</h1>
      <SchrittStelle stelle={PLAN.stelle} />
      <SchrittFormulare
        pinstGuid='p1'
        formulare={PLAN.formulare}
        hinweise={[]}
        ausgewaehlt={['f1']}
        onToggle={nichts}
        luekenAkzeptiert={false}
        onLuekenAkzeptiertChange={nichts}
        gesperrt={false}
      />
      <SchrittUnterlagen geforderteUnterlagen={['Lebenslauf']} ablage={[]} ausgewaehlt={[]} onToggle={nichts} gesperrt={false} />
      <SchrittTexte
        anschreiben=''
        lebenslauf=''
        onAnschreibenChange={nichts}
        onLebenslaufChange={nichts}
        platzhalterAngaben={{}}
        gesperrt={false}
      />
      <SchrittPaket
        plan={PLAN}
        auswahl={{ formulare: ['f1'], unterlagen: [], anschreiben: '', lebenslauf: '' }}
        luekenAkzeptiert={false}
        gesperrt={false}
        onErstellt={nichts}
      />
    </QueryClientProvider>
  );
}

describe('Paketseite - Überschriften', () => {
  it('macht die fünf Schritte zu Überschriften der Ebene 2 unter dem Seitentitel (h1)', () => {
    render(alleSchritte());
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      '1. Die Stelle',
      '2. Formulare',
      '3. Unterlagen',
      '4. Anschreiben und Lebenslauf',
      '5. Paket'
    ]);
  });

  it('ordnet Zwischenüberschriften innerhalb eines Schritts darunter ein', () => {
    render(alleSchritte());
    expect(screen.getByRole('heading', { name: 'Geforderte Unterlagen' }).tagName).toBe('H3');
  });
});

describe('Paketseite - verständliche Begriffe', () => {
  it('erklärt die Kennung der Ausschreibung', () => {
    render(alleSchritte());
    expect(screen.getByText(/Kennung der Ausschreibung.*2026-1-CIR-Fw-IT-E/).textContent).toMatch(/Bundeswehr/);
  });

  it('zeigt Formulartitel ohne Unterstriche', () => {
    render(alleSchritte());
    expect(screen.queryByText(/Bewerbungsbogen_Militärisch/)).toBeNull();
    expect(screen.getAllByText(/Bewerbungsbogen Militärisch/).length).toBeGreaterThanOrEqual(2);
  });

  it('spricht nicht vom „Rückgabeblock"', () => {
    render(alleSchritte());
    expect(screen.queryByText(/Rückgabeblock/)).toBeNull();
  });
});

/**
 * "Anlage 1 zum Bewerbungsbogen" (Erklärung zur Verfassungstreue) liegt nie
 * ausgefüllt im Paket - ohne sie ist die Bewerbung aber unvollständig. Und
 * "im Bewerbungsportal suchen" braucht die Adresse. Beides kommt fertig
 * formuliert vom Server.
 */
describe('Paketseite - Vordrucke zum Selbst-Ausfüllen und Einreichweg', () => {
  const VORDRUCKE = [{ titel: 'Anlage 1 zum Bewerbungsbogen', downloadUrl: 'https://example.org/anlage1.pdf' }];
  const EINREICHEN = [
    'Im offiziellen Bewerbungsportal der Bundeswehr (https://bewerbung.bundeswehr-karriere.de) auf „Karriere starten“ klicken und ein Profil anlegen.',
    'Dort die Stelle über ihre Kennung 2026-1-CIR-Fw-IT-E suchen und die Unterlagen als PDF in dein Bewerbungsprofil hochladen.'
  ];

  it('nennt die selbst auszufüllenden Vordrucke im Formular-Schritt mit Download-Link', () => {
    render(
      <SchrittFormulare
        pinstGuid='p1'
        formulare={PLAN.formulare}
        hinweise={[]}
        selbstAuszufuellen={VORDRUCKE}
        ausgewaehlt={['f1']}
        onToggle={nichts}
        luekenAkzeptiert={false}
        onLuekenAkzeptiertChange={nichts}
        gesperrt={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'Selbst ausfüllen und unterschreiben' }).tagName).toBe('H4');
    const link = screen.getByRole('link', { name: /Anlage 1 zum Bewerbungsbogen/ });
    expect(link.getAttribute('href')).toBe('https://example.org/anlage1.pdf');
    expect(screen.getByText(/wir füllen sie nicht aus/)).toBeTruthy();
  });

  it('zeigt keinen Abschnitt, wenn es keine solchen Vordrucke gibt (auch bei einer Serverantwort ohne Feld)', () => {
    render(alleSchritte());
    expect(screen.queryByRole('heading', { name: 'Selbst ausfüllen und unterschreiben' })).toBeNull();
  });

  it('nimmt den Einreichweg mit Portaladresse vom Server', () => {
    render(<SoReichstDuEin dateiname='Bewerbung.zip' refCode='2026-1-CIR-Fw-IT-E' einreichen={EINREICHEN} selbstAuszufuellen={VORDRUCKE} />);
    expect(screen.getByText(/https:\/\/bewerbung\.bundeswehr-karriere\.de/)).toBeTruthy();
    expect(screen.getByText(/Anlage 1 zum Bewerbungsbogen/)).toBeTruthy();
  });

  it('fällt ohne Server-Text auf einen eigenen Satz zurück', () => {
    render(<SoReichstDuEin dateiname='Bewerbung.zip' refCode='2026-1-CIR-Fw-IT-E' />);
    expect(screen.getByText(/über die Kennung 2026-1-CIR-Fw-IT-E suchen/)).toBeTruthy();
  });
});

/**
 * Wir nehmen keine Ausweiskopien entgegen. Verlangt die
 * Ausschreibung eine, steht der Satz vom Server unter den geforderten
 * Unterlagen - sonst fehlt sie in der Bewerbung, ohne dass es auffällt.
 */
describe('Paketseite - Ausweiskopie', () => {
  const HINWEIS =
    'Ausweiskopie: Verlangt die Ausschreibung eine Kopie deines Personalausweises, lege sie selbst bei. Wir nehmen keine Ausweiskopien entgegen.';

  it('zeigt den Hinweis des Servers bei den geforderten Unterlagen', () => {
    render(
      <SchrittUnterlagen
        geforderteUnterlagen={['Lebenslauf', 'Kopie des Personalausweises']}
        ausweiskopieHinweis={HINWEIS}
        ablage={[]}
        ausgewaehlt={[]}
        onToggle={nichts}
        gesperrt={false}
      />
    );
    expect(screen.getByText(HINWEIS)).toBeTruthy();
  });

  it('zeigt nichts zur Ausweiskopie, wenn der Server keinen Hinweis schickt', () => {
    render(
      <SchrittUnterlagen geforderteUnterlagen={['Lebenslauf']} ablage={[]} ausgewaehlt={[]} onToggle={nichts} gesperrt={false} />
    );
    expect(screen.queryByText(/Ausweiskopie/)).toBeNull();
  });
});
