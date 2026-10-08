/**
 * Blankoformulare als Bytes ausliefern - gemeinsame Grundlage fuer das Tool
 * `hole_formular` und die Resource `bw://formular/{docId}`.
 *
 * WOZU: Eine `downloadUrl` allein reicht, wenn der Nutzer selbst einen Browser
 * aufmacht - aber ein KI-Client, der dem Nutzer das Formular
 * gleich als Datei in den Chat legen soll, kommt damit nicht weiter. Er kann die
 * URL nicht abrufen (kein Netzzugriff) oder darf es nicht.
 *
 * GROESSENSCHRANKE, und warum sie am Tool strenger ist als an der Resource:
 * base64 blaeht um ein Drittel auf, und eine Tool-Antwort landet VOLLSTAENDIG im
 * Modellkontext. Ein 4-MB-PDF waeren ueber 5 MB base64, also weit mehr als jedes
 * Kontextfenster fasst - der Aufruf wuerde nicht "gross", sondern kaputt. Eine
 * Resource holt der Client dagegen bewusst und kann sie am Modell vorbei als
 * Datei behandeln.
 *
 * Die Schranke gilt trotzdem auch dort: die Resource ist anonym abrufbar, und ohne Schranke kostete jeder Abruf einen
 * vollen Storage-Download samt Base64 - bis zu 25 MB je Aufruf. Wer eine
 * groessere Datei braucht, bekommt den Hinweis mit der `downloadUrl`.
 */
import { loadJobDocument, readStoredDocument } from "../../jobDocumentStore";
import { HinweisFehler } from "../../lib/hinweisFehler";

/**
 * 100 KB Datei ~ 137 KB Base64 ~ 35.000 Token. Die Schranke misst die
 * Dateigroesse, der Client bezahlt aber die Base64-Kette; schon bei einigen
 * hundert KB kuerzen Clients das base64 und halten eine kaputte Datei in der
 * Hand. Darueber liefert das Werkzeug Hinweis und downloadUrl - ebenso die
 * Resource `bw://formular/{docId}`.
 */
export const MAX_TOOL_BYTES = 100 * 1024;

/** Format der Anhang-Kennungen (`documentIdFor` in jobDocumentStore.ts: 24 Hex-Zeichen). */
const DOKUMENT_ID = /^[0-9a-f]{24}$/;

export interface FormularDaten {
  docId: string;
  dateiname: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
  /** base64 - fehlt, wenn die Datei fuer den gewaehlten Weg zu gross ist. */
  base64?: string;
  hinweis?: string;
}

export class FormularNichtGefundenError extends HinweisFehler {
  constructor() {
    // Ohne die Kennung im Text: der Client hat sie gerade selbst geschickt,
    // und eine beliebig lange Eingabe gehoert nicht zurueck in die Antwort.
    super(
      `Zu dieser Kennung ist kein Dokument hinterlegt. Die Kennungen stehen als "docId" in der Antwort von get_document_requirements - bitte diese Stelle zuerst aufrufen und die dort genannte docId verwenden.`,
    );
    this.name = "FormularNichtGefundenError";
  }
}

/**
 * `maxBytes: null` = keine Schranke. Beide MCP-Wege (Werkzeug und Resource)
 * uebergeben `MAX_TOOL_BYTES`.
 */
export async function ladeFormular(docId: string, maxBytes: number | null): Promise<FormularDaten> {
  // Vor jedem Firestore-Zugriff: ein Pfad mit "/" waere sonst ein Lesezugriff
  // auf ein beliebiges Unterdokument bzw. ein Firestore-Fehler mit Pfad im Text.
  if (!DOKUMENT_ID.test(docId)) throw new FormularNichtGefundenError();
  const record = await loadJobDocument(docId);
  if (!record) throw new FormularNichtGefundenError();

  const basis: FormularDaten = {
    docId: record.docId,
    dateiname: record.attHeader,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    downloadUrl: record.url,
  };

  if (maxBytes !== null && record.sizeBytes > maxBytes) {
    return {
      ...basis,
      hinweis: `Diese Datei ist mit ${Math.round(record.sizeBytes / 1024)} KB zu gross, um sie hier mitzuschicken. Bitte dem Nutzer stattdessen die downloadUrl geben - sie zeigt auf dasselbe Formular und ist ohne Anmeldung abrufbar.`,
    };
  }

  const bytes = await readStoredDocument(record.storagePath);
  return { ...basis, base64: Buffer.from(bytes).toString("base64") };
}
