/**
 * Zerlegt einen Stellentitel in suchbare Tokens.
 *
 * WOZU: Firestore kann keine Teilstring-Suche. Ohne Index muesste jeder
 * `list_jobs`-Aufruf ALLE aktiven Stellen laden und in JavaScript filtern. Mit
 * einem vorberechneten Token-Array laesst sich `array-contains` nutzen, und
 * Firestore liefert nur die Treffer.
 *
 * Deutsche Komposita sind der Knackpunkt: wer "Software" sucht, will
 * "Softwareentwickler" finden, wer "Fahrer" sucht, "Kraftfahrer". Deshalb
 * werden neben dem ganzen Wort auch Praefixe ab 4 Zeichen abgelegt, ab dem
 * Wortanfang und ab der Fuge zu einem bekannten Grundwort - das verschiebt
 * Aufwand vom Lesen (jede Anfrage) ins Schreiben (einmal beim Sync).
 *
 * SPIEGEL: web/src/features/jobs/lib/titel-suche.ts wendet dieselbe Regel in
 * der Stellenliste an (eigenes Paket, darum kein gemeinsamer Import).
 * Aenderungen an Grundwoertern, Endungen oder Grenzen immer an beiden Stellen.
 */

/** Ab dieser Laenge werden Wortpraefixe als eigene Tokens gespeichert. */
const MIN_PRAEFIX = 4;
/** Obergrenze pro Titel - schuetzt die Dokumentgroesse bei sehr langen Titeln. */
const MAX_TOKENS = 200;

/**
 * Trennt an allem, was kein Buchstabe/Ziffer ist. Bindestriche und Schraegstriche
 * trennen dadurch ebenfalls, was gewollt ist: "IT-System-Elektroniker" wird zu
 * "it", "system", "elektroniker" - so findet die Suche nach "IT" diese Stelle,
 * ohne dass "IT" mitten in einem Wort (z.B. "Arbeitszeit") treffen kann.
 */
function woerter(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((wort) => wort.length > 0);
}

/** Nicht bedeutungstragende Wortbestandteile aus Stellentiteln. */
const STOPP = new Set(["m", "w", "d", "und", "oder", "der", "die", "das", "in", "im", "fuer", "für", "als", "bzw", "zur", "zum", "von", "mit", "bei", "ab"]);

// ─── Grundwoerter deutscher Komposita ─────────────────────────────────────

/**
 * DIE ANDERE HAELFTE DES KOMPOSITUMS. Praefixe decken nur die Faelle, in denen
 * das gesuchte Wort VORNE steht ("Software" -> "Softwareentwickler"). Deutsch
 * haengt das Grundwort aber hinten an, und genau das ist das Wort, mit dem ein
 * Bewerber ankommt: er sagt "Fahrer", die Ausschreibung heisst "Kraftfahrer".
 * Ohne Grundwoerter findet "Fahrer" keine einzige Kraftfahrer-Stelle.
 *
 * WARUM EINE LISTE und keine beliebigen Wortenden: alle Wortenden von 5 bis
 * 12 Zeichen abzulegen macht aus "Transport" ein "sport", aus
 * "Sachbearbeiter" einen "arbeiter", aus "Unteroffizier" einen "offizier" und
 * aus "Wilhelmshaven" ein "haven". Ein Wortende ist nur dann ein Grundwort,
 * wenn es eines IST - und das laesst sich nicht ausrechnen, nur aufschreiben.
 *
 * `nichtNach`: Bestimmungswort-Enden, nach denen das Wortende KEIN Grundwort
 * ist. "unter|offizier" ist eine eigene Laufbahn, "be|arbeiter" und
 * "mit|arbeiter" sind keine Arbeiter.
 *
 * Bewusst NICHT aufgenommen: "sport" (traefe praktisch nur "Transport"),
 * "dienst", "kraft", "wirt", "mann" - zu allgemein, sie braechten
 * mehr falsche als richtige Treffer.
 */
interface Grundwort {
  wort: string;
  nichtNach?: string[];
}

