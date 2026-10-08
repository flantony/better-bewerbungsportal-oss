/**
 * Was ein einzelner Filter wegwirft - als Zahl statt als Schweigen.
 *
 * Ein Filter kann genau die Kategorie vollstaendig ausschliessen, nach der
 * gefragt wird: Reserveoffizier-Stellen tragen als `contractTypeLabel` "" oder
 * "unbefristet", nie "Soldatin / Soldat auf Zeit". Wer `taetigkeitsbereich:
 * "militaerisch"` mit dieser Vertragsart kombiniert, bekommt keine einzige davon
 * - und ohne Hinweis schliesst die anfragende KI daraus, es gebe keine.
 *
 * Kontraintuitiv ist es obendrein: "Reserveoffizier" klingt nach Wehrdienst und
 * damit nach Zeitsoldat, aber ein Dienst ausserhalb des Wehrdienstes ist eben
 * kein Zeitsoldatenverhaeltnis. Ein Modell, das von "militaerisch" auf "Soldat
 * auf Zeit" schliesst, macht genau diesen Schritt.
 *
 * DIE KLASSE ist nicht "Reserveoffizier", sondern: ein Filter wirft Stellen weg,
 * und die Antwort verschweigt, dass sie weggeworfen wurden. Im Bestand ist das
 * der Normalfall: rund die Haelfte der militaerischen Stellen traegt GAR KEINE
 * Vertragsart, und jeder `vertragsarten`-Filter verliert sie, ohne dass sie
 * inhaltlich ausgeschlossen waeren; viele Stellen haben ausserdem keinen
 * `organisationsbereich`, kein Bundesland oder keine hinterlegte Besoldung.
 *
 * DER WEG: nicht Filter verbieten und nicht raten, was gemeint war, sondern die
 * Auslassung sichtbar machen. Dieses Modul liefert je gesetztem Filter die Zahl
 * der Stellen, die alle uebrigen Filter erfuellen und allein an diesem einen
 * scheitern - und darunter die, die zu dem Merkmal ueberhaupt keinen Wert
 * tragen. Das Urteil bleibt bei der anfragenden KI; sie bekommt nur die
 * Tatsache, die ihr sonst fehlt.
 *
 * KOSTEN: alle gedeckten Filter sind
 * Gleichheits- oder Bereichsfilter IN der Firestore-Query (s. queryJobs). "Im
 * Speicher gratis mitzaehlen" gibt es fuer sie nicht - die weggeworfenen
 * Dokumente kommen nie an. Der Weg ist deshalb die Zaehlaggregation: Firestore
 * rechnet die nach gelesenen Index-Eintraegen ab, ein Read je angefangene 1.000,
 * NICHT nach Dokumenten. Ein Aufruf mit zwei gesetzten Facetten kostet damit
 * rund sechs zusaetzliche Reads, gegenueber ~51 Dokumentlesevorgaengen fuer die
 * Trefferseite selbst. Drei Sparmassnahmen halten das klein:
 *  - die Basiszahl kommt aus `totalCount` der Hauptabfrage, wo die dasselbe
 *    zaehlt - dann kostet sie nichts;
 *  - die Leerwert-Zaehlung laeuft erst in einer zweiten Runde und nur fuer
 *    Filter, die ueberhaupt etwas ausgeschlossen haben;
 *  - alle Zaehlungen laufen parallel und starten, BEVOR die Hauptabfrage fertig
 *    ist (daher das Promise als Parameter) - sie kosten deshalb keine
 *    zusaetzliche Wartezeit.
 */
import { buildQuery, type JobQueryFilter, type JobQueryResult } from "./queryJobs";

/** Argumente, deren Ausschluss gezaehlt wird. */
type GedecktesArg =
  | "taetigkeitsbereich"
  | "organisationsbereich"
  | "bundesland"
  | "laufbahngruppe"
  | "vertragsarten"
  | "beschaeftigungsumfang"
  | "einstiegswege"
  | "suchbegriff"
  | "mindestbesoldung";

interface GedeckterFilter {
  arg: GedecktesArg;
  /** Argumente, die nur zusammen mit ihm Sinn haben und mit ihm wegfallen. */
  mitWeg?: (keyof JobQueryFilter)[];
  /**
   * Feldpfad und die Werte, die "zu diesem Merkmal steht nichts da" bedeuten.
   * Fehlt, wo ein leerer Wert eine echte Aussage ist.
   */
  leer?: { feld: string; werte: (string | null)[] };
}

