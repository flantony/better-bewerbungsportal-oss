/**
 * Besoldungs-/Entgeltspanne einer Stelle. Fasst die Rohfelder
 * `tarifgruppe1`/`tarifgruppe2` zusammen, die Unter- und Obergrenze
 * derselben Angabe sind (s. functions/src/lib/besoldungsSpanne.ts).
 */
export interface Besoldung {
  von: string;
  bis: string;
  tabelle: 'A' | 'E';
  vonStufe: number;
  bisStufe: number;
  quelle: 'ausschreibung' | 'dienstgrad';
}

export interface Job {
  pinstGuid: string;
  title: string;
  besOrt: string;
  contractType: string;
  contractTypeLabel: string | null;
  applicationEnd: string;
  applicationEndSortKey: number;
  hotJob: boolean;
  /** 1=militärisch/2=zivil, siehe Wertehilfen_Taetigkeitsbereich. */
  reqIndustry: number;
  /** Job-Typ-Code (Herkunft: Bundeswehr-API `ReqType`) - Basis für die "Art der Stelle"-Facette, s. job-filters.ts. */
  reqType: string;
  /** Beschäftigungsgrad in Prozent als String, z.B. "100.00" (Vollzeit) oder "50.00". */
  arbeitszeit: string;
  /** `null`, wenn die Ausschreibung keine Besoldung angibt. */
  besoldung: Besoldung | null;
  /** String-Koordinaten wie von der API geliefert, leer wenn kein Standort hinterlegt. */
  latitude: string;
  longitude: string;
  /**
   * `false` = archiviert (Bewerbungsschluss vorbei oder zurueckgezogen).
   * Optional, weil `getAllActiveJobs` nur aktive Jobs liefert und
   * Test-Fixtures das Feld nicht setzen muessen; `getJobsByIds` (Merkliste) liefert
   * es immer, weil dort auch archivierte Stellen zurueckkommen.
   */
  active?: boolean;
}

/**
 * Anhang einer Ausschreibung, gelesen aus der dedupliziert gepflegten
 * `jobDocuments`-Registry. `downloadUrl` zeigt auf unsere gespeicherte Kopie,
 * nicht auf die Bundeswehr-URL - die kann nach Bewerbungsschluss tot sein.
 */
export interface JobDocument {
  attHeader: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
}

/** Vollständiger Datensatz für die Job-Detailseite, per Admin-SDK gelesen. */
export interface JobDetail {
  pinstGuid: string;
  /** Kennung der Ausschreibung (`api.RefCode`) - damit sucht der Bewerber sie im Portal. */
  refCode: string;
  title: string;
  besOrt: string;
  contractTypeLabel: string | null;
  applicationEnd: string;
  arbeitszeit: string;
  companyDesc: string;
  jobDesc: string;
  requireDesc: string;
  remarcDesc: string;
  contactDesc: string;
  documents: JobDocument[];
  /** `jobAttributes.unterlagen` roh (aus dem Text extrahiert); leer heißt NICHT „nichts nötig". */
  unterlagen: string[];
  /** `jobAttributes.unterlagenHinweise`, formale Hinweise zu den Unterlagen. */
  unterlagenHinweise: string;
  hotJob: boolean;
  /**
   * `false` = archiviert: Bewerbungsschluss vorbei oder nicht mehr
   * ausgeschrieben. Solche Stellen tauchen in keiner Suche mehr auf, bleiben
   * aber ueber ihren Link lesbar - deshalb MUSS die Seite es sichtbar sagen.
   */
  active: boolean;
  /** 1=militärisch/2=zivil, siehe Wertehilfen_Taetigkeitsbereich. */
  reqIndustry: number;
}
