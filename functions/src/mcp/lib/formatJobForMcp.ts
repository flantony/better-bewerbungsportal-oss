import type { JobAttributesRecord, JobRecord } from "../../types";
import type { Besoldungsspanne } from "../../lib/besoldungsSpanne";
import { spanneLabel } from "../../lib/besoldungsSpanne";
import { bewerbungJederzeitFuerJob } from "../../lib/bewerbungsschluss";
import { bewerbungsschlussHinweis } from "./bewerbungsschlussHinweis";
import type { GeteilterHinweis } from "./geteilterHinweis";

/** Steht an jedem extrahierten Anforderungsblock - macht unmissverständlich,
 *  dass das eine Auswertung des Fließtexts ist, keine Angabe der Bundeswehr. */
const ANFORDERUNGEN_HINWEIS =
  "Automatisch aus dem Ausschreibungstext extrahiert, keine amtliche Angabe. `belegstelle` zitiert die Fundstelle — im Zweifel den Volltext prüfen. Sagt der Text zu einer Angabe nichts, fehlt das Feld hier ganz: ein fehlendes Feld ist keine Aussage und nie „keine Grenze“ oder „nicht verlangt“.";

/**
 * Angaben, deren Unbekannt-Wert wie eine Aussage aussieht.
 *
 * WOZU: `0` heisst bei uns „die Ausschreibung sagt dazu nichts“, ist aber eine
 * Zahl wie jede andere. Clients geben `hoechstalter` als
 * Altersgrenze an den Bewerber weiter; aus einer 0 wird dort „keine
 * Altersgrenze“, und aus `berufserfahrungJahre: 0` „keine
 * Berufserfahrung noetig“. Beides ist grundfalsch und kostet eine Bewerbung.
 * Eine Warnung in `instructions.ts` allein greift nur, solange der Client sie
 * gelesen hat und sich erinnert. Was nicht da ist, kann nicht falsch gelesen
 * werden.
 *
 * `verpflichtungsdauer` gehoert dazu, weil ein leerer Wert dort als „keine
 * Verpflichtungszeit“ lesbar ist. Leere Strings ohne diese Doppeldeutigkeit
 * (`dienstgrad`, `abschluss`, `sicherheitsueberpruefung`) bleiben stehen: sie
 * koennen nicht als Wert missverstanden werden.
 */
type UnsichereAngabe = "mindestalter" | "hoechstalter" | "berufserfahrungJahre" | "verpflichtungsdauer";

export type ExtrahierteAnforderungen = Omit<JobAttributesRecord, UnsichereAngabe> &
  Partial<Pick<JobAttributesRecord, UnsichereAngabe>>;

function ohneUnbekannteAngaben(attribute: JobAttributesRecord): ExtrahierteAnforderungen {
  const { mindestalter, hoechstalter, berufserfahrungJahre, verpflichtungsdauer, ...rest } = attribute;
  return {
    ...rest,
    ...(mindestalter ? { mindestalter } : {}),
    ...(hoechstalter ? { hoechstalter } : {}),
    ...(berufserfahrungJahre ? { berufserfahrungJahre } : {}),
    ...(verpflichtungsdauer ? { verpflichtungsdauer } : {}),
  };
}

/**
 * Was ein MCP-Client über eine Ausschreibung bekommt.
 *
 * NICHT enthalten: `region`, `plz`, `country`, `place`, `keywords`, `newJob`
 * und weitere Rohfelder, die in den echten Daten durchgehend leer bzw.
 * konstant sind. Sie suggerierten dem Modell Informationen, die es nicht gibt.
 */
export interface McpJob {
  pinstGuid: string;
  refCode: string;
  title: string;
  contractTypeLabel: string | null;
  besOrt: string;
  applicationEnd: string;
  /**
   * Nur bei leerem `applicationEnd`: ob der Text die Bewerbung jederzeit
   * zulaesst oder gar nichts sagt. Ein leerer String allein wird als "Frist
   * unbekannt" gelesen, obwohl die meisten dieser Stellen gar keine haben.
   */
  bewerbungsschlussHinweis?: GeteilterHinweis;
  arbeitszeit: string;
  vollzeit: boolean;
  /** 1 = militärisch, 2 = zivil. */
  reqIndustry: number;
  hotJob: boolean;
  /**
   * Besoldung als EINE Angabe. `quelle: "ausschreibung"` = amtliche
   * Tarifgruppen-Spanne der Stelle; `"dienstgrad"` = aus einem genannten
   * Dienstgrad über die BBesO abgeleitet, also eine Einordnung.
   */
  besoldung: (Besoldungsspanne & { label: string }) | null;
  /**
   * Aus dem Fließtext extrahierte Anforderungen, `null` wenn nicht vorhanden.
   * Einzelne Felder fehlen, wenn die Ausschreibung dazu nichts sagt
   * (s. `ohneUnbekannteAngaben`) - eine 0 dort würde als Altersgrenze gelesen
   * und führte zu falschen Auskünften.
   */
  anforderungen: (ExtrahierteAnforderungen & { hinweis: string }) | null;
  companyDesc: string;
  jobDesc: string;
  requireDesc: string;
  remarcDesc: string;
  contactDesc: string;
  /**
   * Nur die Anhangs-Namen. Die Links liefert `get_document_requirements` -
   * dort sind sie mit Größe, Typ und Ausfüllbarkeit angereichert, statt hier
   * doppelt zu erscheinen.
   */
  dokumente: string[];
  /**
   * `true`, wenn die Ausschreibung archiviert ist - Bewerbungsschluss vorbei
   * oder zurueckgezogen. Sie taucht in `list_jobs` nicht mehr auf, ist ueber
   * ihre pinstGuid aber weiter abrufbar. Das MUSS an den Nutzer weitergegeben
   * werden: eine Bewerbung ist nicht mehr moeglich.
   */
  nichtMehrAktuell: boolean;
}

export function formatJobForMcp(job: JobRecord): McpJob {
  const fristHinweis = bewerbungsschlussHinweis(job.applicationEnd, bewerbungJederzeitFuerJob(job));
  return {
    pinstGuid: job.pinstGuid,
    refCode: job.refCode,
    title: job.title,
    contractTypeLabel: job.contractTypeLabel,
    besOrt: job.besOrt,
    applicationEnd: job.applicationEnd,
    ...(fristHinweis ? { bewerbungsschlussHinweis: fristHinweis } : {}),
    arbeitszeit: job.arbeitszeit,
    vollzeit: job.vollzeit,
    reqIndustry: job.reqIndustry,
    hotJob: job.hotJob,
    besoldung: job.besoldung ? { ...job.besoldung, label: spanneLabel(job.besoldung) } : null,
    anforderungen: job.jobAttributes
      ? { ...ohneUnbekannteAngaben(job.jobAttributes), hinweis: ANFORDERUNGEN_HINWEIS }
      : null,
    companyDesc: job.companyDesc,
    jobDesc: job.jobDesc,
    requireDesc: job.requireDesc,
    remarcDesc: job.remarcDesc,
    contactDesc: job.contactDesc,
    dokumente: (job.dokumente ?? []).map((ref) => ref.attHeader),
    nichtMehrAktuell: job.active !== true,
  };
}
