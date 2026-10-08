import { queryOptions } from '@tanstack/react-query';
import { kontoKeys } from '@/features/konto/api/queries';
import { ladeBewerbungsplan } from './service';

// Wie bei kontoAngabenQueryOptions: kein automatischer Hintergrund-Refetch bei Fenster-Fokus/Netz-
// Wiederverbindung - der Assistent haelt Formulareingaben (Texte, Auswahl) im
// Komponentenzustand, ein stiller Refetch waehrend des Tippens duerfte den
// Plan nie unbemerkt unter den Eingaben wegziehen.
export const bewerbungsplanQueryOptions = (uid: string, pinstGuid: string) =>
  queryOptions({
    queryKey: kontoKeys.bewerbungsplan(uid, pinstGuid),
    queryFn: () => ladeBewerbungsplan(pinstGuid),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
