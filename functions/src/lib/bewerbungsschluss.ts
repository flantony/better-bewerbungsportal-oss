/**
 * Was ein leerer Bewerbungsschluss bedeutet - die EINE Stelle, die das
 * entscheidet, fuer den Merkzettel im Paket, `get_job` und die Mappe.
 *
 * WOZU: Viele Stellen tragen kein `applicationEnd`, und die meisten davon
 * schreiben im Text "Bewerbung und Einstellung jederzeit moeglich" -
 * der leere Wert ist dort keine Luecke, sondern die Aussage "keine Frist". Ohne
 * diese Deutung stuende im Paket "in der Ausschreibung nicht angegeben", und ein
 * MCP-Client bekaeme einen nackten leeren String.
 *
 * Bewusst eng, weil ein falscher Treffer "kein Bewerbungsschluss" behauptet und
 * den Bewerber eine echte Frist verpassen laesst: "jederzeit"/"laufend" zaehlt
 * nur, wo es die BEWERBUNG SELBST als moeglich beschreibt ("Bewerbung ...
 * jederzeit moeglich", "jederzeit bewerben", "Bewerbungsfrist: laufend",
 * "Bewerbungen werden laufend entgegengenommen"). Nicht: "steht Ihnen jederzeit
 * zur Verfuegung", "jederzeit zurueckziehen", "jederzeit willkommen", und nie
 * mit Verneinung davor. "Die Einstellung erfolgt ganzjaehrig" sagt
 * etwas ueber den Dienstantritt, nicht ueber eine Frist.
 */

const FREIGABE_SAETZE = [
  // "Bewerbung und Einstellung jederzeit möglich", "Eine Bewerbung ist jederzeit möglich"
  /\bbewerbung\w*(?:\s+\S+){0,3}?\s+(?:jederzeit|laufend|fortlaufend)\s+möglich/i,
  // "Sie können sich jederzeit bewerben", "laufend zu bewerben"
  /\b(?:jederzeit|laufend|fortlaufend)\s+(?:zu\s+)?bewerben\b/i,
  // "Bewerbungsfrist: laufend", "Bewerbungsschluss: jederzeit"
  /\bbewerbungs(?:frist|schluss|zeitraum)\s*:?\s*(?:jederzeit|laufend|fortlaufend)\b/i,
  // "Bewerbungen werden laufend entgegengenommen"
  /\bbewerbungen\s+werden\s+(?:jederzeit|laufend|fortlaufend)\s+(?:entgegengenommen|angenommen)/i,
];
const VERNEINT = /\b(?:nicht|kein\w*)\s+(?:jederzeit|laufend|fortlaufend)\b/i;

/**
 * Zerlegt den Volltext in Saetze. Listenpunkte, Zeilenumbrueche und Absaetze
 * sind Satzgrenzen: nach dem blossen Entfernen der Tags verschmoelzen
 * "<li>Bewerbung per Post</li><li>Rueckfragen jederzeit</li>" zu einem Satz.
 */
function saetze(texte: string[]): string[] {
  return texte
    .join("\n")
    .replace(/<\/(?:li|p|div|h\d|tr|td)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/[\n.!?;]+/)
    .map((satz) => satz.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Sagt der Ausschreibungstext, dass man sich jederzeit bewerben kann? Nimmt die Volltextfelder roh (mit HTML). */
export function bewerbungJederzeitLautText(texte: string[]): boolean {
  return saetze(texte).some((satz) => !VERNEINT.test(satz) && FREIGABE_SAETZE.some((muster) => muster.test(satz)));
}

/**
 * Die eine Stelle, die festlegt, WELCHE Felder gelesen werden - fuer get_job,
 * die Mappe und das Kontopaket. `contactDesc` bewusst nicht: dort stehen die
 * Kontaktsaetze ("steht Ihnen jederzeit gern zur Verfuegung"), die Hauptquelle
 * falscher Treffer, und die Extraktion liest ihn aus demselben Grund nicht mit.
 * Mit Datum gibt es nichts zu deuten.
 */
export function bewerbungJederzeitFuerJob(job: {
  applicationEnd?: string;
  companyDesc?: string;
  jobDesc?: string;
  requireDesc?: string;
  remarcDesc?: string;
}): boolean {
  if (job.applicationEnd) return false;
  return bewerbungJederzeitLautText([job.companyDesc ?? "", job.jobDesc ?? "", job.requireDesc ?? "", job.remarcDesc ?? ""]);
}

/**
 * Der Bewerbungsschluss einer Stelle in Worten - die EINE Formulierung fuer
 * jede Stelle, die ihn anzeigt: Merkzettel im Paket, Bewerbungsplan der
 * Paketseite, KI-Seite. Ohne sie stuende derselbe leere Wert dreimal
 * verschieden da ("keiner", "in der Ausschreibung nicht angegeben", "keine
 * Angabe"). Die Web-Stellenseite liest Firestore selbst und spiegelt diesen
 * Helfer (web/src/features/jobs/lib/bewerbungsschluss.ts).
 */
export function bewerbungsschlussText(bewerbungsschluss: string, jederzeit: boolean): string {
  if (bewerbungsschluss) return bewerbungsschluss;
  return jederzeit
    ? "keiner, Bewerbung jederzeit möglich"
    : "nicht genannt, im Zweifel bei der Karriereberatung nachfragen";
}

/** Die Zeile fuer den Merkzettel im Paket. */
export function bewerbungsschlussZeile(bewerbungsschluss: string, jederzeit: boolean): string {
  return `Bewerbungsschluss: ${bewerbungsschlussText(bewerbungsschluss, jederzeit)}`;
}
