import type { AngabenSicht } from '@/features/konto/api/types';
import { ersetzePlatzhalter, findePlatzhalter, type PlatzhalterAngaben } from './platzhalter';

/**
 * Die Angaben, aus denen die Paketseite Platzhalter einsetzt: nur die
 * gespeicherten Angaben. Bleibt im Browser.
 *
 * Anders als beim Ausfuellen des Bewerbungsbogens (`fuellwerteAus`) gibt es fuer
 * die E-Mail KEINEN Rueckfall auf die Anmelde-Adresse: die Anmelde-Adresse
 * (oft eine dienstliche) gehoert nicht ungefragt ins Anschreiben. Ohne gespeicherte E-Mail bleibt
 * `[E-Mail]` stehen und wird als offener Platzhalter gemeldet.
 */
export function platzhalterAngabenAus(sicht: AngabenSicht | 'nicht-verfuegbar' | undefined): PlatzhalterAngaben {
  const angaben = sicht && sicht !== 'nicht-verfuegbar' ? sicht.angaben : {};
  const email = angaben.email || undefined;
  return {
    ...(angaben.vorname ? { vorname: angaben.vorname } : {}),
    ...(angaben.nachname ? { nachname: angaben.nachname } : {}),
    ...(angaben.geburtsdatum ? { geburtsdatum: angaben.geburtsdatum } : {}),
    ...(angaben.telefon ? { telefon: angaben.telefon } : {}),
    ...(email ? { email } : {}),
    ...(angaben.strasse ? { strasse: angaben.strasse } : {}),
    ...(angaben.plz ? { plz: angaben.plz } : {}),
    ...(angaben.ort ? { ort: angaben.ort } : {})
  };
}

interface Texte {
  anschreiben?: string;
  lebenslauf?: string;
}

/** Setzt beim Uebernehmen des Rueckgabeblocks die bekannten Platzhalter in beide Texte ein. */
export function uebernimmMitPlatzhaltern(
  texte: Texte,
  angaben: PlatzhalterAngaben
): Texte & { ersetzt: string[] } {
  const ergebnis: Texte & { ersetzt: string[] } = { ersetzt: [] };
  for (const schluessel of ['anschreiben', 'lebenslauf'] as const) {
    const text = texte[schluessel];
    if (text === undefined) continue;
    const ersetzung = ersetzePlatzhalter(text, angaben);
    ergebnis[schluessel] = ersetzung.text;
    for (const name of ersetzung.ersetzt) {
      if (!ergebnis.ersetzt.includes(name)) ergebnis.ersetzt.push(name);
    }
  }
  return ergebnis;
}

const ORT = { anschreiben: 'Im Anschreiben', lebenslauf: 'Im Lebenslauf' } as const;

/**
 * Satz zu den Platzhaltern, die noch in EINEM Text stehen - null, wenn keine.
 * Sagt, wonach zu suchen ist (eckige Klammern), weil "Platzhalter" allein
 * nicht verstanden wird.
 */
export function offenerPlatzhalterSatz(art: keyof typeof ORT, text: string): string | null {
  const offen = findePlatzhalter(text);
  if (offen.length === 0) return null;
  return `${ORT[art]} stehen noch Platzhalter in eckigen Klammern: ${offen.join(', ')}. Ersetze sie durch deinen eigenen Text, bevor du das Paket baust.`;
}

/** Je Text ein Satz zu den Platzhaltern, die noch drinstehen - leer, wenn keine. */
export function offenePlatzhalterSaetze(texte: { anschreiben: string; lebenslauf: string }): string[] {
  return (['anschreiben', 'lebenslauf'] as const).flatMap((art) => {
    const satz = offenerPlatzhalterSatz(art, texte[art]);
    return satz ? [satz] : [];
  });
}
