'use client';

import { useMemo } from 'react';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import type { NavItem, NavGroup } from '@/types';

export const HINWEIS_NACH_ANMELDUNG = 'nach Anmeldung';

/**
 * "Mein Konto" und "Merkliste" leiten Gäste auf die Anmeldung um. Damit das
 * nicht still passiert, sagt der Punkt es vorher und führt direkt dorthin,
 * mit Rücksprung nach der Anmeldung.
 */
export function navFuerBesucher(groups: NavGroup[], angemeldet: boolean): NavGroup[] {
  if (angemeldet) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.nurAngemeldet
        ? {
            ...item,
            url: `/anmelden?weiter=${encodeURIComponent(item.url)}`,
            hinweis: HINWEIS_NACH_ANMELDUNG
          }
        : item
    )
  }));
}

export function useFilteredNavItems(items: NavItem[]) {
  return items;
}

export function useFilteredNavGroups(groups: NavGroup[]) {
  const user = useAuthUser();
  // `undefined` = Anmeldestatus noch offen: ohne Hinweis rendern, statt ihn kurz aufblitzen zu lassen.
  const angemeldet = user !== null;
  return useMemo(() => navFuerBesucher(groups, angemeldet), [groups, angemeldet]);
}
