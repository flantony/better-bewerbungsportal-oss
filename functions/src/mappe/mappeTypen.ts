/**
 * Typen und Konstanten für die Bewerbungsmappe.
 */

export const MAPPEN_COLLECTION = "bewerbungsmappen";

/**
 * Die Reihenfolge bestimmt die Nummerierung im ZIP.
 * Wird auch für die Sortierung in paketVerzeichnis verwendet.
 *
 * Keine "ausweiskopie": wir nehmen keine Ausweiskopien entgegen
 * (s. `ausweiskopie.ts`).
 */
export const DOKUMENT_ARTEN = ["anschreiben", "lebenslauf", "zeugnis", "formular", "sonstiges"] as const;

export type DokumentArt = (typeof DOKUMENT_ARTEN)[number];

/**
 * Sprechende Bezeichnung je Art - die einzige Benennung, die ein Dokument nach
 * aussen tragen darf, wo der Dateiname des Bewerbers nicht hingehoert (s.
 * `mappeSicht.bezeichneFuerClient`). Zugleich der Namensstamm im ZIP (s.
 * `paketVerzeichnis`), damit der Bewerber im Paket dieselben Woerter
 * wiederfindet, die ihm sein KI-Tool genannt hat.
 */
export const ART_LABEL: Record<DokumentArt, string> = {
  anschreiben: "Anschreiben",
  lebenslauf: "Lebenslauf",
  zeugnis: "Zeugnis",
  formular: "Bewerbungsbogen",
  sonstiges: "Unterlage",
};

/**
 * Wie `ART_LABEL`, aber fuer gelesene Datensaetze: eine Art, die
 * `DOKUMENT_ARTEN` nicht kennt, heisst neutral "Unterlage" statt "undefined".
 */
export function artLabel(art: string): string {
  return (ART_LABEL as Record<string, string | undefined>)[art] ?? ART_LABEL.sonstiges;
}

export interface MappenDokument {
  docId: string;
  art: DokumentArt;
  dateiname: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  herkunft: "upload" | "client" | "formular";
  hinzugefuegtAm: number;
  /**
   * Nur bei Text aus fuege_dokument_hinzu, nur wenn vorhanden: die
   * Platzhalter in eckigen Klammern, die noch im Text standen
   * ("[Telefon]") - fuer den Merkzettel beim Paketbau. Ausschliesslich die
   * NAMEN, nie Text oder Werte; ohne Ziffern und "@", hoechstens zehn (s.
   * `zuMerkendePlatzhalter`, DSFA.md "Transiente Bewerbungsmappe").
   */
  platzhalter?: string[];
  /**
   * Nur bei `herkunft: "formular"`: die `docId` der
   * oeffentlichen Vorlage aus `jobDocuments`, aus der das Formular entstand.
   * Daran erkennt ein zweiter `fuelle_formular`-Aufruf das Formular, das er
   * ersetzt. Eine oeffentliche Kennung, keine Bewerberangabe.
   */
  vorlageDocId?: string;
}

export interface Formularstand {
  gefuellt: number;
  fehlendeAngaben: string[];
}

/**
 * Schnappschuss der drei Angaben der AUSSCHREIBUNG, die die Mappe nach dem
 * Eroeffnen noch braucht - beim Eroeffnen einmal berechnet, danach von hier
 * gelesen.
 *
 * WOZU: `mappe_status` ist der Aufruf, den ein Client am oeftesten wiederholt,
 * weil er ihn wiederholen MUSS: der Upload laeuft im Browser des Bewerbers,
 * nicht durch das Gespraech, also ist Pollen der vorgesehene Weg - oft dutzende
 * Male je Mappe. Jedes Mal ueber `get_document_requirements` neu ermittelt,
 * kostete das 4 Firestore-Reads je Aufruf, von denen genau einer ueberhaupt
 * neue Information tragen kann (der Mappen-Datensatz selbst).
 *
 * DER TAUSCH, ausdruecklich: der Schnappschuss kann veralten. Aendert der
 * naechtliche Sync die Ausschreibung, waehrend die Mappe offen ist, arbeitet die
 * Mappe mit der alten Unterlagenliste weiter. Bei einer Stunde Lebensdauer ist
 * das Risiko klein - der Sync laeuft nachts, die Mappe lebt eine Stunde -, aber
 * es ist echt, nicht wegargumentiert. Was dabei schlimmstenfalls passiert: der
 * Merkzettel im Paket nennt eine Unterlage, die inzwischen nicht mehr verlangt
 * ist, oder eine neu verlangte fehlt darin. Die Alternative waere, bei jedem Pollen
 * alle Reads zu bezahlen, um in der Stunde nach dem Eroeffnen eine Aenderung zu bemerken, die
 * es fast nie gibt.
 *
 * DSGVO: ausschliesslich oeffentliche Ausschreibungsdaten - dieselben Werte, die
 * `get_document_requirements` jedem anonymen Aufrufer herausgibt und die in der
 * oeffentlich lesbaren `jobs`-Collection stehen. Keine Bewerberangabe kommt
 * hierdurch zusaetzlich nach Firestore; das bleibt die harte Grenze.
 */
