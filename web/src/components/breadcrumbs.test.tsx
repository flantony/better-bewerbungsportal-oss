// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/jobs' }));

const { Breadcrumbs } = await import('./breadcrumbs');

afterEach(cleanup);

// Lighthouse "list": ein <ol> darf nur <li> enthalten - auch die aktuelle Seite nicht als <span> direkt darin.
describe('Breadcrumbs', () => {
  it('besteht nur aus Listeneinträgen und markiert die aktuelle Seite', () => {
    render(<Breadcrumbs />);
    const liste = screen.getByRole('navigation', { name: 'Pfadnavigation' }).querySelector('ol');
    expect([...(liste?.children ?? [])].every((kind) => kind.tagName === 'LI')).toBe(true);
    const aktuell = document.querySelector('[aria-current="page"]');
    expect(aktuell?.closest('li')).not.toBeNull();
    expect(aktuell?.getAttribute('role')).toBeNull();
  });
});