const GRUNDWOERTER: Grundwort[] = [
  // Militaerische Laufbahnen und Verwendungen
  { wort: "offizier", nichtNach: ["unter"] },
  { wort: "unteroffizier" },
  { wort: "feldwebel" },
  { wort: "soldat" },
  { wort: "pionier" },
  { wort: "jäger" },
  { wort: "grenadier" },
  { wort: "panzer" },
  { wort: "pilot" },
  { wort: "taucher" },
  { wort: "feuerwehr" },
  // Technik und Handwerk
  { wort: "techniker" },
  { wort: "technik" },
  { wort: "mechaniker" },
  { wort: "mechanik" },
  { wort: "mechatroniker" },
  { wort: "elektroniker" },
  { wort: "elektronik" },
  { wort: "elektriker" },
  { wort: "ingenieur" },
  { wort: "informatiker" },
  { wort: "informatik" },
  { wort: "installateur" },
  { wort: "schlosser" },
  { wort: "tischler" },
  { wort: "technologe" },
  { wort: "technologin" },
  { wort: "laborant" },
  { wort: "fahrzeug" },
  { wort: "fahrer" },
  // Sanitaet und Pflege
  { wort: "sanitäter" },
  { wort: "pfleger" },
  { wort: "pflege" },
  { wort: "arzt" },
  { wort: "ärztin" },
  { wort: "chirurgie" },
  { wort: "medizin" },
  { wort: "radiologie" },
  // Verwaltung, Versorgung, Dienstleistung
  { wort: "verwaltung" },
  { wort: "logistik" },
  { wort: "management" },
  { wort: "sachbearbeiter" },
  { wort: "buchhalter" },
  { wort: "assistent" },
  { wort: "fachkraft" },
  { wort: "servicekraft" },
  { wort: "pflegekraft" },
  { wort: "arbeiter", nichtNach: ["be", "mit"] },
  { wort: "helfer" },
  { wort: "bediener" },
  { wort: "leiter", nichtNach: ["beg"] },
  { wort: "leitung" },
  { wort: "meister" },
  { wort: "lehrer" },
  { wort: "musiker" },
  { wort: "gärtner" },
  { wort: "koch" },
  { wort: "köchin" },
];

/** Beugungsendungen hinter dem Grundwort: Kraftfahrer-in, Spezialpionier-e. Laengste zuerst. */
const ENDUNGEN = ["innen", "in", "en", "e", "n", ""];

/** Kuerzer ist kein Bestimmungswort, sondern Zufall. */
const MIN_BESTIMMUNGSWORT = 3;

/**
 * Die Wortreste ab einer bekannten Kompositionsfuge: "kraftfahrerin" ->
 * ["fahrerin"]. Ab dort gilt dasselbe wie am Wortanfang.
 */
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

/**
 * Das Wort selbst und seine Anfaenge ab `MIN_PRAEFIX` - damit eine Suche nach
 * "software" auf "softwareentwickler" greift, ohne das ganze Wort zu kennen.
 * Kuerzere Suchbegriffe ("IT") muessen ein ganzes Wort sein.
 */
function wortanfaenge(wort: string, tokens: Set<string>): void {
  tokens.add(wort);
  for (let laenge = MIN_PRAEFIX; laenge < wort.length; laenge++) {
    tokens.add(wort.slice(0, laenge));
  }
}

/**
 * Die Regel, die `list_jobs` beschreibt: ein Suchbegriff trifft ein Titelwort,
 * wenn das Wort mit ihm ANFAENGT - am Wortanfang oder an der Fuge zu einem
 * bekannten Grundwort ("Fahrer" -> "Kraftfahrer"). Nie mitten im Wort: "IT"
 * trifft nicht "Arbeitszeit", "Sport" nicht "Transport".
 */
export function buildSuchTokens(title: string): string[] {
  const tokens = new Set<string>();

  for (const wort of woerter(title)) {
    if (STOPP.has(wort)) continue;
    wortanfaenge(wort, tokens);
    for (const rest of grundwortReste(wort)) wortanfaenge(rest, tokens);
  }

  return [...tokens].slice(0, MAX_TOKENS);
}

/**
 * Tokens fuer den Ort, nach demselben Muster wie `buildSuchTokens`.
 *
 * WARUM ueberhaupt: ein Teilstring-Nachfilter in JavaScript waere still
 * falsch. Die Query holt hoechstens `MAX_FETCH` Dokumente, gefiltert wuerde
 * erst danach: eine Suche nach "Köln" faende so nur einen Teil der Stellen,
 * ohne dass irgendetwas auf die fehlenden hinwiese. Als Tokens im Index
 * wandert der Ort in die Query, und das Problem entsteht gar nicht.
 *
 * Die Zerlegung an Bindestrichen bleibt dabei erhalten: "Köln-Wahn" wird zu
 * "köln" und "wahn", beide Eingaben treffen also. Praefixe ab 4 Zeichen decken
 * zusaetzlich Teileingaben ab ("münch" -> "München").
 *
 * KEINE Grundwoerter: Ortsnamen sind keine Berufskomposita. Beliebige
 * Wortenden liessen "haven" Wilhelmshaven und Bremerhaven treffen.
 */
