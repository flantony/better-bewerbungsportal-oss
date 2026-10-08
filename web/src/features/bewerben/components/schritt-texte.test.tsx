// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlatzhalterAngaben } from '../lib/platzhalter';
import { SchrittTexte } from './schritt-texte';

afterEach(cleanup);

function Rahmen({ angaben = {}, start = {} }: { angaben?: PlatzhalterAngaben; start?: { anschreiben?: string; lebenslauf?: string } }) {
  const [anschreiben, setAnschreiben] = useState(start.anschreiben ?? '');
  const [lebenslauf, setLebenslauf] = useState(start.lebenslauf ?? '');
  return (
    <SchrittTexte
      anschreiben={anschreiben}
      lebenslauf={lebenslauf}
      onAnschreibenChange={setAnschreiben}
      onLebenslaufChange={setLebenslauf}
      platzhalterAngaben={angaben}
      gesperrt={false}
    />
  );
}

const BLOCK = ['=== BEWERBUNG:ANSCHREIBEN ===', 'Köln, [Datum]', '=== BEWERBUNG:LEBENSLAUF ===', 'Lebenslauf', '=== ENDE ==='].join(
  '\n'
);

/** Text, den ein Screenreader als Beschreibung des Felds vorliest (aria-describedby aufgeloest). */
function beschreibung(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

async function fuegeEin(user: ReturnType<typeof userEvent.setup>, text: string) {
  const feld = screen.getByLabelText('Text aus deiner KI einfügen');
  await user.click(feld);
  await user.paste(text);
  await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
}

describe('SchrittTexte - Fokus', () => {
  it('setzt den Fokus nach „Übernehmen" ins befüllte Anschreiben', async () => {
    const user = userEvent.setup();
    render(<Rahmen />);
    await fuegeEin(user, BLOCK);
    expect(document.activeElement).toBe(screen.getByLabelText('Anschreiben'));
  });

  it('setzt den Fokus in den Lebenslauf, wenn nur der übernommen wurde', async () => {
    const user = userEvent.setup();
    render(<Rahmen />);
    await fuegeEin(user, '=== BEWERBUNG:LEBENSLAUF ===\nLebenslauf\n=== ENDE ===');
    expect(document.activeElement).toBe(screen.getByLabelText('Lebenslauf'));
  });

  it('lässt Text und Fokus auf „Übernehmen", wenn nichts erkannt wurde', async () => {
    const user = userEvent.setup();
    render(<Rahmen />);
    await fuegeEin(user, 'irgendein Text ohne Marker');
    expect(screen.getByRole('status').textContent).toBe('Kein bekannter Abschnitt gefunden.');
    expect(screen.getByLabelText('Text aus deiner KI einfügen')).toHaveProperty('value', 'irgendein Text ohne Marker');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Übernehmen' }));
  });

  it('setzt den Fokus nach „Aus meinen Angaben einsetzen" in das Feld, in dem eingesetzt wurde', async () => {
    const user = userEvent.setup();
    render(<Rahmen angaben={{ telefon: '0221 1' }} start={{ lebenslauf: 'Telefon: [Telefon]' }} />);
    await user.click(screen.getByRole('button', { name: /Aus meinen Angaben einsetzen/ }));
    const lebenslauf = screen.getByLabelText('Lebenslauf') as HTMLTextAreaElement;
    expect(lebenslauf.value).toBe('Telefon: 0221 1');
    expect(document.activeElement).toBe(lebenslauf);
  });
});

describe('SchrittTexte - Statuszeile', () => {
  it('hängt die Statuszeile nicht an das Einfügefeld und leert sie bei der nächsten Eingabe', async () => {
    const user = userEvent.setup();
    render(<Rahmen />);
    await fuegeEin(user, BLOCK);
    const status = screen.getByRole('status');
    // Erst nach dem Fokuswechsel angesagt, damit der die Ansage nicht abbricht.
    expect(status.textContent).toBe('');
    await waitFor(() => expect(status.textContent).toContain('Übernommen: Anschreiben und Lebenslauf.'));

    expect(beschreibung(screen.getByLabelText('Text aus deiner KI einfügen'))).not.toContain('Übernommen');

    await user.type(screen.getByLabelText('Lebenslauf'), 'x');
    expect(status.textContent).toBe('');
  });

  it('leert die Statuszeile auch bei einer Eingabe ins Einfügefeld', async () => {
    const user = userEvent.setup();
    render(<Rahmen />);
    await fuegeEin(user, BLOCK);
    await waitFor(() => expect(screen.getByRole('status').textContent).not.toBe(''));
    await user.type(screen.getByLabelText('Text aus deiner KI einfügen'), 'x');
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

describe('SchrittTexte - Platzhalter-Hinweis', () => {
  it('zeigt den Hinweis unter dem Feld, in dem der Platzhalter steht, und hängt ihn an genau dieses Feld', () => {
    render(<Rahmen start={{ anschreiben: 'Köln, [Datum]', lebenslauf: 'ohne' }} />);
    const anschreiben = screen.getByLabelText('Anschreiben');
    const lebenslauf = screen.getByLabelText('Lebenslauf');
    const hinweis = screen.getByText(/Im Anschreiben stehen noch Platzhalter/);

    expect(hinweis.textContent).toContain('eckigen Klammern');
    expect(beschreibung(anschreiben)).toContain('Im Anschreiben stehen noch Platzhalter');
    expect(beschreibung(lebenslauf)).not.toContain('Platzhalter');
    // Steht im Dokument zwischen Anschreiben und Lebenslauf.
    expect(anschreiben.compareDocumentPosition(hinweis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hinweis.compareDocumentPosition(lebenslauf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('meldet Platzhalter nicht über eine Live-Region (keine Ansage bei jedem Tastendruck)', async () => {
    const user = userEvent.setup();
    render(<Rahmen />);
    await user.type(screen.getByLabelText('Anschreiben'), 'Köln, [[Dat]');
    expect(screen.getByText(/Im Anschreiben stehen noch Platzhalter/).closest('[role="status"], [aria-live]')).toBeNull();
  });
});