/**
 * Die gedeckten Filter, mit dem Feld, auf dem die Datenluecke sichtbar wird.
 *
 * EINZELNE `==`-ZAEHLUNGEN je Leerwert, nicht eine `in`-Klausel: Firestore
 * ignoriert `null` in einer `in`-Liste. `contractTypeLabel in [null, ""]`
 * trifft nur die Dokumente mit "", keines mit `null` - wer hier `in` nimmt,
 * meldet die Luecke um Groessenordnungen zu klein.
 *
 * NICHT GEDECKT, mit Absicht:
 *  - `alter`: der einzige Filter, bei dem die Ursache gar nicht vorliegt.
 *    Stellen OHNE Altersangabe werden nie ausgeschlossen (s.
 *    queryJobs.passtZumAlter) - es gibt also keinen Leerwert-Topf zu melden, und
 *    ein Ausschluss wegen einer genannten Altersgrenze ist eine inhaltliche
 *    Aussage der Ausschreibung, kein Darstellungsartefakt. Die Grenzen stehen
 *    ausserdem in jeder Trefferzeile.
 *  - `seiteneinstieg`: aus demselben Grund - "unklar" bleibt drin.
 *  - `wunschort`: jede Stelle hat einen Ort, es gibt keinen Leerwert-Topf. Der
 *    Ausschluss ist genau das, wonach der Bewerber gefragt hat ("in Kiel"), und
 *    die Zahl waere auf jeder Ortssuche fast der ganze Bestand - Tapete, die die echten
 *    Meldungen entwertet. Die bekannte Falle des Filters (Region statt Stadt)
 *    endet in einer LEEREN Liste, und die traegt schon einen Hinweis.
 *  - `limit`, `sortierung`, `cursor`: grenzen nicht ein.
 */
const GEDECKT: GedeckterFilter[] = [
  { arg: "taetigkeitsbereich", leer: { feld: "api.ReqIndustry", werte: [null] } },
  { arg: "organisationsbereich", leer: { feld: "organisationsbereich", werte: ["", null] } },
  { arg: "bundesland", leer: { feld: "api.Region", werte: ["", null] } },
  { arg: "laufbahngruppe", leer: { feld: "laufbahngruppe", werte: ["", null] } },
  { arg: "vertragsarten", leer: { feld: "contractTypeLabel", werte: ["", null] } },
  { arg: "beschaeftigungsumfang", leer: { feld: "vollzeit", werte: [null] } },
  { arg: "mindestbesoldung", mitWeg: ["besoldungstabelle"], leer: { feld: "besoldung", werte: [null] } },
  // Ein leerer `einstiegsweg` heisst "kein besonderer Einstiegsweg", nicht "wir
  // wissen es nicht" - die allermeisten Stellen tragen ihn leer. Ein `ohneAngabe`
  // darauf waere formal richtig und inhaltlich eine Falschmeldung.
  { arg: "einstiegswege" },
  // Suchtokens liegen an jeder Stelle; es gibt keinen Leerwert-Topf. Gedeckt ist
  // der Filter trotzdem: er trifft nur den TITEL und nur am Wortanfang, und
  // genau daran scheitern Clients ("IT" findet
  // "Informationstechnik" nicht).
  { arg: "suchbegriff" },
];

export interface Ausschlusszaehlung {
  /** Name des Filterarguments, genau so wie im Aufruf. */
  filter: GedecktesArg;
  /** Stellen, die alle uebrigen Filter erfuellen und allein an diesem scheitern. */
  anzahl: number;
  /** Davon die, die zu diesem Merkmal ueberhaupt keinen Wert tragen. */
  ohneAngabe?: number;
}

export interface Ausschlussmessung {
  /** Absteigend: Filter mit Datenluecke zuerst, dann nach Menge. */
  je: Ausschlusszaehlung[];
  /**
   * Filter, die erst NACH der Abfrage im Speicher wirken und deshalb in `anzahl`
   * nicht stecken - die Zahlen koennen dadurch zu hoch sein. Leer im Normalfall.
   */
  nichtEingerechnet: string[];
}

function istGesetzt(wert: unknown): boolean {
  return Array.isArray(wert) ? wert.length > 0 : wert !== undefined;
}

/** Derselbe Filter ohne genau ein Argument (und ohne seine Anhaengsel). */
function ohne(filter: JobQueryFilter, gedeckt: GedeckterFilter): JobQueryFilter {
  const rest: JobQueryFilter = { ...filter };
  delete rest[gedeckt.arg];
  for (const weiteres of gedeckt.mitWeg ?? []) delete rest[weiteres];
  return rest;
}

