import { ANGABEN_FELDER, type Angaben, type AngabenAnfrage } from '../api/types';

export interface AngabenAnfrageEingabe {
  /** Zuletzt vom Server geladener Stand. */
  alt: Angaben;
  /** Aktuelle Werte aus dem Formular (alle zwoelf Felder, leer = "" statt undefined). */
  formular: Angaben;
  /** `null`, solange (noch) keine gueltige Einwilligung vorliegt. */
  staatsangehoerigkeitEingewilligtAm: string | null;
  /** Ob der Einwilligungshaken in DIESER Sitzung gesetzt wurde (nie vorbelegt). */
  neueEinwilligung: boolean;
  textVersion: string;
}

/**
 * Baut die Anfrage fuer `kontoAngabenSpeichern` aus Formularwerten: nur
 * GEAENDERTE Felder werden gesendet, unveraendert gebliebene bleiben ganz weg.
 * Ein auf leer geaendertes Feld wird als "" gesendet - das
 * ist das ausdrueckliche Entfernen-Signal des Servers (s.
 * functions/src/konto/angaben.ts, naechsterAngabenStand).
 *
 * `einwilligung` kommt nur dann mit, wenn ALLE drei zutreffen: der Haken
 * wurde gerade erst gesetzt, es liegt noch KEINE bestehende Einwilligung vor,
 * und `staatsangehoerigkeit` bekommt dabei tatsaechlich einen neuen,
 * nicht-leeren Wert - eine reine Loeschung braucht keine Einwilligung, und
 * ohne eine Aenderung des Feldes gibt es nichts, wofuer eingewilligt werden
 * muesste.
 */
export function baueAngabenAnfrage({
  alt,
  formular,
  staatsangehoerigkeitEingewilligtAm,
  neueEinwilligung,
  textVersion
}: AngabenAnfrageEingabe): AngabenAnfrage {
  const anfrage: AngabenAnfrage = {};
  for (const feld of ANGABEN_FELDER) {
    const altWert = alt[feld] ?? '';
    const neuerWert = formular[feld] ?? '';
    if (altWert === neuerWert) continue;
    anfrage[feld] = neuerWert;
  }

  // Sicherheitsnetz: ein neuer, nicht-leerer Wert darf
  // NIE ohne gueltige Einwilligung hinausgehen - weder eine bestehende noch
  // eine neue. Das greift z.B., wenn das Formularfeld nach einem Widerruf
  // (der die gespeicherte Angabe UND die Einwilligung sofort loescht) noch
  // seinen alten Anzeigewert traegt, weil der Formularzustand selbst nicht
  // automatisch mit dem Server-Stand nachzieht: ohne dieses Netz wuerde ein
  // spaeteres Speichern eines VOELLIG anderen Feldes die laengst widerrufene
  // Staatsangehoerigkeit erneut mitschicken und am 400 des Servers scheitern.
  // Der Server lehnt das ohnehin ab - dieses Netz verhindert nur, dass der
  // Versuch ueberhaupt erst unternommen wird.
  if (anfrage.staatsangehoerigkeit) {
    const neueGueltigeEinwilligung = neueEinwilligung && !staatsangehoerigkeitEingewilligtAm;
    if (neueGueltigeEinwilligung) {
      anfrage.einwilligung = { textVersion };
    } else if (!staatsangehoerigkeitEingewilligtAm) {
      delete anfrage.staatsangehoerigkeit;
    }
  }

  return anfrage;
}

/** Alle zwoelf Angaben-Felder als leere Strings - der Formularzustand nach "Alle Angaben löschen". */
export function leereAngaben(): Angaben {
  return Object.fromEntries(ANGABEN_FELDER.map((feld) => [feld, ''])) as Angaben;
}
