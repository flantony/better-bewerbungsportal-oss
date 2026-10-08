import { z } from "zod/v3";
import { detectTemplateFamily, type TemplateFamily } from "../lib/identifyBewerbungsbogen";
import {
  angabenFuerVariante,
  detectBewerbungsbogenVariant,
  type AngabeSchluessel,
} from "../../fillBewerbungsbogen";
import { loadJobRecord } from "../lib/loadJobRecord";
import { loadJobDocuments } from "../../jobDocumentStore";
import { normalisiereUnterlagen } from "../../lib/unterlagen";
import { hinweisZuBewerbungsboegen, hinweisZuUnterlagen, hinweisZuVordrucken } from "../lib/unterlagenHinweis";
import { teileAnhaengeAuf } from "../../mappe/anhangArt";
import type { GeteilterHinweis } from "../lib/geteilterHinweis";
import type { JobRecord } from "../../types";

export const getDocumentRequirementsInputSchema = {
  pinstGuid: z.string().min(1).describe("The pinstGuid identifier returned by list_jobs."),
};

const getDocumentRequirementsInput = z.object(getDocumentRequirementsInputSchema);
export type GetDocumentRequirementsInput = z.infer<typeof getDocumentRequirementsInput>;

export interface DocumentInfo {
  attHeader: string;
  /**
   * Kennung der gespeicherten Datei. Nötig, um das Formular über
   * `hole_formular` bzw. die Resource `bw://formular/{docId}` als Datei zu
   * bekommen - ohne sie kann ein Client den Anhang nicht adressieren.
   */
  docId: string;
  /** Stabiler Link auf unsere Kopie - kein Live-Abruf bei der Bundeswehr nötig. */
  downloadUrl: string;
  contentType: string;
  sizeBytes: number;
}

export interface BewerbungsbogenInfo extends DocumentInfo {
  family: TemplateFamily;
  /** true = `fuelle_formular` kann sie ausfüllen; false = nur Blankoformular. */
  ausfuellbar: boolean;
  /**
   * Nur bei `ausfuellbar: true`: welche Angaben von `fuelle_formular`
   * DIESE Vorlage wirklich einsetzt. Damit fragt der Client genau die nötigen
   * Angaben ab statt aller zwölf - der Karrierebogen hat z.B. kein Telefon- und
   * kein Adressfeld.
   */
  benoetigteAngaben?: AngabeSchluessel[];
  /** Zusatzangaben, die diese Vorlage einsetzt, wenn sie vorliegen - nie zu erfragen. */
  optionaleAngaben?: AngabeSchluessel[];
  /** Angaben, die diese Vorlage nicht hat - danach zu fragen ist verlorene Mühe. */
  nichtVerwendeteAngaben?: AngabeSchluessel[];
}

export interface DocumentRequirementsResult {
  /** Alle Anhänge der Ausschreibung, mit Links auf die gespeicherten Kopien. */
  documents: DocumentInfo[];
  /**
   * ALLE Bewerbungsbögen dieser Ausschreibung, ausfüllbare zuerst. Mehrere sind
   * normal (z.B. Mannschaften-Karrierebogen UND Militärisch-Bogen) - welcher
   * passt, hängt an der Laufbahn des Bewerbers.
   */
  bewerbungsboegen: BewerbungsbogenInfo[];
  /** Erster ausfüllbarer Bogen - Abkürzung für einfache Aufrufer. */
  bewerbungsbogen: BewerbungsbogenInfo | null;
  /**
   * Vordrucke, die der Bewerber selbst ausfuellt und unterschreibt - kein
   * Bewerbungsbogen, keine Feldzuordnung (z. B. "Anlage 1 zum Bewerbungsbogen",
   * s. mappe/anhangArt.ts). Gehoeren zur Bewerbung. Leer, wenn keiner anhaengt.
   */
  selbstAuszufuellen: { attHeader: string; docId: string; downloadUrl: string }[];
  /** Nur gesetzt, wenn `selbstAuszufuellen` nicht leer ist. */
  vordruckHinweis?: GeteilterHinweis;
  /**
   * Gesetzt, solange KEIN ausfüllbarer Bogen dabei ist - in zwei Lagen mit
   * unterschiedlichem Text: gar kein Anhang (dann wird keiner verlangt) oder
   * einer, für den wir keine Feldzuordnung haben (dann füllt der Bewerber ihn
   * selbst, und es sind keine Angaben zu sammeln).
   */
  bogenHinweis?: GeteilterHinweis;
  /** Vom Ausschreibungstext geforderte Unterlagen (KI-extrahiert), falls vorhanden. */
  geforderteUnterlagen: string[];
  unterlagenHinweise: string;
  /**
   * Nur gesetzt, wenn `geforderteUnterlagen` leer ist: warum die Liste fehlt und
   * was stattdessen gilt. Ein leeres Array allein liest sich wie "nichts noetig".
   */
  hinweis?: GeteilterHinweis;
}

