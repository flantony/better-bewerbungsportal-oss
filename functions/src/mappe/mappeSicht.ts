import { artLabel, type DokumentArt, type MappeRecord } from "./mappeTypen";
import { istAusweisUnterlage } from "./ausweiskopie";

export interface MappenSicht {
  dokumente: { docId: string; art: DokumentArt; bezeichnung: string; sizeBytes: number }[];
  fehlendeUnterlagen: string[];
  /**
   * Eintraege der Unterlagenliste, die die Mappe gar nicht
   * annimmt (Ausweiskopie) - der Bewerber legt sie selbst bei. Getrennt von
   * `fehlendeUnterlagen`, sonst baete die KI um einen Upload, den es nicht
   * gibt, und die Mappe wuerde nie vollstaendig.
   */
  selbstBeilegen: string[];
  offeneFormulare: { docId: string; fehlendeAngaben: string[] }[];
  paketGebaut: boolean;
}

/**
 * Wortstämme, an denen eine geforderte Unterlage einer vorhandenen Datei
 * zugeordnet wird — geprüft nur am WORTANFANG.
 *
 * WOZU der Wortanfang: eine Teilwort-Suche (`includes()`) irrt in die
 * gefaehrliche Richtung. "Kopie des Schwerbehindertenausweises" (in vielen
 * Unterlagenlisten) gaelte durch einen hochgeladenen Personalausweis als
 * erledigt, "Fuehrungszeugnis" durch jedes Schulzeugnis. Der Bewerber reichte
 * dann etwas nicht ein, weil ihm niemand sagt, dass es fehlt. Deutsche
 * Komposita stellen das Bestimmungswort voran - am Wortanfang gepruefte Staemme
 * trennen "Zeugniskopien" von "Fuehrungszeugnis".
 *
 * Im Zweifel bleibt ein Punkt OFFEN. Ein zu viel gemeldeter Punkt kostet eine
 * Rueckfrage, ein zu wenig gemeldeter die Bewerbung.
 */
const STAMM_JE_ART: Record<DokumentArt, string[]> = {
  anschreiben: ["anschreiben", "bewerbungsschreiben", "motivationsschreiben"],
  lebenslauf: ["lebenslauf"],
  zeugnis: ["zeugnis", "zeugnisse", "zeugniskopien", "schulzeugnis", "arbeitszeugnis", "praktikumszeugnis", "abschlusszeugnis"],
  formular: ["bewerbungsbogen", "karrierebogen", "bewerbungsformular"],
  sonstiges: [],
};

/** Trifft der Stamm am Anfang eines Wortes? Umlaute zaehlen als Wortzeichen. */
function stammTrifft(text: string, stamm: string): boolean {
  return new RegExp(`(^|[^a-zäöüß])${stamm}`, "i").test(text);
}

/**
 * Bezeichnet jedes Dokument nach seiner ART, nicht nach seinem Dateinamen -
 * "Zeugnis 1", "Lebenslauf". Durchnummeriert wird nur, wo eine Art mehrfach
 * vorkommt, damit die Bezeichnung im Normalfall schlicht bleibt.
 *
 * WOZU: Der Dateiname gehoert dem Bewerber und traegt typischerweise seinen
 * Klarnamen ("Perso_Max_Mustermann.jpg", "Zeugnis_Mustermann_1998.pdf"). Auf
 * der anderen Seite dieses Rueckgabewerts sitzt ein fremdes KI-Tool, dem wir in
 * `DSFA.md` und in der Datenschutzerklaerung zugesagt haben, dass es nur
 * erfaehrt, WELCHE Dokumente angekommen sind - nie die Dateien und nie mehr
 * ueber den Bewerber, als er selbst gerade sagt. Angesprochen werden Dokumente
 * ohnehin ueber `docId`, nicht ueber ihren Namen.
 *
 * NICHT betroffen: der Name im ZIP (das Paket geht an den Bewerber selbst) und
 * die Upload-Seite (sein eigener Browser, seine eigene Datei).
 */
export function bezeichneFuerClient(dokumente: { docId: string; art: DokumentArt }[]): Map<string, string> {
  const gesamtJeArt = new Map<DokumentArt, number>();
  for (const dokument of dokumente) {
    gesamtJeArt.set(dokument.art, (gesamtJeArt.get(dokument.art) ?? 0) + 1);
  }

  const laufendJeArt = new Map<DokumentArt, number>();
  const bezeichnungen = new Map<string, string>();
  for (const dokument of dokumente) {
    const nummer = (laufendJeArt.get(dokument.art) ?? 0) + 1;
    laufendJeArt.set(dokument.art, nummer);
    const mehrere = (gesamtJeArt.get(dokument.art) ?? 0) > 1;
    bezeichnungen.set(dokument.docId, mehrere ? `${artLabel(dokument.art)} ${nummer}` : artLabel(dokument.art));
  }
  return bezeichnungen;
}

export function mappenSicht(mappe: MappeRecord, benoetigteUnterlagen: string[]): MappenSicht {
  const vorhandeneStaemme = new Set(mappe.dokumente.flatMap((dokument) => STAMM_JE_ART[dokument.art] ?? []));
  const bezeichnungen = bezeichneFuerClient(mappe.dokumente);

  return {
    dokumente: mappe.dokumente.map((dokument) => ({
      docId: dokument.docId,
      art: dokument.art,
      bezeichnung: bezeichnungen.get(dokument.docId) as string,
      sizeBytes: dokument.sizeBytes,
    })),
    fehlendeUnterlagen: benoetigteUnterlagen.filter((unterlage) => {
      if (istAusweisUnterlage(unterlage)) return false;
      return ![...vorhandeneStaemme].some((stamm) => stammTrifft(unterlage, stamm));
    }),
    selbstBeilegen: benoetigteUnterlagen.filter(istAusweisUnterlage),
    offeneFormulare: Object.entries(mappe.formularstand)
      .filter(([, stand]) => stand.fehlendeAngaben.length > 0)
      .map(([docId, stand]) => ({ docId, fehlendeAngaben: stand.fehlendeAngaben })),
    paketGebaut: mappe.zipGebautAm !== null,
  };
}
