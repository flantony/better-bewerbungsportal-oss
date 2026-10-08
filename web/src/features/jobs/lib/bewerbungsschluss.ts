// Spiegel von functions/src/lib/bewerbungsschluss.ts (eigenes Paket, darum
// kein gemeinsamer Import) - dort steht die Begruendung, warum die Muster so
// eng sind. Die Stellenseite liest Firestore selbst und hat die Volltextfelder
// ohnehin; Paket, Paketseite und KI-Seite bekommen denselben Wortlaut vom
// Server. Aenderungen an Mustern oder Wortlaut immer an beiden Stellen.

const FREIGABE_SAETZE = [
  /\bbewerbung\w*(?:\s+\S+){0,3}?\s+(?:jederzeit|laufend|fortlaufend)\s+möglich/i,
  /\b(?:jederzeit|laufend|fortlaufend)\s+(?:zu\s+)?bewerben\b/i,
  /\bbewerbungs(?:frist|schluss|zeitraum)\s*:?\s*(?:jederzeit|laufend|fortlaufend)\b/i,
  /\bbewerbungen\s+werden\s+(?:jederzeit|laufend|fortlaufend)\s+(?:entgegengenommen|angenommen)/i
];
const VERNEINT = /\b(?:nicht|kein\w*)\s+(?:jederzeit|laufend|fortlaufend)\b/i;

function saetze(texte: string[]): string[] {
  return texte
    .join('\n')
    .replace(/<\/(?:li|p|div|h\d|tr|td)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/[\n.!?;]+/)
    .map((satz) => satz.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Sagt der Ausschreibungstext, dass man sich jederzeit bewerben kann? Nimmt die Volltextfelder roh (mit HTML). */
export function bewerbungJederzeitLautText(texte: string[]): boolean {
  return saetze(texte).some((satz) => !VERNEINT.test(satz) && FREIGABE_SAETZE.some((muster) => muster.test(satz)));
}

/** Der Bewerbungsschluss einer Stelle in Worten - `contactDesc` bewusst nicht gelesen (Kontaktsaetze). */
export function bewerbungsschlussFuerStelle(job: {
  applicationEnd: string;
  companyDesc: string;
  jobDesc: string;
  requireDesc: string;
  remarcDesc: string;
}): string {
  if (job.applicationEnd) return job.applicationEnd;
  return bewerbungJederzeitLautText([job.companyDesc, job.jobDesc, job.requireDesc, job.remarcDesc])
    ? 'keiner, Bewerbung jederzeit möglich'
    : 'nicht genannt, im Zweifel bei der Karriereberatung nachfragen';
}