export function buildOrtTokens(besOrt: string): string[] {
  const tokens = new Set<string>();
  for (const wort of woerter(besOrt)) {
    if (STOPP.has(wort)) continue;
    wortanfaenge(wort, tokens);
  }
  return [...tokens].slice(0, MAX_TOKENS);
}

/** Wie `planSuche`, aber fuer den Ort. */
export function planOrt(wunschort: string): { queryToken: string | null; restTokens: string[] } {
  return planSuche(wunschort);
}

/**
 * Uebersetzt eine Nutzer-Suchanfrage in die Tokens, gegen die gefiltert wird.
 *
 * Firestore erlaubt nur EIN `array-contains` pro Query. Bei mehreren Begriffen
 * wird deshalb der laengste (= trennschaerfste) in die Query gegeben und der
 * Rest muss nachgefiltert werden - der Aufrufer bekommt beides zurueck.
 */
export function planSuche(suchbegriff: string): { queryToken: string | null; restTokens: string[] } {
  const begriffe = woerter(suchbegriff)
    .filter((wort) => !STOPP.has(wort))
    .map((wort) => wort.slice(0, 40));

  if (begriffe.length === 0) return { queryToken: null, restTokens: [] };

  const sortiert = [...begriffe].sort((a, b) => b.length - a.length);
  return { queryToken: sortiert[0], restTokens: sortiert.slice(1) };
}

/** Nachfilter fuer die Begriffe, die nicht in die Query gepasst haben. */
export function matchesRestTokens(tokens: string[], restTokens: string[]): boolean {
  if (restTokens.length === 0) return true;
  const vorhanden = new Set(tokens);
  return restTokens.every((token) => vorhanden.has(token));
}

export interface Titelwort {
  wort: string;
  /** In wie vielen Titeln es vorkommt - nicht, wie oft insgesamt. */
  anzahl: number;
}

/**
 * Die haeufigsten ganzen Woerter aus einer Menge von Stellentiteln.
 *
 * WOZU: Bei einer Suche ohne Treffer ist "nichts gefunden" die unbrauchbarste
 * aller Auskuenfte. Woerter wie "Roentgen", "Kampfjet", "Reparatur" oder
 * "Akten" kommen in keinem Titel vor - da hilft keine Tokenisierung. Was
 * hilft, ist das echte Vokabular: die anfragende KI
 * kann "Roentgen" selbst zu "Radiologie" uebersetzen, sobald sie sieht, dass
 * es dieses Wort bei uns gibt. Uebersetzen kann sie, raten nicht.
 *
 * GANZE WOERTER, keine Praefix-/Grundwort-Bruchstuecke aus `buildSuchTokens`: das
 * Ergebnis geht an ein Modell, das daraus ablesen soll, wie die Bundeswehr eine
 * Taetigkeit NENNT. "zinische" beantwortet diese Frage nicht.
 */
export function haeufigeTitelwoerter(titel: string[], anzahl = 12, ausschluss: string[] = []): Titelwort[] {
  // Woerter, nach denen ohnehin gefiltert wurde, sagen nichts: sie stehen in
  // jedem Titel des Ausschnitts und fuehrten die Liste an - richtig und
  // vollkommen nutzlos.
  const raus = new Set(ausschluss.flatMap((wert) => woerter(wert)));
  const zaehler = new Map<string, number>();
  for (const eintrag of titel) {
    // Je Titel nur einmal zaehlen: "Koch und Köchin ... Koch" ist EINE Stelle,
    // sonst gewichtet eine Doppelnennung im Titel staerker als eine zweite Stelle.
    for (const wort of new Set(woerter(eintrag))) {
      if (STOPP.has(wort) || wort.length < 3 || raus.has(wort)) continue;
      // Jahreszahlen: "2027" steht in fast jedem Ausbildungstitel und ist kein
      // Wort, das jemand als Berufsbezeichnung suchen wuerde.
      if (/^\d+$/.test(wort)) continue;
      zaehler.set(wort, (zaehler.get(wort) ?? 0) + 1);
    }
  }
  return [...zaehler.entries()]
    .map(([wort, anzahl]) => ({ wort, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl || a.wort.localeCompare(b.wort))
    .slice(0, anzahl);
}
