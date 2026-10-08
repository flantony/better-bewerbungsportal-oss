import { z } from "zod/v3";
import { fuegeDokumentEin, ladeMappe, setzeFormularstand } from "../../mappe/mappeStore";
import { loadJobDocuments, readStoredDocument } from "../../jobDocumentStore";
import { loadJobRecord } from "../lib/loadJobRecord";
import {
  angabenFuerVariante,
  detectBewerbungsbogenVariant,
  fillBewerbungsbogen,
  type BewerbungsbogenFillValues,
} from "../../fillBewerbungsbogen";
import { neuerEinmalToken } from "../../mappe/mappeId";
import { mappenBestand, type MappenDokument } from "../../mappe/mappeTypen";
import { MappeVollError, pruefeFreienPlatz } from "../../mappe/uploadRegeln";
import { geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";
import { HinweisFehler } from "../../lib/hinweisFehler";
import { angabeFeld, mappenIdFeld, MAX_ANGABE_ZEICHEN, MAX_NAME_ZEICHEN, zuLangMeldung } from "../lib/eingabeGrenzen";

// Jedes Feld ist beschrieben, und jede Beschreibung sagt ausdrücklich, dass der
// Wert vom Nutzer kommt. Das ist kein Schmuck, sondern die Stelle, an der
// halluzinierte Personendaten in einem amtlichen Formular verhindert werden -
// s. auch die APPLICANT-DATA-Regel in instructions.ts.
export const fuelleFormularInputSchema = {
  mappenId: mappenIdFeld,
  docId: z
    .string()
    .min(1)
    .max(64, "docId is too long - copy it unchanged from `formulare` in the answer of eroeffne_bewerbungsmappe.")
    .describe("Which form to fill — the docId from eroeffne_bewerbungsmappe's `formulare`."),
  nachname: angabeFeld("nachname", MAX_NAME_ZEICHEN).describe(
    "Applicant's surname as written in their ID document. Ask the user; never guess.",
  ),
  vorname: angabeFeld("vorname", MAX_NAME_ZEICHEN).describe(
    "Applicant's given name as written in their ID document. Ask the user; never guess.",
  ),
  geburtsdatumLabel: angabeFeld("geburtsdatumLabel", 20).describe(
    "Applicant's date of birth in DD.MM.YYYY form, as stated by the user. Never estimate.",
  ),
  // Diese sechs hat NICHT jede Vorlage (der Karrierebogen kennt weder Telefon
  // noch Adresse). Sie sind deshalb optional, und was die konkrete Vorlage
  // braucht, sagt `benoetigteAngaben` aus get_document_requirements - siehe
  // angabenFuerVariante() in fillBewerbungsbogen.ts.
  telefon: angabeFeld("telefon", 40)
    .optional()
    .describe("Phone number for callbacks, exactly as the applicant writes it. Ask only if this form's `benoetigteAngaben` lists it."),
  email: z
    .string()
    .max(254, zuLangMeldung("email", 254))
    .email()
    .optional()
    .describe("Applicant's email address. Ask only if this form's `benoetigteAngaben` lists it."),
  geburtsort: angabeFeld("geburtsort", MAX_NAME_ZEICHEN)
    .optional()
    .describe("Applicant's place of birth (city). Ask only if this form's `benoetigteAngaben` lists it."),
  strasse: angabeFeld("strasse", MAX_NAME_ZEICHEN)
    .optional()
    .describe("Street and house number of the applicant's address. Ask only if this form's `benoetigteAngaben` lists it."),
  plz: angabeFeld("plz", 10)
    .optional()
    .describe("German 5-digit postal code of the applicant's address. Ask only if this form's `benoetigteAngaben` lists it."),
  ort: angabeFeld("ort", MAX_NAME_ZEICHEN)
    .optional()
    .describe("City of the applicant's address. Ask only if this form's `benoetigteAngaben` lists it."),
  // Der amtliche Vordruck hat ein Feld fuer die Staatsangehoerigkeit (s.
  // DSFA.md). Ohne die Angabe geht ein Formular mit leerem Pflichtfeld hinaus,
  // und der Bewerber merkt es erst beim Karriereberatungsbuero. Art.-9-Daten
  // bleiben es: nie gespeichert, nie geloggt, nur fuer diesen einen Aufruf
  // verwendet.
  staatsangehoerigkeit: angabeFeld("staatsangehoerigkeit", MAX_NAME_ZEICHEN)
    .optional()
    .describe("Applicant's nationality, as stated by the user. Ask only if this form's `benoetigteAngaben` lists it."),
  studienabschluss: z
    .string()
    .max(MAX_ANGABE_ZEICHEN, zuLangMeldung("studienabschluss", MAX_ANGABE_ZEICHEN))
    .optional()
    .describe("Optional academic degree, only if the user states one (e.g. 'B.Sc. Informatik')."),
  fuehrerschein: z
    .string()
    .max(MAX_ANGABE_ZEICHEN, zuLangMeldung("fuehrerschein", MAX_ANGABE_ZEICHEN))
    .optional()
    .describe("Optional driving licence classes, only if the user states them (e.g. 'B, BE')."),
};

const eingabe = z.object(fuelleFormularInputSchema);
export type FuelleFormularInput = z.infer<typeof eingabe>;

export interface FuelleFormularResult {
  // Verschachtelt wie bei fuege_dokument_hinzu: `docId` in der Eingabe meint
  // die VORLAGE, `dokument.docId` das neu erzeugte Ergebnis in der Mappe -
  // gleicher Name, andere Bedeutung, deshalb nicht auf gleicher Ebene.
  dokument: { docId: string; dateiname: string };
  gefuellteFelder: number;
  fehlendeAngaben: string[];
  partialFillNote?: string;
  hinweis: GeteilterHinweis;
}

export async function fuelleFormular(input: FuelleFormularInput): Promise<FuelleFormularResult> {
  const mappe = await ladeMappe(input.mappenId);
  const job = await loadJobRecord(mappe.pinstGuid);
  const gespeichert = await loadJobDocuments(job.dokumente ?? []);
  const vorlage = gespeichert.find((dokument) => dokument.docId === input.docId);
  if (!vorlage) {
    throw new HinweisFehler(
      `Zu dieser Ausschreibung gehört kein Formular mit der docId "${input.docId}". Die gültigen docIds stehen in \`formulare\` aus eroeffne_bewerbungsmappe.`,
    );
  }

  const variante = detectBewerbungsbogenVariant(vorlage.attHeader);
  if (!variante) {
    throw new HinweisFehler(
      `"${vorlage.attHeader}" kann dieser Server nicht ausfüllen. Gib dem Bewerber den Blankolink aus eroeffne_bewerbungsmappe und sammle KEINE Angaben dafür ein.`,
    );
  }

  // Vor dem teuren Ausfuellen: ist ueberhaupt noch Platz? Ein frueher
  // ausgefuelltes Exemplar DIESER Vorlage zaehlt nicht, es wird ersetzt.
  // Verbindlich prueft erst die Transaktion in fuegeDokumentEin.
  const ersetzt = (vorhanden: MappenDokument) =>
    vorhanden.herkunft === "formular" && vorhanden.vorlageDocId === input.docId;
  const platz = pruefeFreienPlatz(mappenBestand({ dokumente: mappe.dokumente.filter((d) => !ersetzt(d)) }));
  if (!platz.ok) throw new MappeVollError(platz.grund);

  const { mappenId: _m, docId: _d, ...angaben } = input;
  const werte: BewerbungsbogenFillValues = {
    ...angaben,
    ausschreibungId: mappe.refCode,
    ausschreibungTitel: mappe.titel,
  };
  const ergebnis = await fillBewerbungsbogen(await readStoredDocument(vorlage.storagePath), werte, vorlage.attHeader);

  const dateiname = `Bewerbungsbogen_${mappe.refCode}.pdf`;
  const dokument = await fuegeDokumentEin(
    input.mappenId,
    {
      docId: neuerEinmalToken(),
      art: "formular",
      dateiname,
      contentType: "application/pdf",
      sizeBytes: ergebnis.bytes.byteLength,
      herkunft: "formular",
      vorlageDocId: input.docId,
    },
    ergebnis.bytes,
    ersetzt,
  );

  const gefuellt = angabenFuerVariante(variante).benoetigt.length - ergebnis.fehlendeAngaben.length;
  await setzeFormularstand(input.mappenId, input.docId, {
    gefuellt,
    fehlendeAngaben: ergebnis.fehlendeAngaben,
  });

  return {
    dokument: { docId: dokument.docId, dateiname },
    gefuellteFelder: gefuellt,
    fehlendeAngaben: ergebnis.fehlendeAngaben,
    ...(ergebnis.partialFillNote ? { partialFillNote: ergebnis.partialFillNote } : {}),
    hinweis: geteilterHinweis(
      "Das ausgefuellte Formular liegt in der Mappe - gib es NICHT im Chat aus, der Bewerber bekommt " +
        "es im Paket. Stehen in `fehlendeAngaben` noch Felder, sag dem Bewerber welche und frag sie " +
        "nach; ein zweiter Aufruf ersetzt das Formular, braucht dann aber ALLE Angaben erneut, weil " +
        "wir keine speichern." +
        // Ohne diesen Satz liest kein Client `partialFillNote` - eine Regel, die
        // nur im Sonderfall greift, gehoert in den Rueckgabewert, nicht in die
        // Instructions. Nur angehaengt,
        // wenn das Feld gesetzt ist - sonst waere es eine Behauptung auf Verdacht.
        (ergebnis.partialFillNote
          ? " In `partialFillNote` steht, welche Teile dieses Vordrucks der Server bewusst NICHT " +
            "ausfuellt - gib diesen Text wörtlich an den Bewerber weiter, er muss diese Teile von " +
            "Hand ergaenzen."
          : ""),
      ergebnis.fehlendeAngaben.length > 0
        ? "Ich habe das Formular ausgefüllt, ein paar Felder sind aber noch offen."
        : "Das Formular ist ausgefüllt und liegt in deiner Mappe.",
    ),
  };
}
