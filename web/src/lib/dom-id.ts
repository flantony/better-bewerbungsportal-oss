const TRANSLITERATIONEN: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  Ä: 'ae',
  Ö: 'oe',
  Ü: 'ue'
};

/**
 * Macht aus einem beliebigen Anzeige- oder Feldwert eine gueltige HTML-`id`.
 * Checkbox-Werte aus Bundeswehr-Vorlagen enthalten Leerzeichen, Schraegstriche
 * und Kommas ("Sold./Zivil", "Heer, Marine, Luftwaffe") - als `id` bzw. Ziel
 * von `aria-labelledby`/`htmlFor` unbrauchbar. `index` wird immer angehaengt,
 * weil unterschiedliche Werte auf denselben Slug abbilden koennen (z.B. "A/B"
 * und "A B" werden beide zu "a-b") - der Aufrufer gibt dafuer die Position
 * des Werts innerhalb seiner Gruppe mit.
 */
export function slugifyId(wert: string, index: number): string {
  const ohneUmlaute = wert.replace(/[äöüßÄÖÜ]/g, (zeichen) => TRANSLITERATIONEN[zeichen] ?? zeichen);
  const slug = ohneUmlaute
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'wert'}-${index}`;
}
