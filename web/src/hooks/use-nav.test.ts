import { describe, expect, it } from 'vitest';
import { navGroups } from '@/config/nav-config';
import { navFuerBesucher } from './use-nav';

describe('navFuerBesucher', () => {
  it('markiert Kontobereiche für Gäste und führt sie zur Anmeldung', () => {
    const items = navFuerBesucher(navGroups, false).flatMap((group) => group.items);
    const konto = items.find((item) => item.title === 'Mein Konto');
    expect(konto?.hinweis).toBe('nach Anmeldung');
    expect(konto?.url).toBe('/anmelden?weiter=%2Fdashboard%2Fkonto');
    expect(items.find((item) => item.title === 'Stellenangebote')?.hinweis).toBeUndefined();
  });

  it('lässt die Navigation für Angemeldete unverändert', () => {
    expect(navFuerBesucher(navGroups, true)).toBe(navGroups);
  });

  it('nennt den Einstieg nicht "Dashboard"', () => {
    expect(navGroups.flatMap((group) => group.items).map((item) => item.title)).not.toContain('Dashboard');
  });
});
