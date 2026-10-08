// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MappeDokumente } from './upload-feld';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

/**
 * Die Mappe nimmt keine Ausweiskopie an. Kein eigenes Feld, kein Einwilligungshaken - der
 * Bewerber erfährt stattdessen, dass er sie selbst beilegt.
 */
describe('MappeDokumente - keine Ausweiskopie', () => {
  it('bietet kein Upload-Feld und keine Einwilligung für eine Ausweiskopie an', () => {
    render(<MappeDokumente mappenId='m1' dokumente={[]} />);
    expect(screen.queryByLabelText(/Ausweiskopie hochladen/)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('sagt, dass wir keine Ausweiskopien entgegennehmen und der Bewerber sie selbst beilegt', () => {
    render(<MappeDokumente mappenId='m1' dokumente={[]} />);
    expect(screen.getByText(/Ausweiskopien nehmen wir nicht entgegen/).textContent).toMatch(/selbst bei/);
  });
});