/**
 * `vorgeladenerJob` spart einen doppelten Firestore-Zugriff: `loadJobRecord`
 * liest zwei Dokumente (Uebersicht + Volltext), und `eroeffne_bewerbungsmappe`
 * braucht `refCode`/`title` selbst - es hat den Datensatz also schon in der Hand,
 * wenn es hier hereinruft. Ohne diesen Parameter laese derselbe Werkzeugaufruf
 * dieselbe Ausschreibung zweimal: vier Reads statt zwei. Fuer den Tool-Weg
 * ueber `server.ts` bleibt der Parameter weg, und die Funktion laedt selbst.
 */
export async function getDocumentRequirements(
  input: GetDocumentRequirementsInput,
  vorgeladenerJob?: JobRecord,
): Promise<DocumentRequirementsResult> {
  const job = vorgeladenerJob ?? (await loadJobRecord(input.pinstGuid));
  const gespeichert = await loadJobDocuments(job.dokumente ?? []);

  const documents: DocumentInfo[] = gespeichert.map((doc) => ({
    attHeader: doc.attHeader,
    docId: doc.docId,
    downloadUrl: doc.url,
    contentType: doc.contentType,
    sizeBytes: doc.sizeBytes,
  }));

  const bewerbungsboegen: BewerbungsbogenInfo[] = [];
  for (const doc of gespeichert) {
    const family = detectTemplateFamily(doc.attHeader);
    if (!family) continue;
    // Die Feldliste kommt aus dem Feld-Mapping der erkannten Variante selbst -
    // ohne Variante gibt es keine, und dann wird auch keine behauptet.
    const variant = detectBewerbungsbogenVariant(doc.attHeader);
    const angaben = variant ? angabenFuerVariante(variant) : null;
    bewerbungsboegen.push({
      attHeader: doc.attHeader,
      docId: doc.docId,
      downloadUrl: doc.url,
      contentType: doc.contentType,
      sizeBytes: doc.sizeBytes,
      family,
      ausfuellbar: variant !== null,
      ...(angaben
        ? {
            benoetigteAngaben: angaben.benoetigt,
            optionaleAngaben: angaben.optional,
            nichtVerwendeteAngaben: angaben.nichtVerwendet,
          }
        : {}),
    });
  }
  bewerbungsboegen.sort((a, b) => Number(b.ausfuellbar) - Number(a.ausfuellbar));

  const unterlagen = normalisiereUnterlagen(job.jobAttributes?.unterlagen ?? []);
  const hinweis = hinweisZuUnterlagen(unterlagen, documents.length);
  const anhaenge = teileAnhaengeAuf(documents);
  const bogenHinweis = hinweisZuBewerbungsboegen(
    bewerbungsboegen.length,
    bewerbungsboegen.filter((bogen) => bogen.ausfuellbar).length,
    anhaenge.ausfuellen.length,
  );
  const vordruckHinweis = hinweisZuVordrucken(
    anhaenge.ausfuellen.map((doc) => doc.attHeader),
    anhaenge.beiblaetter.map((doc) => doc.attHeader),
  );

  return {
    documents,
    bewerbungsboegen,
    bewerbungsbogen: bewerbungsboegen.find((bogen) => bogen.ausfuellbar) ?? null,
    ...(bogenHinweis ? { bogenHinweis } : {}),
    selbstAuszufuellen: anhaenge.ausfuellen.map((doc) => ({
      attHeader: doc.attHeader,
      docId: doc.docId,
      downloadUrl: doc.downloadUrl,
    })),
    ...(vordruckHinweis ? { vordruckHinweis } : {}),
    geforderteUnterlagen: unterlagen,
    unterlagenHinweise: job.jobAttributes?.unterlagenHinweise ?? "",
    ...(hinweis ? { hinweis } : {}),
  };
}
