/**
 * Dienstgrad -> Besoldungsgruppe (Bundesbesoldungsordnung A, Anlage I BBesG).
 *
 * Quelle: https://www.gesetze-im-internet.de/bbesg/anlage_i.html (amtlich,
 * oeffentlich). Nur die Soldaten-Dienstgrade, keine zivilen Amtsbezeichnungen.
 *
 * WARUM eine Spanne statt eines Wertes: die Zuordnung ist im Gesetz selbst
 * mehrdeutig. "Hauptmann"/"Kapitaenleutnant" stehen sowohl in A 11 als auch in
 * A 12, "Oberstleutnant"/"Fregattenkapitaen" in A 14 und A 15. Welche Gruppe
 * gilt, haengt am konkreten Dienstposten - aus der Ausschreibung allein ist das
 * nicht zu entscheiden. Deshalb geben wir immer `von`/`bis` zurueck und nie
 * einen einzelnen Wert, der eine Genauigkeit vortaeuschen wuerde, die es nicht
 * gibt.
 *
 * Wichtig: das ist eine ABGELEITETE Angabe, kein Feld der Ausschreibung.
 * Massgeblich bleiben die offiziellen Angaben der Bundeswehr.
 */

export type Laufbahngruppe = "Mannschaften" | "Unteroffiziere" | "Feldwebel" | "Offiziere";

export interface DienstgradEintrag {
  /** Kanonischer Dienstgrad, wie in Anlage I BBesG geschrieben. */
  dienstgrad: string;
  /** Niedrigste Besoldungsgruppe, in der der Dienstgrad gelistet ist. */
  von: number;
  /** Hoechste Besoldungsgruppe (gleich `von`, wenn eindeutig). */
  bis: number;
  laufbahngruppe: Laufbahngruppe;
}

/**
 * Zeilen aus Anlage I, zusammengefasst pro Dienstgrad. Mehrfachnennungen im
 * Gesetz (A 11 + A 12) werden hier zur Spanne verdichtet.
 */
export const DIENSTGRAD_BESOLDUNG: DienstgradEintrag[] = [
  // --- Mannschaften -------------------------------------------------------
  { dienstgrad: "Gefreiter", von: 3, bis: 3, laufbahngruppe: "Mannschaften" },
  { dienstgrad: "Matrose", von: 3, bis: 3, laufbahngruppe: "Mannschaften" },
  { dienstgrad: "Obergefreiter", von: 4, bis: 4, laufbahngruppe: "Mannschaften" },
  { dienstgrad: "Hauptgefreiter", von: 4, bis: 4, laufbahngruppe: "Mannschaften" },
  { dienstgrad: "Stabsgefreiter", von: 5, bis: 5, laufbahngruppe: "Mannschaften" },
  { dienstgrad: "Oberstabsgefreiter", von: 5, bis: 5, laufbahngruppe: "Mannschaften" },

  // --- Sammelbegriffe -----------------------------------------------------
  // Stehen so in den Ausschreibungen ("Mindestens im Dienstgrad eines
  // Unteroffizier mit Portepee") und meinen NICHT den Dienstgrad
  // "Unteroffizier": "mit Portepee" ist die Sammelbezeichnung fuer die
  // Feldwebel-Dienstgrade (A7 aufwaerts), "ohne Portepee" fuer Unteroffizier
  // und Stabsunteroffizier. Ohne diese beiden Eintraege wird ein
  // Feldwebel-Dienstposten als A5 ausgewiesen - zwei Gruppen zu niedrig.
  // Stehen vor "Unteroffizier", damit die laengere Phrase zuerst greift.
  { dienstgrad: "Unteroffizier mit Portepee", von: 7, bis: 9, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Unteroffiziere mit Portepee", von: 7, bis: 9, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Unteroffizier ohne Portepee", von: 5, bis: 6, laufbahngruppe: "Unteroffiziere" },
  { dienstgrad: "Unteroffiziere ohne Portepee", von: 5, bis: 6, laufbahngruppe: "Unteroffiziere" },

  // --- Unteroffiziere -----------------------------------------------------
  { dienstgrad: "Unteroffizier", von: 5, bis: 5, laufbahngruppe: "Unteroffiziere" },
  { dienstgrad: "Maat", von: 5, bis: 5, laufbahngruppe: "Unteroffiziere" },
  { dienstgrad: "Fahnenjunker", von: 5, bis: 5, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Seekadett", von: 5, bis: 5, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Stabsunteroffizier", von: 6, bis: 6, laufbahngruppe: "Unteroffiziere" },
  { dienstgrad: "Obermaat", von: 6, bis: 6, laufbahngruppe: "Unteroffiziere" },
  { dienstgrad: "Korporal", von: 6, bis: 6, laufbahngruppe: "Unteroffiziere" },
  { dienstgrad: "Stabskorporal", von: 6, bis: 6, laufbahngruppe: "Unteroffiziere" },

  // --- Feldwebel ----------------------------------------------------------
  { dienstgrad: "Feldwebel", von: 7, bis: 7, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Bootsmann", von: 7, bis: 7, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Oberfeldwebel", von: 7, bis: 7, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Oberbootsmann", von: 7, bis: 7, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Fähnrich", von: 7, bis: 7, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Fähnrich zur See", von: 7, bis: 7, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Hauptfeldwebel", von: 8, bis: 8, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Hauptbootsmann", von: 8, bis: 8, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Oberfähnrich", von: 8, bis: 8, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberfähnrich zur See", von: 8, bis: 8, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Stabsfeldwebel", von: 9, bis: 9, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Stabsbootsmann", von: 9, bis: 9, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Oberstabsfeldwebel", von: 9, bis: 9, laufbahngruppe: "Feldwebel" },
  { dienstgrad: "Oberstabsbootsmann", von: 9, bis: 9, laufbahngruppe: "Feldwebel" },

  // --- Offiziere ----------------------------------------------------------
  { dienstgrad: "Leutnant", von: 9, bis: 9, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Leutnant zur See", von: 9, bis: 9, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberleutnant", von: 10, bis: 10, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberleutnant zur See", von: 10, bis: 10, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Seekapitän", von: 10, bis: 10, laufbahngruppe: "Offiziere" },
  // A 11 UND A 12 - s. Kopfkommentar.
  { dienstgrad: "Hauptmann", von: 11, bis: 12, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Kapitänleutnant", von: 11, bis: 12, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Stabshauptmann", von: 13, bis: 13, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Stabskapitänleutnant", von: 13, bis: 13, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Major", von: 13, bis: 13, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Korvettenkapitän", von: 13, bis: 13, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Stabsarzt", von: 13, bis: 13, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Stabsapotheker", von: 13, bis: 13, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Stabsveterinär", von: 13, bis: 13, laufbahngruppe: "Offiziere" },
  // A 14 UND A 15.
  { dienstgrad: "Oberstleutnant", von: 14, bis: 15, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Fregattenkapitän", von: 14, bis: 15, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberstabsarzt", von: 14, bis: 14, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberstabsapotheker", von: 14, bis: 14, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberstabsveterinär", von: 14, bis: 14, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberfeldarzt", von: 15, bis: 15, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Flottillenarzt", von: 15, bis: 15, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberfeldapotheker", von: 15, bis: 15, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Flottillenapotheker", von: 15, bis: 15, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberst", von: 16, bis: 16, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Kapitän zur See", von: 16, bis: 16, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberstarzt", von: 16, bis: 16, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Flottenarzt", von: 16, bis: 16, laufbahngruppe: "Offiziere" },
  { dienstgrad: "Oberstapotheker", von: 16, bis: 16, laufbahngruppe: "Offiziere" },
];