async function zaehle(filter: JobQueryFilter, leerwert?: { feld: string; wert: string | null }): Promise<number> {
  const { query } = buildQuery(filter);
  const gestellt = leerwert ? query.where(leerwert.feld, "==", leerwert.wert) : query;
  return (await gestellt.count().get()).data().count;
}

/** Wie viele der ausgeschlossenen Stellen zu dem Merkmal gar nichts sagen. */
async function zaehleLeerwerte(filter: JobQueryFilter, gedeckt: GedeckterFilter): Promise<number> {
  if (!gedeckt.leer) return 0;
  const basis = ohne(filter, gedeckt);
  const zahlen = await Promise.all(
    gedeckt.leer.werte.map((wert) => zaehle(basis, { feld: gedeckt.leer!.feld, wert })),
  );
  return zahlen.reduce((summe, zahl) => summe + zahl, 0);
}

/**
 * `ergebnis` ist bewusst ein noch laufendes Promise: die Zaehlungen starten
 * sofort und laufen neben der Hauptabfrage, statt sie zu verlaengern.
 */
export async function zaehleAusschluesse(
  filter: JobQueryFilter,
  ergebnis: Promise<Pick<JobQueryResult, "totalCount" | "abgeschnitten">>,
): Promise<Ausschlussmessung | null> {
  const gesetzt = GEDECKT.filter((gedeckt) => istGesetzt(filter[gedeckt.arg]));
  if (gesetzt.length === 0) return null;

  try {
    const { nachfilter, restTokens, ortRestTokens } = buildQuery(filter);
    // Sobald eine Facette in den Nachfilter gerutscht ist, verschiebt das
    // Weglassen eines ANDEREN Filters die eine `in`-Klausel, die Firestore
    // erlaubt: "ohne X" haette dann MEHR Filter als die Basis, und die Differenz
    // waere Unsinn bis hin zu negativen Zahlen. Lieber keine Zahl als eine
    // falsche. Der Fall braucht zwei mehrwertige Facetten im selben Aufruf.
    if (nachfilter.length > 0) return null;

    const nichtEingerechnet = [
      ...(filter.alter !== undefined ? ["alter"] : []),
      ...(restTokens.length > 0 ? ["suchbegriff"] : []),
      ...(ortRestTokens.length > 0 ? ["wunschort"] : []),
    ];

    const [basis, ...ohneJe] = await Promise.all([
      // `totalCount` zaehlt dasselbe wie eine eigene Aggregation, SOLANGE kein
      // Filter im Speicher nachgefiltert hat - dann ist es kleiner, und jede
      // Differenz waere zu gross. In dem Fall lohnt der eine zusaetzliche Read.
      nichtEingerechnet.length === 0
        ? ergebnis.then(({ totalCount }) => totalCount)
        : zaehle(filter),
      ...gesetzt.map((gedeckt) => zaehle(ohne(filter, gedeckt))),
    ]);

    // Hat der Lesedeckel gegriffen, ist `totalCount` ohnehin unbrauchbar - und
    // die Antwort traegt schon den Hinweis, die Suche einzugrenzen.
    if ((await ergebnis).abgeschnitten) return null;

    const ausgeschlossen = gesetzt
      .map((gedeckt, i) => ({ gedeckt, anzahl: ohneJe[i] - basis }))
      .filter(({ anzahl }) => anzahl > 0);
    if (ausgeschlossen.length === 0) return null;

    const luecken = await Promise.all(
      ausgeschlossen.map(({ gedeckt }) => zaehleLeerwerte(filter, gedeckt)),
    );

    const je: Ausschlusszaehlung[] = ausgeschlossen
      .map(({ gedeckt, anzahl }, i) => ({
        filter: gedeckt.arg,
        anzahl,
        ...(luecken[i] > 0 ? { ohneAngabe: luecken[i] } : {}),
      }))
      // Die Datenluecke ist das eigentliche Signal - sie steht vorn, damit ein
      // Modell, das nur den Anfang liest, den handlungsfaehigen Eintrag sieht.
      .sort((a, b) => (b.ohneAngabe ?? 0) - (a.ohneAngabe ?? 0) || b.anzahl - a.anzahl);

    return { je, nichtEingerechnet };
  } catch (err) {
    // Ein Zusatz darf die Antwort nie kosten: faellt die Zaehlung aus (typisch:
    // fehlender zusammengesetzter Index), bleibt die Trefferliste, wie sie ist.
    // Geloggt werden nur Feldnamen, nie Werte.
    console.warn("zaehleAusschluesse: Zaehlung entfaellt", {
      grund: (err as Error).message,
      filter: Object.keys(filter).filter((name) => filter[name as keyof JobQueryFilter] !== undefined),
    });
    return null;
  }
}
