/**
 * Rueckgabeblock-Parser (vorbereitet fuer den Chat-Link): eine fremde KI liefert Anschreiben und
 * Lebenslauf als Klartext, eingeleitet durch eine eigene Zeile
 * `=== BEWERBUNG:ANSCHREIBEN ===` bzw. `=== BEWERBUNG:LEBENSLAUF ===`,
 * beendet durch den naechsten Marker oder `=== ENDE ===`. Reine Textlogik,
 * kein Server-/LLM-Zugriff.
 *
 * WICHTIG: existiert absichtlich zweimal (hier und
 * functions/src/konto/rueckgabeblock.ts) mit denselben Testfaellen - der
 * Chat-Link-Kanal braucht die Funktion sowohl im Browser als auch
 * serverseitig, ohne dass der Browser ein Funktions-Bundle laedt.
 */
export interface RueckgabeblockErgebnis {
  anschreiben?: string;
  lebenslauf?: string;
  /**
   * Marker, die eine Rueckmeldung verdienen, aber nicht Teil des Ergebnisses
   * wurden: ein unbekannter Marker (Name unveraendert) oder ein doppelter
   * bekannter Abschnitt (`"<Marker> (doppelt)"` - der letzte Abschnitt
   * gewinnt, der Client soll aber erfahren, dass es zwei gab).
   */
  unbekannteAbschnitte: string[];
}

const MARKER_ZU_SCHLUESSEL: Record<string, 'anschreiben' | 'lebenslauf'> = {
  'BEWERBUNG:ANSCHREIBEN': 'anschreiben',
  'BEWERBUNG:LEBENSLAUF': 'lebenslauf'
};

const MARKER_REGEX = /^===\s*(.+?)\s*===$/;
const CODEZAUN_REGEX = /^```[a-zA-Z]*$/;

export function parseRueckgabeblock(text: string): RueckgabeblockErgebnis {
  const normalisiert = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const zeilen = normalisiert.split('\n').filter((zeile) => !CODEZAUN_REGEX.test(zeile.trim()));

  const inhaltJeMarker = new Map<string, string[]>();
  const hinweise: string[] = [];
  let aktuellerMarker: string | null = null;

  for (const rohzeile of zeilen) {
    const zeile = rohzeile.trim();
    const treffer = MARKER_REGEX.exec(zeile);
    if (treffer) {
      const marker = treffer[1];
      if (marker === 'ENDE') {
        aktuellerMarker = null;
      } else if (marker in MARKER_ZU_SCHLUESSEL) {
        if (inhaltJeMarker.has(marker)) hinweise.push(`${marker} (doppelt)`);
        inhaltJeMarker.set(marker, []);
        aktuellerMarker = marker;
      } else {
        hinweise.push(marker);
        aktuellerMarker = null; // Inhalt eines unbekannten Abschnitts wird nicht gesammelt.
      }
      continue;
    }
    if (aktuellerMarker) inhaltJeMarker.get(aktuellerMarker)!.push(zeile);
  }

  const ergebnis: RueckgabeblockErgebnis = { unbekannteAbschnitte: hinweise };
  for (const [marker, schluessel] of Object.entries(MARKER_ZU_SCHLUESSEL)) {
    const gesammelt = inhaltJeMarker.get(marker);
    if (!gesammelt) continue;
    let anfang = 0;
    let ende = gesammelt.length;
    while (anfang < ende && gesammelt[anfang] === '') anfang++;
    while (ende > anfang && gesammelt[ende - 1] === '') ende--;
    ergebnis[schluessel] = gesammelt.slice(anfang, ende).join('\n');
  }
  return ergebnis;
}
