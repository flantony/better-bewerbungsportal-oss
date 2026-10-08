// Spiegel von functions/src/lib/suchTokens.ts (eigenes Paket, darum kein
// gemeinsamer Import) - dort steht die Begruendung fuer Grundwoerter, Endungen
// und Grenzen. Die Stellenliste filtert im Browser, list_jobs per Firestore-
// Query auf den vorberechneten Tokens; beide muessen auf dieselbe Eingabe
// dieselben Stellen liefern. Aenderungen immer an beiden Stellen - der Test
// "Spiegel in der Weboberflaeche" in functions vergleicht Listen und Grenzen.
//
// Die Regel: ein Suchbegriff trifft ein Wort, wenn das Wort mit ihm ANFAENGT -
// am Wortanfang oder an der Fuge zu einem bekannten Grundwort ("Fahrer" ->
// "Kraftfahrer"). Nie mitten im Wort: "IT" trifft nicht "Arbeitszeit", "Sport"
// nicht "Transport".
//
// EINE bewusste Abweichung: list_jobs braucht fuer Begriffe unter vier Zeichen
// ein ganzes Wort, weil Firestore nur Wortanfaenge ab vier Zeichen als Tokens
// fuehrt. Die Liste hier filtert beim Tippen und hat die Titel lokal - "Kö"
// zeigt schon Köln, statt bis zum vierten Buchstaben leer zu bleiben. Mitten
// ins Wort trifft auch hier nichts.

const MIN_BESTIMMUNGSWORT = 3;
const MAX_BEGRIFF = 40;

const STOPP = new Set([
  'm',
  'w',
  'd',
  'und',
  'oder',
  'der',
  'die',
  'das',
  'in',
  'im',
  'fuer',
  'für',
  'als',
  'bzw',
  'zur',
  'zum',
  'von',
  'mit',
  'bei',
  'ab'
]);

interface Grundwort {
  wort: string;
  nichtNach?: string[];
}

const GRUNDWOERTER: Grundwort[] = [
  { wort: 'offizier', nichtNach: ['unter'] },
  { wort: 'unteroffizier' },
  { wort: 'feldwebel' },
  { wort: 'soldat' },
  { wort: 'pionier' },
  { wort: 'jäger' },
  { wort: 'grenadier' },
  { wort: 'panzer' },
  { wort: 'pilot' },
  { wort: 'taucher' },
  { wort: 'feuerwehr' },
  { wort: 'techniker' },
  { wort: 'technik' },
  { wort: 'mechaniker' },
  { wort: 'mechanik' },
  { wort: 'mechatroniker' },
  { wort: 'elektroniker' },
  { wort: 'elektronik' },
  { wort: 'elektriker' },
  { wort: 'ingenieur' },
  { wort: 'informatiker' },
  { wort: 'informatik' },
  { wort: 'installateur' },
  { wort: 'schlosser' },
  { wort: 'tischler' },
  { wort: 'technologe' },
  { wort: 'technologin' },
  { wort: 'laborant' },
  { wort: 'fahrzeug' },
  { wort: 'fahrer' },
  { wort: 'sanitäter' },
  { wort: 'pfleger' },
  { wort: 'pflege' },
  { wort: 'arzt' },
  { wort: 'ärztin' },
  { wort: 'chirurgie' },
  { wort: 'medizin' },
  { wort: 'radiologie' },
  { wort: 'verwaltung' },
  { wort: 'logistik' },
  { wort: 'management' },
  { wort: 'sachbearbeiter' },
  { wort: 'buchhalter' },
  { wort: 'assistent' },
  { wort: 'fachkraft' },
  { wort: 'servicekraft' },
  { wort: 'pflegekraft' },
  { wort: 'arbeiter', nichtNach: ['be', 'mit'] },
  { wort: 'helfer' },
  { wort: 'bediener' },
  { wort: 'leiter', nichtNach: ['beg'] },
  { wort: 'leitung' },
  { wort: 'meister' },
  { wort: 'lehrer' },
  { wort: 'musiker' },
  { wort: 'gärtner' },
  { wort: 'koch' },
  { wort: 'köchin' }
];

const ENDUNGEN = ['innen', 'in', 'en', 'e', 'n', ''];

function woerter(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((wort) => wort.length > 0);
}

function grundwortReste(wort: string): string[] {
  const reste: string[] = [];
  for (const { wort: grundwort, nichtNach } of GRUNDWOERTER) {
    for (const endung of ENDUNGEN) {
      const rest = grundwort + endung;
      if (!wort.endsWith(rest)) continue;
      const bestimmungswort = wort.slice(0, wort.length - rest.length);
      const echt =
        bestimmungswort.length >= MIN_BESTIMMUNGSWORT && !nichtNach?.some((ende) => bestimmungswort.endsWith(ende));
      if (echt) reste.push(rest);
      break;
    }
  }
  return reste;
}

/** Alle Stellen, an denen ein Suchbegriff anfangen darf: Wortanfaenge und Grundwort-Fugen. */
function suchanfaenge(text: string, mitGrundwoertern: boolean): string[] {
  const anfaenge: string[] = [];
  for (const wort of woerter(text)) {
    if (STOPP.has(wort)) continue;
    anfaenge.push(wort);
    if (mitGrundwoertern) anfaenge.push(...grundwortReste(wort));
  }
  return anfaenge;
}

/** Wie `planSuche` in functions, nur ohne die Query-Aufteilung: hier wird jeder Begriff gleich geprueft. */
function suchbegriffe(suche: string): string[] {
  return woerter(suche)
    .filter((wort) => !STOPP.has(wort))
    .map((wort) => wort.slice(0, MAX_BEGRIFF));
}

// Die Liste filtert bei jedem Tastendruck alle Stellen neu (je Facette noch
// einmal) - die Zerlegung eines Titels ist aber immer dieselbe.
const MAX_CACHE = 10_000;
const titelCache = new Map<string, string[]>();
const ortCache = new Map<string, string[]>();

function gecacht(cache: Map<string, string[]>, text: string, bauen: (text: string) => string[]): string[] {
  const vorhanden = cache.get(text);
  if (vorhanden) return vorhanden;
  if (cache.size >= MAX_CACHE) cache.clear();
  const anfaenge = bauen(text);
  cache.set(text, anfaenge);
  return anfaenge;
}

/**
 * Freitextsuche der Stellenliste ueber Titel und Ort, einmal je Eingabe
 * vorbereitet. Mehrere Begriffe sind UND-verknuepft; jeder darf im Titel oder
 * im Ort stehen ("Koch Köln"). Orte werden nicht an Grundwoertern zerlegt.
 */
export function kompiliereSuche(suche: string): (titel: string, ort: string | undefined) => boolean {
  const begriffe = suchbegriffe(suche);
  if (begriffe.length === 0) return () => true;
  return (titel, ort) => {
    const imTitel = gecacht(titelCache, titel, (text) => suchanfaenge(text, true));
    const imOrt = gecacht(ortCache, ort ?? '', (text) => suchanfaenge(text, false));
    return begriffe.every(
      (begriff) => imTitel.some((anfang) => anfang.startsWith(begriff)) || imOrt.some((anfang) => anfang.startsWith(begriff))
    );
  };
}
