import type { JobRecord } from "../../types";
import type { MappeRecord, MappenAnforderungen } from "../../mappe/mappeTypen";
import { laufbahngruppenDerStelle } from "../../mappe/merkzettel";
import { bewerbungJederzeitFuerJob } from "../../lib/bewerbungsschluss";
import { getDocumentRequirements } from "../tools/getDocumentRequirements";
import { JobNotFoundError, loadJobRecord } from "./loadJobRecord";

type JobFuerSchnappschuss = Pick<
  JobRecord,
  "applicationEnd" | "dokumente" | "laufbahngruppe" | "jobAttributes" | "companyDesc" | "jobDesc" | "requireDesc" | "remarcDesc"
>;

/** Der Schnappschuss mit allen Feldern - so, wie ihn der Paketbau braucht. */
export type PaketAnforderungen = Required<MappenAnforderungen>;

/** Was der Merkzettel ueber die Ausschreibung wissen muss, ohne Unterlagenliste. */
function paketAngabenAus(job: JobFuerSchnappschuss, links: { docId: string; downloadUrl: string }[] = []) {
  const linkJeDocId = new Map(links.map((link) => [link.docId, link.downloadUrl]));
  return {
    anhaenge: (job.dokumente ?? []).map((anhang) => {
      const downloadUrl = linkJeDocId.get(anhang.docId);
      return { docId: anhang.docId, attHeader: anhang.attHeader, ...(downloadUrl ? { downloadUrl } : {}) };
    }),
    laufbahngruppen: laufbahngruppenDerStelle(job),
    bewerbungJederzeit: bewerbungJederzeitFuerJob(job),
  };
}

/**
 * Was der Merkzettel ohne Ausschreibung annimmt: keine Anhaenge, keine
 * Laufbahn, keine Aussage zur Frist. Jeder Abschnitt faellt dann auf seinen
 * vorsichtigen Text zurueck (s. mappe/merkzettel.ts).
 */
const OHNE_AUSSCHREIBUNG = { anhaenge: [], laufbahngruppen: [], bewerbungJederzeit: false };

/** Traegt der Schnappschuss schon alle Felder, die der Paketbau braucht? */
function istVollstaendig(schnappschuss: MappenAnforderungen | undefined): schnappschuss is PaketAnforderungen {
  return (
    schnappschuss?.anhaenge !== undefined &&
    schnappschuss.laufbahngruppen !== undefined &&
    schnappschuss.bewerbungJederzeit !== undefined
  );
}

/**
 * Berechnet den Schnappschuss beim Eroeffnen der Mappe - die EINZIGE Stelle, die
 * ihn baut, damit `mappe_status` und `schliesse_bewerbungsmappe` sich auf
 * dieselben Felder verlassen koennen.
 */
export function anforderungenAus(
  job: JobFuerSchnappschuss,
  anforderungen: {
    geforderteUnterlagen: string[];
    unterlagenHinweise: string;
    /** Aus get_document_requirements: liefert die Links auf unsere Kopien der Anhaenge. */
    documents?: { docId: string; downloadUrl: string }[];
  },
): PaketAnforderungen {
  return {
    geforderteUnterlagen: anforderungen.geforderteUnterlagen,
    unterlagenHinweise: anforderungen.unterlagenHinweise,
    bewerbungsschluss: job.applicationEnd ?? "",
    ...paketAngabenAus(job, anforderungen.documents),
  };
}

/**
 * Liest den Schnappschuss aus der Mappe - und laedt nur dann nach, wenn er fehlt.
 *
 * WOZU der Nachladeweg: eine Mappe lebt bis zu eine Stunde, auch ueber einen
 * Deploy hinweg, und kann deshalb ohne Schnappschuss in Firestore stehen. Ohne
 * diesen Zweig liefe sie in `undefined`, und der Bewerber verloere seine
 * hochgeladenen Zeugnisse, weil sein KI-Tool eine Stoerung meldet. Der Zweig
 * kostet nur dann etwas, wenn er greift.
 */
export async function anforderungenFuerMappe(
  mappe: Pick<MappeRecord, "pinstGuid" | "anforderungen">,
): Promise<MappenAnforderungen> {
  if (mappe.anforderungen) return mappe.anforderungen;
  const job = await loadJobRecord(mappe.pinstGuid);
  const nachgeladen = await getDocumentRequirements({ pinstGuid: mappe.pinstGuid }, job);
  return anforderungenAus(job, nachgeladen);
}

/**
 * Wie `anforderungenFuerMappe`, aber mit den Angaben, die nur der Paketbau
 * braucht (Anhaenge, Laufbahngruppe, "jederzeit"). Getrennt, damit das
 * dutzendfach wiederholte `mappe_status` nicht bei jedem Pollen die
 * Ausschreibung nachlaedt: hier wird hoechstens EINMAL je Paketbau gelesen, und
 * nur fuer eine Mappe ohne vollstaendigen Schnappschuss.
 */
export async function anforderungenFuerPaket(
  mappe: Pick<MappeRecord, "pinstGuid" | "anforderungen">,
): Promise<PaketAnforderungen> {
  const schnappschuss = mappe.anforderungen;
  if (istVollstaendig(schnappschuss)) return schnappschuss;

  let job: JobRecord;
  try {
    job = await loadJobRecord(mappe.pinstGuid);
  } catch (fehler) {
    // Die Ausschreibung ist seit dem Eroeffnen verschwunden (zurueckgezogen,
    // Sync). Das darf das Paket nicht kosten - die Zeugnisse des Bewerbers
    // liegen schon in der Mappe. Der Merkzettel faellt auf seine vorsichtigen
    // Texte zurueck.
    if (!(fehler instanceof JobNotFoundError)) throw fehler;
    return {
      geforderteUnterlagen: [],
      unterlagenHinweise: "",
      bewerbungsschluss: "",
      ...schnappschuss,
      ...OHNE_AUSSCHREIBUNG,
    };
  }
  if (schnappschuss) return { ...schnappschuss, ...paketAngabenAus(job) };
  return anforderungenAus(job, await getDocumentRequirements({ pinstGuid: mappe.pinstGuid }, job));
}
