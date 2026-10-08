import { z } from "zod/v3";
import { fuegeDokumentEin, ladeMappe } from "../../mappe/mappeStore";
import { mappenBestand } from "../../mappe/mappeTypen";
import { textZuPdf } from "../../mappe/textZuPdf";
import { erkenneTyp, MappeVollError, pruefeFreienPlatz, pruefeUpload } from "../../mappe/uploadRegeln";
import { neuerEinmalToken } from "../../mappe/mappeId";
import { fasseHinweiseZusammen, geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";
import { findePlatzhalter } from "../../lib/platzhalter";
import { HinweisFehler } from "../../lib/hinweisFehler";
import { sichererDateiname } from "../../konto/unterlagen";
import { mappenIdFeld, MAX_DATEINAME_ZEICHEN, MAX_TEXT_ZEICHEN } from "../lib/eingabeGrenzen";

/**
 * Was dieses Werkzeug annimmt - WENIGER als `DOKUMENT_ARTEN`:
 * `formular` erzeugt nur fuelle_formular. Eine Ausweiskopie nimmt kein Weg
 * an (s. mappe/ausweiskopie.ts) - eine KI, die es trotzdem versucht, bekommt einen
 * eigenen Satz, der sie NICHT zur Upload-Seite schickt.
 */
const ANNEHMBARE_ARTEN = ["anschreiben", "lebenslauf", "zeugnis", "sonstiges"] as const;

/** 128 KB Base64 ~ 96 KB Datei ~ 32.000 Token. Darueber gehoert die Datei auf die Upload-Seite. */
export const MAX_INLINE_BASE64 = 128 * 1024;

export const fuegeDokumentHinzuInputSchema = {
  mappenId: mappenIdFeld,
  art: z
    // Eigene Meldung statt der generischen Enum-Ablehnung: ein Aufruf mit
    // "ausweiskopie" scheitert HIER, nicht erst im Funktionskoerper - und genau
    // dann muss die KI erfahren, dass sie den Bewerber nicht hochladen laesst
    // (die Regel gehoert in den Rueckgabewert).
    .enum(["anschreiben", "lebenslauf", "zeugnis", "sonstiges"], {
      errorMap: () => ({
        message:
          "art must be one of anschreiben, lebenslauf, zeugnis, sonstiges. Official forms are filled with fuelle_formular. " +
          "ID copies are not accepted anywhere on this server (neither here nor on the upload page) - if the posting asks " +
          "for one, the applicant encloses it themselves. Do not ask them to upload it.",
      }),
    })
    .describe("What kind of document this is. Drives naming and order inside the final ZIP."),
  dateiname: z
    .string()
    .min(1)
    .max(MAX_DATEINAME_ZEICHEN, `dateiname is limited to ${MAX_DATEINAME_ZEICHEN} characters - a short name like 'Lebenslauf.pdf' is enough.`)
    .describe("File name for the package, e.g. 'Lebenslauf.pdf'."),
  text: z
    .string()
    .min(1)
    .max(
      MAX_TEXT_ZEICHEN,
      `text is limited to ${MAX_TEXT_ZEICHEN} characters (about 20 pages) per document. A CV or cover letter is far shorter - ` +
        "shorten it, or split separate documents into separate calls.",
    )
    .optional()
    .describe(
      "PREFERRED for anything you wrote yourself (CV, cover letter): plain text, we render the PDF. Costs a few thousand tokens instead of thirty thousand for the same document as base64.",
    ),
  inhaltBase64: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Only for a small file you already hold as bytes. Hard limit 128 KB — anything larger belongs on the upload page the applicant opens in their browser.",
    ),
};

const eingabe = z.object(fuegeDokumentHinzuInputSchema);
export type FuegeDokumentHinzuInput = z.infer<typeof eingabe>;

export interface FuegeDokumentHinzuResult {
  dokument: { docId: string; art: string; dateiname: string; sizeBytes: number; contentType: string };
  /** Nur wenn `text` noch Platzhalter in eckigen Klammern enthielt ("[Telefon]") - die stehen jetzt so im PDF. */
  platzhalter?: string[];
  hinweis: GeteilterHinweis;
}

