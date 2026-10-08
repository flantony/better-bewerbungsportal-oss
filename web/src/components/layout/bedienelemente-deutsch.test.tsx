// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { KBarProvider } from 'kbar';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import SearchInput from '@/components/search-input';
import { ThemeModeToggle } from '@/components/themes/theme-mode-toggle';
import { SidebarProvider, SidebarRail, SidebarTrigger } from '@/components/ui/sidebar';
import { navGroups } from '@/config/nav-config';

vi.mock('next-themes', () => ({ useTheme: () => ({ setTheme: () => {}, resolvedTheme: 'light' }) }));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  })) as typeof window.matchMedia;
});
afterEach(cleanup);

// Bedienelemente aus der Dashboard-Vorlage tragen von Haus aus englische Namen.
describe('Bedienelemente der Vorlage', () => {
  it('benennt Seitenleisten-Knopf und -Schiene deutsch', () => {
    render(
      <SidebarProvider>
        <SidebarTrigger />
        <SidebarRail />
      </SidebarProvider>
    );
    expect(screen.getAllByRole('button', { name: 'Seitenleiste ein-/ausblenden' })).toHaveLength(2);
  });

  it('benennt den Farbschema-Knopf deutsch', () => {
    render(<ThemeModeToggle />);
    expect(screen.getByRole('button', { name: 'Farbschema wechseln' })).not.toBeNull();
  });

  it('benennt die Suche deutsch, ohne das Tastenkürzel im Namen', () => {
    render(
      <KBarProvider>
        <SearchInput />
      </KBarProvider>
    );
    expect(screen.getByRole('button', { name: 'Suchen…' })).not.toBeNull();
  });

  it('hat keine englischen Gruppennamen in der Navigation', () => {
    expect(navGroups.map((gruppe) => gruppe.label)).not.toContain('Overview');
  });
});
