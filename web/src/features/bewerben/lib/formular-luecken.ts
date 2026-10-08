import type { FormularPlan } from '../api/types';

/**
 * Spiegel der Pflichtfelder aus `fuellwerteAus` (functions/src/konto/bewerbung.ts,
 * Feldnamen aus FELDNAME) - ohne sie fuellt der Server gar kein Formular, auch
 * nicht mit "Ich trage die fehlenden Angaben selbst von Hand ein".
 */
const KERN_ANGABEN = ['Nachname', 'Vorname', 'Geburtsdatum'];

/** Derselbe Satz, den der Server im 400 schickt (kontoBewerbungspaketBauen). */
export const KERN_LUECKEN_SATZ =
  'Name, Vorname und Geburtsdatum brauchen wir in jedem Fall. Ergänze sie bitte in „Meine Angaben“.';

export interface FormularLueckenStand {
  /** Mindestens ein gewaehltes Formular vermisst irgendeine Angabe. */
  mitLuecken: boolean;
  /** Mindestens ein gewaehltes Formular vermisst Nachname, Vorname oder Geburtsdatum. */
  kernLuecken: boolean;
  /** Der Bau ist von Formularseite her moeglich (keine Kernluecke, sonstige Luecken akzeptiert). */
  bauBereit: boolean;
}

export function formularLueckenStand(
  formulare: FormularPlan[],
  ausgewaehlt: string[],
  luekenAkzeptiert: boolean
): FormularLueckenStand {
  const gewaehlt = formulare.filter((f) => ausgewaehlt.includes(f.docId));
  const mitLuecken = gewaehlt.some((f) => f.fehlendeAngaben.length > 0);
  const kernLuecken = gewaehlt.some((f) => f.fehlendeAngaben.some((angabe) => KERN_ANGABEN.includes(angabe)));
  return { mitLuecken, kernLuecken, bauBereit: !kernLuecken && (!mitLuecken || luekenAkzeptiert) };
}