const ORT_JE_ART: Record<(typeof ANNEHMBARE_ARTEN)[number], string> = {
  anschreiben: "Im Anschreiben",
  lebenslauf: "Im Lebenslauf",
  zeugnis: "Im Zeugnis",
  sonstiges: "In der Unterlage",
};

/**
 * Was davon am Mappen-Datensatz stehen darf: nur Namen ohne Ziffern und "@"
 * und mit hoechstens vier Woertern - ein "[geb. 01.01.1990]", ein
 * "[name@example.com]" oder ein in Klammern gesetzter Satz ist kein
 * Platzhalter-Name, sondern ein Wert, und Werte speichert die Mappe nicht
 * (DSFA.md).
 */
export function zuMerkendePlatzhalter(platzhalter: string[]): string[] {
  return platzhalter
    .filter((name) => !/[\d@]/.test(name) && name.trim().split(/\s+/).length <= 4)
    .slice(0, 10);
}

/**
 * "[Adresse]", "[Telefon]" usw. gingen sonst unbemerkt ins PDF. Die Mappe
 * kennt keine Angaben und setzt nichts ein - die KI muss es JETZT im
 * Rueckgabewert erfahren, solange sie noch nachfragen kann.
 */
function platzhalterHinweis(art: (typeof ANNEHMBARE_ARTEN)[number], platzhalter: string[]): GeteilterHinweis {
  const liste = platzhalter.join(", ");
  return geteilterHinweis(
    `\`text\` enthielt noch Platzhalter in eckigen Klammern: ${liste}. Die Mappe setzt nichts ein - sie stehen ` +
      "so im PDF. Frag den Bewerber nach diesen Angaben (erfinde keine) und lege das Dokument mit den eingesetzten " +
      "Werten erneut mit fuege_dokument_hinzu ab. Die alte Fassung nimmt er auf der Upload-Seite aus " +
      "eroeffne_bewerbungsmappe heraus, sonst liegen beide im Paket. Nach Staatsangehörigkeit, Sprachkenntnissen " +
      "oder anderen Herkunftsangaben fragst du dafür nicht - gehört so ein Platzhalter in den Text, nimm ihn heraus.",
    `${ORT_JE_ART[art]} stehen noch Platzhalter: ${liste}. Ersetze sie vor dem Einreichen.`,
  );
}

