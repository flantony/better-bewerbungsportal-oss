// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SkipLink } from './skip-link';

afterEach(cleanup);

describe('SkipLink', () => {
  it('ist der erste Tab-Stopp und setzt den Fokus in den Hauptinhalt', async () => {
    render(
      <>
        <SkipLink />
        <nav>
          <a href='#navigation'>Navigation</a>
        </nav>
        <main>
          <p>Inhalt</p>
        </main>
      </>
    );
    await userEvent.tab();
    const link = screen.getByRole('link', { name: 'Zum Inhalt springen' });
    expect(document.activeElement).toBe(link);

    await userEvent.click(link);
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});
