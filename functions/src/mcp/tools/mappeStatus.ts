import { z } from "zod/v3";
import { ladeMappe } from "../../mappe/mappeStore";
import { mappenSicht, type MappenSicht } from "../../mappe/mappeSicht";
import { anforderungenFuerMappe } from "../lib/mappenAnforderungen";
import { fasseHinweiseZusammen, geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";
import { ausweiskopieHinweis } from "../lib/ausweiskopieHinweis";
import { mappenIdFeld } from "../lib/eingabeGrenzen";

export const mappeStatusInputSchema = {
  mappenId: mappenIdFeld,
};

const eingabe = z.object(mappeStatusInputSchema);
export type MappeStatusInput = z.infer<typeof eingabe>;

export interface MappeStatusResult extends MappenSicht {
  titel: string;
  refCode: string;
  hinweis: GeteilterHinweis;
}

export async function mappeStatus(input: MappeStatusInput): Promise<MappeStatusResult> {
  const mappe = await ladeMappe(input.mappenId);
  // Aus der Mappe, nicht neu berechnet: das ist der Aufruf, den ein Client
  // waehrend des Wartens auf den Upload dutzendfach wiederholt, und die
  // Anforderungen der Ausschreibung aendern sich in dieser Stunde nicht (s.
  // `MappenAnforderungen`). Neu berechnet kostete jedes Pollen 4 Reads statt 1.
  const anforderungen = await anforderungenFuerMappe(mappe);
  const sicht = mappenSicht(mappe, anforderungen.geforderteUnterlagen);

  const offen = sicht.fehlendeUnterlagen.length + sicht.offeneFormulare.length;
  // Ohne Unterlagenliste ist `fehlendeUnterlagen` leer, weil es nichts zu
  // vergleichen gab - "vollstaendig" waere dann eine Behauptung ohne Grundlage.
  if (offen === 0 && anforderungen.geforderteUnterlagen.length === 0) {
    return {
      ...sicht,
      titel: mappe.titel,
      refCode: mappe.refCode,
      hinweis: geteilterHinweis(
        "Keine offenen Formularangaben. `fehlendeUnterlagen` ist aber nur leer, weil diese Ausschreibung keine " +
          "Unterlagenliste hat, die wir auswerten konnten - nicht, weil nichts fehlt. Sag dem Bewerber nicht, " +
          "die Mappe sei vollständig: frag, ob Anschreiben, Lebenslauf und Zeugniskopien (das Übliche) drin " +
          "sind, und rufe dann schliesse_bewerbungsmappe.",
        "Was die Ausschreibung genau verlangt, konnten wir nicht herauslesen. Üblich sind Anschreiben, " +
          "Lebenslauf und Zeugniskopien. Wenn das drin ist, kann ich das Paket zusammenstellen.",
      ),
    };
  }
  // `selbstBeilegen` (Ausweiskopie) zaehlt nicht als offen: die Mappe
  // nimmt sie nicht an, der Bewerber legt sie selbst bei.
  // "vollstaendig" nur, wenn auch nichts selbst beizulegen bleibt - sonst
  // widerspraeche der Satz dem Hinweis zur Ausweiskopie direkt dahinter.
  const fertigSatz =
    sicht.selbstBeilegen.length === 0
      ? "Deine Mappe ist vollständig. Ich kann das Paket jetzt zusammenstellen."
      : "Alles, was in die Mappe gehört, ist da. Ich kann das Paket jetzt zusammenstellen.";
  const stand = geteilterHinweis(
    offen === 0
      ? "Nichts offen. Rufe schliesse_bewerbungsmappe, um das Paket zu bauen."
      : "Noch offen: `fehlendeUnterlagen` beschafft der Bewerber (Upload-Seite) oder du schreibst sie " +
          "(fuege_dokument_hinzu mit Text). `offeneFormulare` nennt die Angaben, die dir für ein " +
          "Formular fehlen - frag sie in EINER gebündelten Frage ab und rufe dann fuelle_formular. " +
          "Hat der Bewerber gerade hochgeladen und du siehst die Datei nicht, rufe dieses Werkzeug " +
          "erneut; der Upload läuft über die Seite, nicht durch das Gespräch.",
    offen === 0 ? fertigSatz : "Es fehlt noch etwas in deiner Mappe.",
  );
  return {
    ...sicht,
    titel: mappe.titel,
    refCode: mappe.refCode,
    hinweis: fasseHinweiseZusammen([stand, ausweiskopieHinweis(anforderungen.geforderteUnterlagen)]) as GeteilterHinweis,
  };
}
