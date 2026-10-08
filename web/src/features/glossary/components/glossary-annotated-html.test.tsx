// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/service', () => ({
  getGlossary: () =>
    Promise.resolve([
      {
        slug: 'soldat-auf-zeit',
        term: 'Soldat auf Zeit',
        definition: 'Dienstverhältnis für eine festgelegte Anzahl von Jahren.',
        aliases: []
      }
    ])
}));

const { GlossaryAnnotatedHtml } = await import('./glossary-annotated-html');

afterEach(cleanup);

function renderText() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <p>
        Einstellung als <span data-glossary-term='soldat-auf-zeit'>Soldat auf Zeit</span> möglich.
      </p>
    </QueryClientProvider>
  );
}

function renderAnnotated() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <GlossaryAnnotatedHtml html="<p>Einstellung als <span data-glossary-term='soldat-auf-zeit'>Soldat auf Zeit</span> möglich.</p>" />
    </QueryClientProvider>
  );
}

// Fachbegriffe müssen ohne Hover aufgehen - auf dem Handy gibt es keinen.
describe('GlossaryAnnotatedHtml', () => {
  it('lässt unbekannte Begriffe als reinen Text stehen', () => {
    renderText();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('öffnet die Erklärung per Klick und schließt sie mit Esc', async () => {
    renderAnnotated();
    const begriff = await screen.findByRole('button', { name: /Soldat auf Zeit/ });
    await userEvent.click(begriff);
    expect(await screen.findByText('Dienstverhältnis für eine festgelegte Anzahl von Jahren.')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Erklärung: Soldat auf Zeit' })).not.toBeNull();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('öffnet die Erklärung auch per Tastatur', async () => {
    renderAnnotated();
    const begriff = await screen.findByRole('button', { name: /Soldat auf Zeit/ });
    begriff.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Erklärung: Soldat auf Zeit' })).not.toBeNull();
  });
});
