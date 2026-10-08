import { queryOptions } from '@tanstack/react-query';
import { ladeAngaben, ladeKonto, ladeSuchfilterTreffer, ladeUnterlagen } from './service';

export const kontoKeys = {
  all: ['konto'] as const,
  // uid im Key: nach Abmelden/Anmelden mit anderem Konto nie den Stand des
  // vorigen Nutzers aus dem Cache zeigen.
  detail: (uid: string) => [...kontoKeys.all, uid] as const,
  merklisteStellen: (uid: string, ids: string[]) => [...kontoKeys.detail(uid), 'merkliste-stellen', ...ids] as const,
  angaben: (uid: string) => [...kontoKeys.detail(uid), 'angaben'] as const,
  unterlagen: (uid: string) => [...kontoKeys.detail(uid), 'unterlagen'] as const,
  // Der Bewerbungsplan haengt zusaetzlich an der Stelle
  // (`pinstGuid`) - derselbe Nutzer hat fuer jede Stelle einen eigenen Plan.
  // Die eigentliche `queryOptions`-Definition liegt bei `features/bewerben`
  // (dort auch `ladeBewerbungsplan`) - hier nur der Schluessel, damit
  // `kontoLoeschen`/`kontoKeys.all` denselben Cache-Ast mit aufraeumen.
  bewerbungsplan: (uid: string, pinstGuid: string) => [...kontoKeys.detail(uid), 'bewerbungsplan', pinstGuid] as const
};

export const kontoQueryOptions = (uid: string) =>
  queryOptions({ queryKey: kontoKeys.detail(uid), queryFn: ladeKonto, staleTime: 60 * 1000 });

// Kein automatischer Hintergrund-Refetch bei Fenster-Fokus/Netz-
// Wiederverbindung - `AngabenFormular` (meine-angaben.tsx) ist ueber
// `dataUpdatedAt` dieser Query gekeyed, damit ein
// Widerruf/Loeschen sofort einen frischen Formularzustand erzwingt. Ohne
// dieses Abschalten wuerde ein simples Tab-Wechseln waehrend des Tippens
// (staleTime 60s) im Hintergrund neu laden, `dataUpdatedAt` aendern und damit
// das Formular unbemerkt neu montieren - ungespeicherte Eingaben waeren weg.
// Die eigenen Mutationen (invalidateQueries) loesen weiterhin gezielt neu.
export const kontoAngabenQueryOptions = (uid: string) =>
  queryOptions({
    queryKey: kontoKeys.angaben(uid),
    queryFn: ladeAngaben,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

export const kontoUnterlagenQueryOptions = (uid: string) =>
  queryOptions({ queryKey: kontoKeys.unterlagen(uid), queryFn: ladeUnterlagen, staleTime: 60 * 1000 });

// Bewusst NICHT unter `kontoKeys.all`: jede Kontoaenderung invalidiert diesen
// Ast, und zehn Filterkarten wuerden dann jedes Mal zehnmal neu zaehlen (eigenes
// Kontingent auf dem Server, s. KONTO_TREFFER_QUOTA). `filterKennung` im
// Schluessel: ein bearbeiteter Filter zaehlt neu, ein unveraenderter nicht.
// Beim Abmelden/Loeschen raeumt `queryClient.clear()` auch diesen Ast ab.
export const suchfilterTrefferKeys = {
  all: ['konto-suchfilter-treffer'] as const,
  detail: (uid: string, id: string, filterKennung: string) =>
    [...suchfilterTrefferKeys.all, uid, id, filterKennung] as const
};

export const suchfilterTrefferQueryOptions = (uid: string, id: string, filterKennung: string) =>
  queryOptions({
    queryKey: suchfilterTrefferKeys.detail(uid, id, filterKennung),
    queryFn: () => ladeSuchfilterTreffer(id),
    // Der Bestand aendert sich einmal am Tag (Sync) - zehn Minuten sind genug.
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false
  });
