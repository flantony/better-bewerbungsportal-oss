/**
 * Bundeswehr-/oeD-Jargon aus der `glossary`-Collection.
 *
 * Die Begriffe liegen in Firestore; das Web zeigt sie als Tooltip. Ueber MCP
 * sind sie hier erreichbar, damit ein KI-Client "Portepee" oder
 * "Verwendungsreihe" nicht aus dem eigenen Wissen erklaeren oder raten muss.
 *
 * Zwei Zugaenge: die vollstaendige Liste als Resource (einmal lesen,
 * dann im Kontext haben) und ein Nachschlage-Tool fuer einzelne Begriffe (fuer
 * Clients ohne Resource-Unterstuetzung und fuer den Fall, dass die Liste zu
 * gross zum Mitschleppen ist).
 */
import { getFirestore } from "firebase-admin/firestore";
import type { GlossaryTerm } from "../../types";
import { mitHinweis } from "./hinweis";

const GLOSSARY_COLLECTION = "glossary";

/**
 * Von Hand korrigierte Definitionen, nach Slug. Ueberschreiben den Bestand
 * beim Lesen (und beim naechsten Erzeugungslauf beim Schreiben) -
 * aus demselben Grund wie LAIENBEGRIFFE unten im Code statt in den Daten:
 * der Lauf schreibt mit `batch.set()` ohne Merge.
 *
 * feldwebel: die erzeugte Definition lautet "ein militaerischer Dienstgrad der
 * Unteroffizierslaufbahn". Der militaerische Bewerbungsbogen hat aber getrennte Kaestchen fuer Unteroffiziere und
 * Feldwebel - wer dem Glossar folgt, kreuzt das falsche an.
 */
export const GLOSSAR_KORREKTUREN: Record<string, Pick<GlossaryTerm, "definition">> = {
  feldwebel: {
    definition:
      "Eigene Laufbahngruppe der Feldwebel (Unteroffiziere mit Portepee) und zugleich ihr erster Dienstgrad, mit " +
      "Führungs- und Fachaufgaben. Auf dem Bewerbungsbogen ein eigenes Kästchen, getrennt von den Unteroffizieren.",
  },
};

export function mitKorrekturen(begriffe: GlossaryTerm[]): GlossaryTerm[] {
  return begriffe.map((eintrag) => {
    const korrektur = GLOSSAR_KORREKTUREN[eintrag.slug];
    return korrektur ? { ...eintrag, ...korrektur } : eintrag;
  });
}

export async function ladeGlossar(): Promise<GlossaryTerm[]> {
  const snapshot = await getFirestore().collection(GLOSSARY_COLLECTION).get();
  return mitKorrekturen(snapshot.docs.map((doc) => doc.data() as GlossaryTerm)).sort((a, b) =>
    a.term.localeCompare(b.term, "de"),
  );
}

export async function glossarMarkdown(): Promise<string> {
  const begriffe = await ladeGlossar();
  const zeilen = begriffe
    .map((eintrag) => {
      const auch = eintrag.aliases?.length ? ` _(auch: ${eintrag.aliases.join(", ")})_` : "";
      return `**${eintrag.term}**${auch}\n${eintrag.definition}`;
    })
    .join("\n\n");

  return mitHinweis(
    `# Glossar: Bundeswehr- und Behördensprache

${begriffe.length} Begriffe, die in den Ausschreibungen vorkommen und außerhalb
der Bundeswehr kaum jemand kennt. Wer eine Ausschreibung für einen Bewerber
zusammenfasst, sollte diese Wörter erklären statt sie zu übernehmen.

${zeilen}`,
    ["Erzeugt aus den Texten der Bundeswehr-Ausschreibungen selbst (Stand: laufend aktualisiert)."],
  );
}

/**
 * Einzelnachschlag. Trifft ueber den Anzeigenamen, den Slug und die
 * Schreibvarianten - ein Modell schreibt "SanFw" oder "Sanitaetsfeldwebel", je
 * nachdem, was im Ausschreibungstext stand.
 */
/**
 * Woerter, die BEWERBER benutzen, auf die Eintraege, unter denen die Bundeswehr
 * dasselbe fuehrt.
 *
 * WARUM HIER UND NICHT IN DEN DATEN: das Glossar wird per Skript aus den
 * Ausschreibungstexten erzeugt und mit `batch.set()` ohne Merge geschrieben -
 * ein von Hand ergaenzter Alias waere nach dem naechsten Lauf weg.
 * Vor allem aber KANN der Begriff dort nicht entstehen: "Zeitsoldat" steht in
 * keiner Ausschreibung, die Bundeswehr schreibt "Soldatin / Soldat auf Zeit".
 * Das ist genau die Luecke - das Amt und der Bewerber benutzen verschiedene
 * Woerter, und das erzeugte Glossar kennt nur die des Amtes.
 *
 * Die Liste bleibt kurz und handgepflegt. Jeder Eintrag ist ein belegter
 * Nutzerbegriff, keine Vermutung; steht das Ziel nicht im Bestand, faellt der
 * Verweis folgenlos aus.
 */
