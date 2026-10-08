// Spiegel von FormularPlan/Bewerbungsplan in functions/src/konto/bewerbung.ts -
// dort ist die Form massgeblich, hier nur fuer den Web-Assistenten.
export interface FormularPlan {
  docId: string;
  titel: string;
  ausfuellbar: boolean;
  /** Feldnamen in Alltagssprache - leer bei nicht ausfuellbaren Formularen. */
  fehlendeAngaben: string[];
  optionaleAngaben: string[];
}

export interface AblageEintrag {
  docId: string;
  art: string;
  dateiname: string;
}

export interface Bewerbungsplan {
  stelle: {
    pinstGuid: string;
    refCode: string;
    titel: string;
    bewerbungsschluss: string;
    /** Fertiger Wortlaut vom Server; optional, weil Web und Functions getrennt ausgerollt werden (s. bewerbungsschlussAnzeige). */
    bewerbungsschlussText?: string;
    aktiv: boolean;
  };
  /** Alle Boegen der Stelle; ausfuellbare zuerst. */
  formulare: FormularPlan[];
  geforderteUnterlagen: string[];
  hinweise: string[];
  ablage: AblageEintrag[];
  angabenVorhanden: boolean;
  /**
   * Vordrucke, die der Bewerber selbst ausfuellt und unterschreibt (z. B.
   * "Anlage 1 zum Bewerbungsbogen"). Optional: eine Serverantwort ohne das
   * Feld bleibt gueltig.
   */
  selbstAuszufuellen?: VordruckZumSelbstAusfuellen[];
  /** Der Einreichweg als ganze Saetze vom Server (functions/src/lib/einreichen.ts) - nie hier nachbauen. */
  einreichen?: string[];
  /**
   * Nur wenn die Ausschreibung eine Ausweiskopie verlangt: der fertige Satz,
   * dass der Bewerber sie selbst beilegt (wir nehmen keine entgegen).
   * Optional: eine Serverantwort ohne das Feld bleibt gueltig.
   */
  ausweiskopieHinweis?: string;
}

export interface VordruckZumSelbstAusfuellen {
  titel: string;
  downloadUrl: string;
}

export interface BewerbungspaketAntwort {
  url: string;
  dateiname: string;
}

// Spiegel von MAX_TEXT_ZEICHEN in functions/src/konto/bewerbung.ts - dort
// massgeblich, hier nur fuer den Zeichenzaehler und die client-seitige
// Vorab-Pruefung der beiden Textfelder.
export const MAX_TEXT_ZEICHEN = 20_000;
