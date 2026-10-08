/**
 * Welche Art Datei ein Anhang der Ausschreibung ist - am Anhangsnamen erkannt.
 *
 * WOZU: Ohne diese Unterscheidung steht "Anlage 1 zum Bewerbungsbogen"
 * gleichrangig neben einer Infobroschuere unter "Pruefe, ob eine davon
 * mitgeschickt werden muss". Anlage 1 ist die Erklaerung zur
 * Verfassungstreue (Bw-2053, fuenf Seiten, Ort/Datum/Unterschrift) - ohne sie
 * ist die Bewerbung unvollstaendig. Eine Personalerin im Karrierecenter
 * erkennt den Unterschied auf einen Blick, ein Bewerber nicht.
 *
 * Die Regeln sind eng (Beispiele in anhangArt.test.ts): was nicht sicher einzuordnen ist, bleibt "unbekannt" und damit in der
 * neutralen Pruefliste. Falsch als Information einsortiert hiesse: der
 * Bewerber laesst einen Pflichtvordruck weg.
 *
 * WIR FUELLEN DIESE VORDRUCKE NIE AUS: Anlage 1 fragt nach Mitgliedschaften in
 * Parteien und Vereinigungen und nach Verbindungen in Staaten der
 * Staatenliste - Art.-9-nahe Angaben, die weder erfragt noch eingesetzt werden.
 * Die Klassifizierung sieht nur den oeffentlichen Anhangsnamen.
 */
import { detectTemplateFamily } from "../mcp/lib/identifyBewerbungsbogen";

export type AnhangArt = "ausfuellen" | "beiblatt" | "information" | "bewerbungsbogen" | "unbekannt";

/** Vordrucke, die der Bewerber selbst ausfuellt und unterschreibt. Vor den Informationsmustern geprueft. */
const AUSFUELLEN = [
  /Anlage\s*\d*\s*zum\s+(Bewerbungs|Karriere)bogen/i,
  /Erkl(ä|ae)rung/i, // auch "Einverständniserklärung"
  /Einverst(ä|ae)ndnis/i,
  /Fragebogen/i,
  /Antwortbogen/i,
  // "Informationsblatt Datenschutz" der Reserve - endet mit Ort, Datum, Unterschrift.
  /Datenschutzblatt/i,
  /Leistungsdaten/i,
  /Noten(ü|ue)bersicht/i,
];

/** Nachschlagewerk zu einem Vordruck ("Beiblatt Staatenliste" zu Anlage 1) - nicht auszufuellen. */
const BEIBLATT = /Beiblatt/i;

const INFORMATION = [
  /Factsheet/i,
  /Brosch(ü|ue)re/i,
  /Flyer/i,
  /Bez(ü|ue)ge/i,
  /^Info\b/i,
  /Merkblatt/i,
  /Stellenbeschreibung/i,
  /F(ö|oe)rderliche/i,
  /Die Zukunft im Blick/i,
  /zweite Karriere/i,
  // "Anlage 1 OA-Führungskraft ...": Anlage zur AUSSCHREIBUNG, eine Liste der Verwendungen.
  /^Anlage\s*\d*\s*OA-/i,
  // "2026_Fw_V1.1_Anlage", "Truppenversorgungsbearbeiter Anlage": Stellenbeschreibungen.
  /[\s_]Anlage$/i,
];

/**
 * Die Erklaerung zur Verfassungstreue (Bw-2053) unter ihren drei echten Namen:
 * "Anlage 1 zum Bewerbungsbogen", "Anlage 1 Erklärung politische Parteien u.a.",
 * "Erklärung über Mitgliedschaft_Erklärung Treuepflicht" (alle drei dieselbe
 * Datei). Gehoert immer zur Bewerbung, und ihre Fragen gehoeren nicht
 * in einen Chat.
 */
const VERFASSUNGSTREUE = [
  /Anlage\s*\d*\s*zum\s+(Bewerbungs|Karriere)bogen/i,
  /politisch/i,
  /Mitgliedschaft/i,
  /Treuepflicht/i,
  /Verfassungstreue/i,
];

export function istVerfassungstreueErklaerung(attHeader: string): boolean {
  return VERFASSUNGSTREUE.some((muster) => muster.test(attHeader));
}

export function anhangArt(attHeader: string): AnhangArt {
  const titel = attHeader.trim();
  if (detectTemplateFamily(titel)) return "bewerbungsbogen";
  if (AUSFUELLEN.some((muster) => muster.test(titel))) return "ausfuellen";
  if (BEIBLATT.test(titel)) return "beiblatt";
  if (INFORMATION.some((muster) => muster.test(titel))) return "information";
  return "unbekannt";
}

/** Ein Anhang der Ausschreibung, wie ihn Merkzettel und Werkzeuge kennen. */
export interface AusschreibungsAnhang {
  docId: string;
  attHeader: string;
  /** Link auf unsere Kopie - kann fehlen, dann ohne Link. */
  downloadUrl?: string;
}

export interface AufgeteilteAnhaenge<T extends AusschreibungsAnhang> {
  /** Vom Bewerber auszufuellen und zu unterschreiben - gehoert zur Bewerbung. */
  ausfuellen: T[];
  /** Nachschlagewerk zu den Vordrucken oben, nur wenn es welche gibt. */
  beiblaetter: T[];
  information: T[];
  /** Nicht sicher einzuordnen oder ein nicht ausgefuellter Bewerbungsbogen: der Bewerber prueft selbst. */
  pruefen: T[];
}

export function teileAnhaengeAuf<T extends AusschreibungsAnhang>(anhaenge: T[]): AufgeteilteAnhaenge<T> {
  const teile: AufgeteilteAnhaenge<T> = { ausfuellen: [], beiblaetter: [], information: [], pruefen: [] };
  for (const anhang of anhaenge) {
    const art = anhangArt(anhang.attHeader);
    if (art === "ausfuellen") teile.ausfuellen.push(anhang);
    else if (art === "beiblatt") teile.beiblaetter.push(anhang);
    else if (art === "information") teile.information.push(anhang);
    else teile.pruefen.push(anhang);
  }
  // Ein Beiblatt ohne Vordruck, zu dem es gehoert, ist nur noch Lesestoff.
  if (teile.ausfuellen.length === 0) {
    teile.information.unshift(...teile.beiblaetter);
    teile.beiblaetter = [];
  }
  return teile;
}