const LAIENBEGRIFFE: Record<string, string> = {
  zeitsoldat: "soldat-auf-zeit",
  zeitsoldatin: "soldat-auf-zeit",
  reservist: "reservedienst",
  reservistin: "reservedienst",
};

export function findeBegriff(begriffe: GlossaryTerm[], suche: string): GlossaryTerm | null {
  const normalisiert = suche.trim().toLowerCase();
  if (!normalisiert) return null;

  const passt = (wert: string) => wert.trim().toLowerCase() === normalisiert;
  const treffer =
    begriffe.find((eintrag) => passt(eintrag.term) || passt(eintrag.slug)) ??
    begriffe.find((eintrag) => (eintrag.aliases ?? []).some(passt));
  if (treffer) return treffer;

  // Erst die echten Eintraege, dann die Laienbegriffe: ein Wort, das die
  // Bundeswehr selbst fuehrt, darf nie von unserer Uebersetzung verdeckt werden.
  const ueberLaienbegriff = LAIENBEGRIFFE[normalisiert];
  if (ueberLaienbegriff) {
    const ziel = begriffe.find((eintrag) => eintrag.slug === ueberLaienbegriff);
    if (ziel) return ziel;
  }

  // Teiltreffer als zweite Chance: "Portepee" soll "Unteroffizier mit Portepee"
  // finden, ohne dass der Aufrufer die vollstaendige Phrase kennt.
  return (
    begriffe.find(
      (eintrag) =>
        eintrag.term.toLowerCase().includes(normalisiert) ||
        (eintrag.aliases ?? []).some((alias) => alias.toLowerCase().includes(normalisiert)),
    ) ?? null
  );
}

/**
 * Vorschlaege, wenn nichts passt - besser als eine blosse Fehlmeldung.
 *
 * ZWEI WEGE: Der Wortanfang allein liesse "Zeitsoldat" leer ausgehen, weil
 * kein Eintrag mit "Zei" beginnt - obwohl "Soldat auf Zeit" im Bestand steht. Deutsche Komposita stellen die Woerter
 * um, der gemeinsame Bestandteil bleibt aber. Deshalb zaehlt auch ein Wort von
 * mindestens vier Buchstaben, das in beiden vorkommt; kuerzere ("auf", "der")
 * wuerden auf alles passen und den Vorschlag wertlos machen.
 *
 * KEINE WORTGRENZE, anders als in `matchesSuchbegriff` - und das ist Absicht.
 * Dort darf ein Begriff ins Wort hineinlaufen,
 * muss aber an einer Wortgrenze beginnen ("Software" findet
 * "Softwareentwickler"). Deutsche Komposita haengen das Grundwort jedoch HINTEN
 * an: in "Truppensoldat" beginnt "Soldat" mitten im Wort. Eine Wortgrenze zu
 * verlangen wuerde genau die Faelle ausschliessen, fuer die dieser zweite Weg
 * da ist. Der Preis ist ein gelegentlicher schiefer Vorschlag - vertretbar,
 * weil hier nur VORSCHLAEGE entstehen, kein Treffer: `findeBegriff` bleibt
 * streng, und eine Liste mit einem unpassenden Eintrag ist immer noch besser
 * als eine Sackgasse. Die Mindestlaenge von
 * vier Zeichen haelt die Zufallstreffer klein.
 */
export function aehnlicheBegriffe(begriffe: GlossaryTerm[], suche: string, anzahl = 5): string[] {
  const gesucht = suche.trim().toLowerCase();
  if (!gesucht) return [];
  const anfang = gesucht.slice(0, 3);

  const woerter = (wert: string) => wert.toLowerCase().split(/[^a-zäöüß]+/).filter((teil) => teil.length >= 4);
  const teileGesucht = woerter(gesucht);

  return begriffe
    .filter((eintrag) => {
      const term = eintrag.term.toLowerCase();
      if (term.startsWith(anfang)) return true;
      // Komposita in beide Richtungen: "Truppensoldat" enthaelt "Soldat", und
      // umgekehrt enthaelt "Soldat auf Zeit" das gesuchte "Soldat".
      return woerter(eintrag.term).some((teil) => gesucht.includes(teil)) || teileGesucht.some((teil) => term.includes(teil));
    })
    .slice(0, anzahl)
    .map((eintrag) => eintrag.term);
}
