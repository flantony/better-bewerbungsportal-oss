import type { QueryClient } from '@tanstack/react-query';
import { kontoAngabenQueryOptions, kontoKeys } from '../api/queries';
import type { Angaben, AngabenSicht } from '../api/types';
import { leereAngaben } from './angaben-anfrage';

/** Was der Server nach `kontoAngabenLoeschen` liefert - das Dokument ist weg. */
const GELOESCHT: AngabenSicht = { angaben: {}, staatsangehoerigkeitEingewilligtAm: null };

/**
 * Nach erfolgreichem Loeschen: den Cache SOFORT auf den bekannten neuen Stand
 * setzen, statt auf einen Refetch zu warten. Das aendert `dataUpdatedAt`, und
 * `AngabenFormular` (Key enthaelt es) montiert sofort leer neu. Ein
 * `form.reset(leer)` allein hilft nicht: TanStack Form setzt das Formular
 * beim naechsten Rendern wieder auf die alten `defaultValues` (s. Test).
 * Der Rest des Kontos (Bewerbungsplan haengt an den Angaben) wird neu geladen.
 */
export async function nachAngabenLoeschen(queryClient: QueryClient, uid: string): Promise<void> {
  const angabenKey = kontoAngabenQueryOptions(uid).queryKey;
  queryClient.setQueryData(angabenKey, GELOESCHT);
  await queryClient.invalidateQueries({
    queryKey: kontoKeys.detail(uid),
    predicate: (query) => query.queryKey.length !== angabenKey.length || query.queryKey.at(-1) !== angabenKey.at(-1)
  });
}

/**
 * Startwerte des Formulars: gespeicherte Angaben, sonst leer - die E-Mail mit
 * der Anmelde-Adresse als Vorschlag (gespeichert erst mit „Speichern").
 */
export function angabenFormularWerte(sicht: AngabenSicht, anmeldeEmail: string | null): Required<Angaben> {
  return {
    ...leereAngaben(),
    ...sicht.angaben,
    email: sicht.angaben.email ?? anmeldeEmail ?? ''
  } as Required<Angaben>;
}