export interface MappenAnforderungen {
  /** Vom Ausschreibungstext geforderte Unterlagen (KI-extrahiert), s. `getDocumentRequirements`. */
  geforderteUnterlagen: string[];
  /** Freitext der Ausschreibung zu den Unterlagen - landet im Merkzettel des Pakets. */
  unterlagenHinweise: string;
  /** `applicationEnd` der Ausschreibung, fuer den Merkzettel im Paket. */
  bewerbungsschluss: string;
  /**
   * Die drei folgenden dienen dem Merkzettel (s.
   * mappe/merkzettel.ts): alle Anhaenge der Ausschreibung (Name und docId,
   * oeffentlich), ihre Laufbahngruppe in den Worten des Vordrucks und ob ihr
   * Text die Bewerbung jederzeit zulaesst. Optional - fehlen sie, laedt
   * `anforderungenFuerPaket` einmal nach.
   */
  /**
   * `downloadUrl` (oeffentlicher Link auf unsere Kopie): der
   * Merkzettel verlinkt damit die Vordrucke, die der Bewerber selbst ausfuellt
   * (s. mappe/anhangArt.ts). Kann fehlen - dann ohne Link.
   */
  anhaenge?: { docId: string; attHeader: string; downloadUrl?: string }[];
  laufbahngruppen?: string[];
  bewerbungJederzeit?: boolean;
}

export interface MappeRecord {
  pinstGuid: string;
  refCode: string;
  titel: string;
  erstelltAm: number;
  letzteAktivitaetAm: number;
  /**
   * Stichzeit (zipGebautAm ?? letzteAktivitaetAm) plus MAPPE_FRIST_MS - die
   * eigentliche Datenschutz-Zusage, direkt im Datensatz statt nur errechnet.
   * Muss bei JEDEM Schreibvorgang, der letzteAktivitaetAm setzt, mitgezogen
   * werden (s. mappe/ablauf.ts, aktivitaetsFelder). Grund: sortierte der
   * Aufraeumlauf nach dem Stellvertreter letzteAktivitaetAm allein, koennte
   * unter Last eine faellige, aber zuletzt noch angefasste Mappe hinter das
   * Abfragelimit rutschen - "eine Stunde" ist eine Zusage, kein Richtwert.
   */
  verfaelltAm: number;
  zipGebautAm: number | null;
  heruntergeladenAm: number | null;
  einmalToken: string | null;
  dokumente: MappenDokument[];
  formularstand: Record<string, Formularstand>;
  /**
   * Optional. Wer sie liest, geht ueber `anforderungenFuerMappe` und bekommt
   * dort den Nachladeweg, falls sie fehlen.
   */
  anforderungen?: MappenAnforderungen;
}

export function mappenBestand(mappe: { dokumente: MappenDokument[] }): { anzahl: number; summeBytes: number } {
  return {
    anzahl: mappe.dokumente.length,
    summeBytes: mappe.dokumente.reduce((sum, doc) => sum + doc.sizeBytes, 0),
  };
}

/** Alle Dateien einer Mappe unter einem Prefix, damit die Loeschung sie in einem Zug erwischt. */
export function mappenPrefix(mappenId: string): string {
  return `${MAPPEN_COLLECTION}/${mappenId}/`;
}
