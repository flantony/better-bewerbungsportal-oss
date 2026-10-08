/**
 * Platzhalter in eckigen Klammern ("[Adresse]", "[Telefon]") in Texten, die
 * eine fremde KI geschrieben hat - finden und, wo die eigenen Angaben sie
 * kennen, einsetzen.
 *
 * WOZU: Eine fremde KI, die Adresse, Telefon und E-Mail nicht kennt, schreibt
 * sie als Platzhalter in den Briefkopf. Unbehandelt landen sie im
 * Anschreiben-PDF, obwohl das Konto alle Werte hat. Die KI-Seite
 * (kiSeite.ts) bittet deshalb um genau diese Namen; die Paketseite setzt sie im
 * Browser ein, Paket und Mappe nennen, was uebrig bleibt.
 *
 * WICHTIG: existiert absichtlich zweimal (hier und
 * web/src/features/bewerben/lib/platzhalter.ts) mit denselben Testfaellen -
 * Web und Functions sind getrennte Pakete, und das Einsetzen passiert im
 * Browser, mit den eigenen Angaben des Bewerbers.
 *
 * DSGVO: reine Textlogik. Werte und Texte werden hier weder geloggt noch
 * gespeichert; nach aussen gehen hoechstens die Platzhalter-Namen.
 */

/** Die Angaben, aus denen eingesetzt wird - Teilmenge von "Meine Angaben". `geburtsdatum` als ISO-Datum. */
export interface PlatzhalterAngaben {
  vorname?: string;
  nachname?: string;
  geburtsdatum?: string;
  telefon?: string;
  email?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
}

export interface PlatzhalterErsetzung {
  text: string;
  /** Eingesetzte Platzhalter, wie sie im Text standen, ohne Doppelte. */
  ersetzt: string[];
  /** Platzhalter, die stehen geblieben sind - unbekannt oder ohne gespeicherten Wert. */
  offen: string[];
}

const MAX_LAENGE = 40;

/**
 * Hoechstens 40 Zeichen ohne Zeilenumbruch und ohne innere Klammern, nicht
 * gefolgt von "(" (Markdown-Link). Was zaehlt, entscheidet `istPlatzhalter`.
 */
const KLAMMER = new RegExp(`\\[([^\\[\\]\\n]{1,${MAX_LAENGE}})\\](?!\\()`, "g");

/**
 * Mindestens zwei Buchstaben: "[1]" (Fussnote), "[x]"/"[ ]" (Haken), "[…]"
 * (Auslassung) sind keine Luecke. "[sic]" auch nicht.
 */
function istPlatzhalter(inhalt: string): boolean {
  const buchstaben = inhalt.match(/\p{L}/gu)?.length ?? 0;
  if (buchstaben < 2) return false;
  return !/^\s*sic!?\s*$/i.test(inhalt);
}

/** Alle Platzhalter im Text, wie sie dort stehen (mit Klammern), in Reihenfolge, ohne Doppelte. */
export function findePlatzhalter(text: string): string[] {
  const gefunden: string[] = [];
  for (const treffer of text.matchAll(KLAMMER)) {
    if (istPlatzhalter(treffer[1]) && !gefunden.includes(treffer[0])) gefunden.push(treffer[0]);
  }
  return gefunden;
}

function schluessel(inhalt: string): string {
  return inhalt.toLowerCase().replace(/ß/g, "ss").replace(/[^\p{L}\p{N}]/gu, "");
}

function wert(angabe: string | undefined): string | null {
  return angabe?.trim() || null;
}

function beide(a: string | undefined, b: string | undefined): string | null {
  const links = wert(a);
  const rechts = wert(b);
  return links && rechts ? `${links} ${rechts}` : null;
}

function datum(iso: string | undefined): string | null {
  const roh = wert(iso);
  if (!roh) return null;
  const teile = /^(\d{4})-(\d{2})-(\d{2})$/.exec(roh);
  return teile ? `${teile[3]}.${teile[2]}.${teile[1]}` : roh;
}

/** Normalisierter Platzhalter-Name -> Wert. Zusammengesetzte nur, wenn alle Teile da sind - kein halber Briefkopf. */
const QUELLE: Record<string, (angaben: PlatzhalterAngaben) => string | null> = {
  adresse: (a) => wert(a.strasse),
  strasse: (a) => wert(a.strasse),
  strasseundhausnummer: (a) => wert(a.strasse),
  strassehausnummer: (a) => wert(a.strasse),
  plzort: (a) => beide(a.plz, a.ort),
  plzundort: (a) => beide(a.plz, a.ort),
  postleitzahlundort: (a) => beide(a.plz, a.ort),
  plz: (a) => wert(a.plz),
  postleitzahl: (a) => wert(a.plz),
  ort: (a) => wert(a.ort),
  wohnort: (a) => wert(a.ort),
  telefon: (a) => wert(a.telefon),
  telefonnummer: (a) => wert(a.telefon),
  tel: (a) => wert(a.telefon),
  email: (a) => wert(a.email),
  emailadresse: (a) => wert(a.email),
  name: (a) => beide(a.vorname, a.nachname),
  vorundnachname: (a) => beide(a.vorname, a.nachname),
  vornamenachname: (a) => beide(a.vorname, a.nachname),
  vorname: (a) => wert(a.vorname),
  nachname: (a) => wert(a.nachname),
  geburtsdatum: (a) => datum(a.geburtsdatum),
};

/**
 * Mehrdeutig: "[Name]" und "[Ort]" koennen auch die Ansprechperson oder den
 * Dienstort meinen ("Sehr geehrte Frau [Name]", "Einsatzort: [Ort]").
 * Steht davor in derselben Zeile eine Anrede oder ein
 * solches Stichwort, bleibt der Platzhalter stehen - lieber ein offener
 * Platzhalter als der eigene Name in der Anrede.
 */
const MEHRDEUTIG = new Set(["name", "nachname", "vorname", "vorundnachname", "vornamenachname", "ort", "wohnort"]);
const FREMDER_BEZUG = /(?:\bFrau|\bHerrn?|\bDr\.)\s*$|ansprech|kontakt|z\.\s*hd|einsatz|dienst|standort|stelle/i;

function gehoertJemandAnderem(name: string, text: string, stelle: number): boolean {
  if (!MEHRDEUTIG.has(name)) return false;
  return FREMDER_BEZUG.test(text.slice(text.lastIndexOf("\n", stelle) + 1, stelle));
}

/** Setzt die bekannten Platzhalter ein, deren Wert gespeichert ist. Unbekannte und solche ohne Wert bleiben stehen. */
export function ersetzePlatzhalter(text: string, angaben: PlatzhalterAngaben): PlatzhalterErsetzung {
  const ersetzt: string[] = [];
  const offen: string[] = [];
  const neu = text.replace(KLAMMER, (ganz: string, inhalt: string, stelle: number) => {
    if (!istPlatzhalter(inhalt)) return ganz;
    const name = schluessel(inhalt);
    const bekannt = Object.hasOwn(QUELLE, name) && !gehoertJemandAnderem(name, text, stelle);
    const eingesetzt = bekannt ? QUELLE[name](angaben) : null;
    const liste = eingesetzt === null ? offen : ersetzt;
    if (!liste.includes(ganz)) liste.push(ganz);
    return eingesetzt ?? ganz;
  });
  return { text: neu, ersetzt, offen };
}
