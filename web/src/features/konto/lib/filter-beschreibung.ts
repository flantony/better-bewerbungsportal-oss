import type { Suchoptionen, Suchprofil, SuchfilterTreffer } from '../api/types';

// Anzeigename je Einstiegsweg-Code - nur die Grossschreibung der Begriffe,
// keine Erklaerung. Die Erklaerung selbst kommt ausschliesslich aus
// `optionen.einstiegswegBedeutung` (Quelle: functions/src/lib/einstiegsweg.ts).
export const EINSTIEGSWEG_LABELS: Record<string, string> = {
  reserveoffizier: 'Reserveoffizier',
  seiteneinstieg: 'Seiteneinstieg',
  wiedereinstellung: 'Wiedereinstellung'
};

const TAETIGKEITSBEREICH_TEXT: Record<string, string> = { militaerisch: 'militärisch', zivil: 'zivil' };
const UMFANG_TEXT: Record<string, string> = { vollzeit: 'Vollzeit', teilzeit: 'Teilzeit' };

function aufzaehlung(werte: string[], hoechstens = 3): string {
  if (werte.length <= hoechstens) return werte.join(', ');
  return `${werte.slice(0, hoechstens).join(', ')} und ${werte.length - hoechstens} weitere`;
}

/**
 * Eine Zeile Klartext fuer eine Filterkarte, z. B. „IT" · in Köln ·
 * Reservedienst. Es stehen nur die gewaehlten Werte selbst darin (die Namen
 * kommen vom Server, s. `optionen`) - keine selbst formulierte Erklaerung
 * eines Bundeswehr-Begriffs.
 */
export function beschreibeFilter(filter: Suchprofil): string {
  const teile: string[] = [];
  const begriff = filter.suchbegriff?.trim();
  if (begriff) teile.push(`„${begriff}“`);
  const ort = filter.wunschort?.trim();
  if (ort) teile.push(`in ${ort}`);
  if (filter.bundesland?.length) teile.push(aufzaehlung(filter.bundesland));
  const taetigkeit = filter.taetigkeitsbereich ? TAETIGKEITSBEREICH_TEXT[filter.taetigkeitsbereich] : undefined;
  if (taetigkeit) teile.push(taetigkeit);
  if (filter.vertragsarten?.length) teile.push(aufzaehlung(filter.vertragsarten));
  const umfang = filter.beschaeftigungsumfang ? UMFANG_TEXT[filter.beschaeftigungsumfang] : undefined;
  if (umfang) teile.push(umfang);
  if (filter.organisationsbereich?.length) teile.push(aufzaehlung(filter.organisationsbereich));
  if (filter.laufbahngruppe?.length) teile.push(aufzaehlung(filter.laufbahngruppe));
  if (filter.einstiegswege?.length) {
    teile.push(aufzaehlung(filter.einstiegswege.map((weg) => EINSTIEGSWEG_LABELS[weg] ?? weg)));
  }
  if (filter.seiteneinstieg === true) teile.push('Seiteneinstieg laut Ausschreibungstext');
  if (filter.mindestbesoldung !== undefined) {
    teile.push(
      filter.besoldungstabelle
        ? `ab ${filter.besoldungstabelle} ${filter.mindestbesoldung}`
        : `ab Besoldungsstufe ${filter.mindestbesoldung}`
    );
  }
  return teile.length > 0 ? teile.join(' · ') : 'Alle Stellen, ohne Einschränkung';
}

export interface Erklaerung {
  begriff: string;
  bedeutung: string;
}

/**
 * Die Bedeutungstexte zu den gewaehlten Laufbahngruppen und Einstiegswegen -
 * ausschliesslich aus den Server-Optionen. Wo der Server keinen Text hat,
 * erscheint nichts (lieber keine Erklaerung als eine erfundene).
 */
export function filterErklaerungen(filter: Suchprofil, optionen: Suchoptionen): Erklaerung[] {
  const laufbahnen = (filter.laufbahngruppe ?? []).map((wert) => ({
    begriff: wert,
    bedeutung: optionen.laufbahngruppeBedeutung[wert] ?? ''
  }));
  const wege = (filter.einstiegswege ?? []).map((wert) => ({
    begriff: EINSTIEGSWEG_LABELS[wert] ?? wert,
    bedeutung: optionen.einstiegswegBedeutung[wert] ?? ''
  }));
  return [...laufbahnen, ...wege].filter((e) => e.bedeutung.trim() !== '');
}

/**
 * Stabiler Schluessel fuer den Cache der Trefferzahl: Schluessel sortiert,
 * leere Werte weg. Aendert sich der Filter, aendert sich der Schluessel.
 */
export function filterKennung(filter: Suchprofil): string {
  const eintraege = Object.entries(filter)
    .filter(([, wert]) => wert !== undefined && wert !== '' && !(Array.isArray(wert) && wert.length === 0))
    .map(([feld, wert]) => [feld, Array.isArray(wert) ? wert.toSorted() : wert] as const)
    .toSorted(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(eintraege);
}

export function trefferText(treffer: SuchfilterTreffer): string {
  const zahl = treffer.anzahl.toLocaleString('de-DE');
  if (treffer.mindestens) return `Mindestens ${zahl} passende Stellen sind gerade offen.`;
  if (treffer.anzahl === 0) return 'Gerade ist keine passende Stelle offen.';
  if (treffer.anzahl === 1) return 'Eine passende Stelle ist gerade offen.';
  return `${zahl} passende Stellen sind gerade offen.`;
}