export async function fuegeDokumentHinzu(input: FuegeDokumentHinzuInput): Promise<FuegeDokumentHinzuResult> {
  if ((input.art as string) === "ausweiskopie") {
    throw new HinweisFehler(
      "Ausweiskopien nimmt dieser Server nicht an - weder hier noch auf der Upload-Seite. Verlangt die " +
        "Ausschreibung eine, legt der Bewerber sie seiner Bewerbung selbst bei; bitte ihn nicht, sie hochzuladen.",
    );
  }
  if (!ANNEHMBARE_ARTEN.includes(input.art as (typeof ANNEHMBARE_ARTEN)[number])) {
    throw new HinweisFehler(
      `"${input.art}" nimmt dieses Werkzeug nicht an. Amtliche Formulare füllst du mit fuelle_formular; fertige Dateien des Bewerbers lädt er über die Upload-Seite im Browser hoch.`,
    );
  }
  if (Boolean(input.text) === Boolean(input.inhaltBase64)) {
    throw new HinweisFehler("Gib genau eines von `text` (bevorzugt) oder `inhaltBase64` mit, nicht beides und nicht keines.");
  }
  if (input.inhaltBase64 && input.inhaltBase64.length > MAX_INLINE_BASE64) {
    throw new HinweisFehler(
      "Diese Datei ist zu groß für einen Werkzeugaufruf. Gib dem Bewerber die Upload-Seite aus eroeffne_bewerbungsmappe — dort lädt er sie im Browser hoch, ohne dass sie durch das Gespräch muss.",
    );
  }
  // Die Grenzen des Schemas gelten auch fuer Aufrufer, die es umgehen (Tests,
  // kuenftige Wege) - geprueft, BEVOR ein PDF gerendert wird.
  if (input.text && input.text.length > MAX_TEXT_ZEICHEN) {
    throw new HinweisFehler(
      `\`text\` darf höchstens ${MAX_TEXT_ZEICHEN} Zeichen haben (etwa 20 Seiten). Kürze ihn oder lege getrennte Dokumente getrennt ab.`,
    );
  }
  // Derselbe Filter wie fuer Unterlagen im Konto: keine Steuerzeichen, keine
  // Pfadteile, hoechstens 120 Zeichen - der Name landet im ZIP und im PDF-Titel.
  const dateiname = sichererDateiname(input.dateiname);

  // Mappe und freier Platz VOR dem Rendern - ein voller oder abgelaufener
  // Aufruf soll kein PDF mehr kosten. Verbindlich (Anzahl UND Groesse) prueft
  // die Transaktion in fuegeDokumentEin.
  const mappe = await ladeMappe(input.mappenId);
  const platz = pruefeFreienPlatz(mappenBestand(mappe));
  if (!platz.ok) throw new MappeVollError(platz.grund);

  const bytes = input.text
    ? await textZuPdf(dateiname.replace(/\.pdf$/i, ""), input.text)
    : new Uint8Array(Buffer.from(input.inhaltBase64 as string, "base64"));

  // Der Textweg erzeugt das PDF selbst, da ist der Typ bekannt. Der
  // Base64-Weg bekommt fremde Bytes - der Aufrufer behauptet einen Typ,
  // aber Buffer.from(..., "base64") verwirft ungueltige Zeichen still, und
  // ein Client kann ohnehin jeden contentType hinschreiben. Deshalb wird
  // hier erkannt statt geglaubt.
  let contentType = "application/pdf";
  if (input.inhaltBase64) {
    const erkannt = erkenneTyp(bytes);
    if (!erkannt) {
      throw new HinweisFehler(
        "Dieser Inhalt ist weder PDF, JPEG noch PNG — oder das Base64 ist beschädigt. Für gescannte Unterlagen ist die Upload-Seite der richtige Weg.",
      );
    }
    contentType = erkannt;
  }

  const art = input.art as (typeof ANNEHMBARE_ARTEN)[number];
  const platzhalter = input.text ? findePlatzhalter(input.text) : [];
  const zuMerken = zuMerkendePlatzhalter(platzhalter);

  const erlaubt = pruefeUpload({ contentType, sizeBytes: bytes.byteLength }, mappenBestand(mappe));
  if (!erlaubt.ok) throw new MappeVollError(erlaubt.grund);

  const dokument = await fuegeDokumentEin(
    input.mappenId,
    {
      docId: neuerEinmalToken(),
      art: input.art,
      dateiname,
      contentType,
      sizeBytes: bytes.byteLength,
      herkunft: input.text ? "client" : "upload",
      ...(zuMerken.length > 0 ? { platzhalter: zuMerken } : {}),
    },
    bytes,
  );

  return {
    dokument: {
      docId: dokument.docId,
      art: dokument.art,
      dateiname: dokument.dateiname,
      sizeBytes: dokument.sizeBytes,
      contentType: dokument.contentType,
    },
    ...(platzhalter.length > 0 ? { platzhalter } : {}),
    hinweis: fasseHinweiseZusammen([
      geteilterHinweis(
        "Liegt in der Mappe. Mit mappe_status siehst du, was noch fehlt. Gib den Inhalt NICHT " +
          "zusätzlich im Chat aus - der Bewerber bekommt ihn am Ende im Paket.",
        "Das habe ich zu deiner Mappe gelegt.",
      ),
      platzhalter.length > 0 ? platzhalterHinweis(art, platzhalter) : null,
    ]) as GeteilterHinweis,
  };
}