export interface BesoldungAbleitung {
  dienstgrade: string[];
  /** Niedrigste gefundene Besoldungsgruppe (Zahl, z.B. 11 fuer A 11). */
  von: number;
  bis: number;
  /** Anzeigeform, z.B. "A11" oder "A11-A12". */
  label: string;
  laufbahngruppen: Laufbahngruppe[];
}

/**
 * Laengster Dienstgrad zuerst, damit "Oberleutnant zur See" nicht als
 * "Leutnant" und "Oberstabsfeldwebel" nicht als "Feldwebel" durchgeht.
 */
const NACH_LAENGE_SORTIERT = [...DIENSTGRAD_BESOLDUNG].sort(
  (a, b) => b.dienstgrad.length - a.dienstgrad.length,
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sucht Dienstgrade im Text und leitet die Besoldungsspanne ab.
 *
 * Bewusst konservativ: gematcht wird nur an Wortgrenzen und in der maennlichen
 * Grundform, die in Ausschreibungstiteln durchgaengig vorkommt ("Offizierin /
 * Offizier ...", "Hauptmann (m/w/d)"). Gibt `null` zurueck, wenn nichts sicher
 * erkennbar ist - lieber keine Angabe als eine falsche.
 */
export function deriveBesoldung(text: string): BesoldungAbleitung | null {
  if (!text) return null;

  const treffer: DienstgradEintrag[] = [];
  let rest = text;

  for (const eintrag of NACH_LAENGE_SORTIERT) {
    // Wortgrenze an BEIDEN Enden. Ein nur vorne verankertes Muster liest
    // "Idar-Oberstein" als Dienstgrad "Oberst" und "Bootsmannschaft" als
    // "Bootsmann". Anders als bei der
    // Stichwortsuche ist das hier richtig: Dienstgrade stehen in Titeln als
    // eigenes Wort, nicht als Bestandteil eines Kompositums. Der Preis ist,
    // dass Wortbildungen wie "Oberfaehnrichmodell" nicht erkannt werden -
    // eine fehlende Angabe ist deutlich harmloser als eine falsche.
    const pattern = new RegExp(`\\b${escapeRegExp(eintrag.dienstgrad)}\\b`, "i");
    if (!pattern.test(rest)) continue;
    treffer.push(eintrag);
    // Treffer entfernen, damit ein laengerer Dienstgrad den kuerzeren, in ihm
    // enthaltenen nicht ebenfalls ausloest ("Oberstleutnant" -> "Leutnant").
    rest = rest.replace(new RegExp(`\\b${escapeRegExp(eintrag.dienstgrad)}\\b`, "gi"), " ");
  }

  if (treffer.length === 0) return null;

  const von = Math.min(...treffer.map((t) => t.von));
  const bis = Math.max(...treffer.map((t) => t.bis));

  return {
    dienstgrade: treffer.map((t) => t.dienstgrad),
    von,
    bis,
    label: von === bis ? `A${von}` : `A${von}-A${bis}`,
    laufbahngruppen: [...new Set(treffer.map((t) => t.laufbahngruppe))],
  };
}
