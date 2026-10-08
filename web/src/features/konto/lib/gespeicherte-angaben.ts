import type { AngabenSicht } from '../api/types';

/**
 * Wie viele Angaben-Felder im Konto belegt sind - fuer schon gespeicherte
 * Angaben, solange Bewerberdaten im Konto ausgeschaltet sind. Nur die Anzahl,
 * nie die Werte: die stehen im Datenexport.
 */
export function belegteAngaben(sicht: AngabenSicht | null | undefined): number {
  if (!sicht) return 0;
  return Object.values(sicht.angaben).filter((wert) => typeof wert === 'string' && wert.trim() !== '').length;
}

/** Ein Einwilligungsvermerk ohne Wert zaehlt mit - auch er ist gespeichert und loeschbar. */
export function hatGespeicherteAngaben(sicht: AngabenSicht | null | undefined): boolean {
  return belegteAngaben(sicht) > 0 || Boolean(sicht?.staatsangehoerigkeitEingewilligtAm);
}
