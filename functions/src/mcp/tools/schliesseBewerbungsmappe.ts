import { z } from "zod/v3";
import { ladeMappe, merkeZip } from "../../mappe/mappeStore";
import { mappenSicht } from "../../mappe/mappeSicht";
import { paketVerzeichnis, wasNochZuTun } from "../../mappe/paketVerzeichnis";
import { baueZip, legePaketAb, leseAusStorage } from "../../mappe/paket";
import { neuerEinmalToken } from "../../mappe/mappeId";
import { anforderungenFuerPaket } from "../lib/mappenAnforderungen";
import {
  anhaengeNichtImPaket,
  vonHandFuerFormulare,
  weitereAnhaenge,
  type VonHandFormular,
} from "../../mappe/merkzettel";
import { hinweisZuVordrucken } from "../lib/unterlagenHinweis";
import { KEINE_UNTERLAGENLISTE_FUER_BEWERBER } from "../lib/unterlagenHinweis";
import { fasseHinweiseZusammen, geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";
import { ausweiskopieHinweis } from "../lib/ausweiskopieHinweis";
import { FUNCTIONS_BASE_URL } from "../publicSite";
import { MAPPE_FRIST_MS } from "../../mappe/ablauf";
import { BEWERBUNGSPORTAL_URL, einreichenSchritte } from "../../lib/einreichen";
import { mappenIdFeld } from "../lib/eingabeGrenzen";

export const schliesseBewerbungsmappeInputSchema = {
  mappenId: mappenIdFeld,
};

const eingabe = z.object(schliesseBewerbungsmappeInputSchema);
export type SchliesseBewerbungsmappeInput = z.infer<typeof eingabe>;

export interface SchliesseBewerbungsmappeResult {
  downloadUrl: string;
  gueltigMinuten: number;
  enthalten: string[];
  fehlt: string[];
  /**
   * Was die Ausschreibung verlangt, die Mappe aber nicht
   * annimmt (Ausweiskopie) - der Bewerber legt es selbst bei.
   */
  selbstBeilegen: string[];
  zuUnterschreiben: string[];
  /**
   * Nur gesetzt, wenn die Ausschreibung keine Unterlagenliste hatte: dann ist
   * `fehlt` leer, weil wir nichts vergleichen konnten - nicht, weil nichts
   * fehlt. Ein leeres Array allein liest jede KI als "vollstaendig".
   */
  fehltHinweis?: GeteilterHinweis;
  /** Anhaenge der Ausschreibung, die nicht ausgefuellt im Paket liegen - alle, aufgeteilt in den zwei Feldern danach. */
  anhaengeNichtImPaket: string[];
  /**
   * Vordrucke daraus, die der Bewerber selbst ausfuellt, unterschreibt und mit
   * einreicht (z. B. "Anlage 1 zum Bewerbungsbogen", s. mappe/anhangArt.ts).
   * Ohne sie ist die Bewerbung unvollstaendig. `downloadUrl` fehlt, wenn zum
   * Anhang keine bekannt ist.
   */
  selbstAuszufuellen: { titel: string; downloadUrl?: string }[];
  /** Informationsmaterial daraus (Broschueren, Factsheets) - nicht mitzuschicken. */
  zurInformation: string[];
  /**
   * Der Rest - nicht sicher einzuordnen oder ein nicht ausgefuellter
   * Bewerbungsbogen. Ob einer davon mitmuss, prueft der Bewerber selbst.
   */
  zuPruefen: string[];
  /** Wie und wo eingereicht wird, ganze Saetze (s. lib/einreichen.ts). */
  einreichen: string[];
  /** Je ausgefuelltem Vordruck die Felder, die der Bewerber von Hand eintragen muss (Feldnamen, nie Werte). */
  vonHandErgaenzen: VonHandFormular[];
  /**
   * Nur wenn vorhanden: je Dokument die Platzhalter in eckigen Klammern, die
   * beim Ablegen noch im Text standen ("[Telefon]") - sie stehen so im PDF.
   */
  offenePlatzhalter?: { dokument: string; platzhalter: string[] }[];
  hinweis: GeteilterHinweis;
}

export async function schliesseBewerbungsmappe(
  input: SchliesseBewerbungsmappeInput,
): Promise<SchliesseBewerbungsmappeResult> {
  const mappe = await ladeMappe(input.mappenId);
  // Aus dem Schnappschuss der Mappe: Bewerbungsschluss und Unterlagenliste
  // stehen seit dem Eroeffnen im Datensatz (s. `MappenAnforderungen`), die
  // Ausschreibung muss dafuer nicht erneut geladen werden.
  const anforderungen = await anforderungenFuerPaket(mappe);
  const sicht = mappenSicht(mappe, anforderungen.geforderteUnterlagen);
  const verzeichnis = paketVerzeichnis(mappe.dokumente);
  const formulare = verzeichnis.filter(
    (eintrag) => mappe.dokumente.find((d) => d.docId === eintrag.docId)?.art === "formular",
  );
  // Zwei Listen desselben Bestands, an zwei verschiedene Leser: der Merkzettel
  // liegt IM Paket und nennt darum die ZIP-Dateinamen, damit der Bewerber die
  // Datei wiederfindet. Der Rueckgabewert nennt Bezeichnungen - dort liest ein
  // fremdes KI-Tool mit, und der ZIP-Name kann den Dateinamen des Bewerbers
  // tragen (s. paketVerzeichnis).
  const zuUnterschreibenImZip = formulare.map((eintrag) => eintrag.nameImZip);
  const zuUnterschreiben = formulare.map((eintrag) => eintrag.bezeichnung);

  // `formularstand` ist nach der VORLAGE geschluesselt (s. fuelle_formular) -
  // daraus und aus den Anhaengen des Schnappschusses ergibt sich, welcher
  // Vordruck ausgefuellt im Paket liegt. Dieselben zwei Listen gehen in den
  // Merkzettel und in den Rueckgabewert: was der Bewerber auf Papier liest,
  // soll seine KI ihm auch sagen koennen.
  const ausgefuellteVorlagen = Object.keys(mappe.formularstand);
  const vonHandErgaenzen = vonHandFuerFormulare(
    Object.entries(mappe.formularstand).map(([docId, stand]) => ({
      attHeader: anforderungen.anhaenge.find((anhang) => anhang.docId === docId)?.attHeader ?? "",
      fehlendeAngaben: stand.fehlendeAngaben,
    })),
    anforderungen.laufbahngruppen,
  );
  const nichtImPaket = anhaengeNichtImPaket(anforderungen.anhaenge, ausgefuellteVorlagen);
  // Dieselben Anhaenge nach Art (s. mappe/anhangArt.ts): Pflichtvordrucke wie
  // "Anlage 1 zum Bewerbungsbogen" getrennt von Broschueren.
  const aufgeteilt = weitereAnhaenge(anforderungen.anhaenge, ausgefuellteVorlagen);
  const vordruckHinweis = hinweisZuVordrucken(
    aufgeteilt.ausfuellen.map((anhang) => anhang.attHeader),
    aufgeteilt.beiblaetter.map((anhang) => anhang.attHeader),
  );

  // Platzhalter wie "[Telefon]" gingen sonst unbemerkt ins PDF.
  // fuege_dokument_hinzu hat ihre NAMEN am Dokument vermerkt - wieder zwei
  // Listen an zwei Leser: ZIP-Name im Merkzettel, Bezeichnung in der Antwort.
  const mitPlatzhaltern = verzeichnis.flatMap((eintrag) => {
    const platzhalter = mappe.dokumente.find((d) => d.docId === eintrag.docId)?.platzhalter ?? [];
    return platzhalter.length > 0 ? [{ eintrag, platzhalter }] : [];
  });
  const offenePlatzhalter = mitPlatzhaltern.map(({ eintrag, platzhalter }) => ({
    dokument: eintrag.bezeichnung,
    platzhalter,
  }));
  const ohneUnterlagenliste = anforderungen.geforderteUnterlagen.length === 0;

  const merkzettel = wasNochZuTun({
    refCode: mappe.refCode,
    titel: mappe.titel,
    bewerbungsschluss: anforderungen.bewerbungsschluss,
    bewerbungJederzeit: anforderungen.bewerbungJederzeit,
    geforderteUnterlagen: anforderungen.geforderteUnterlagen,
    fehlendeUnterlagen: sicht.fehlendeUnterlagen,
    formulareImPaket: zuUnterschreibenImZip,
    vonHand: vonHandErgaenzen,
    weitereAnhaenge: aufgeteilt,
    ansprechperson: anforderungen.unterlagenHinweise || "",
    platzhalter: mitPlatzhaltern.map(({ eintrag, platzhalter }) => ({ ort: `In ${eintrag.nameImZip}`, platzhalter })),
  });

  await legePaketAb(input.mappenId, await baueZip(mappe.dokumente, merkzettel, leseAusStorage));
  const token = neuerEinmalToken();
  await merkeZip(input.mappenId, token);

  return {
    downloadUrl: `${FUNCTIONS_BASE_URL}/mappeDownload?mappe=${input.mappenId}&token=${token}`,
    gueltigMinuten: MAPPE_FRIST_MS / 60_000,
    enthalten: verzeichnis.map((eintrag) => eintrag.bezeichnung),
    fehlt: sicht.fehlendeUnterlagen,
    selbstBeilegen: sicht.selbstBeilegen,
    zuUnterschreiben,
    ...(ohneUnterlagenliste
      ? {
          fehltHinweis: geteilterHinweis(
            "`fehlt` ist leer, weil diese Ausschreibung keine Unterlagenliste hat, die wir auswerten konnten - " +
              "NICHT, weil nichts fehlt. Sag dem Bewerber nicht, das Paket sei vollständig. Nenne Anschreiben, " +
              "tabellarischen Lebenslauf und Zeugniskopien als das allgemein Übliche und verweise für das " +
              "Verbindliche auf den Ausschreibungstext (get_job: `contactDesc`, `remarcDesc`) bzw. die " +
              "Karriereberatung.",
            KEINE_UNTERLAGENLISTE_FUER_BEWERBER,
          ),
        }
      : {}),
    anhaengeNichtImPaket: nichtImPaket,
    selbstAuszufuellen: aufgeteilt.ausfuellen.map((anhang) => ({
      titel: anhang.attHeader,
      ...(anhang.downloadUrl ? { downloadUrl: anhang.downloadUrl } : {}),
    })),
    zurInformation: aufgeteilt.information.map((anhang) => anhang.attHeader),
    zuPruefen: aufgeteilt.pruefen.map((anhang) => anhang.attHeader),
    einreichen: einreichenSchritte(mappe.refCode),
    vonHandErgaenzen,
    ...(offenePlatzhalter.length > 0 ? { offenePlatzhalter } : {}),
    hinweis: fasseHinweiseZusammen([
      geteilterHinweis(
        "Gib dem Bewerber `downloadUrl` als Link. Der Link gilt EINMAL - laedt er nicht durch, rufe " +
          "dieses Werkzeug erneut auf, dann gibt es einen frischen. Sag ihm ausserdem, was in `fehlt` " +
          "steht (bei `fehltHinweis`: dass es keine Liste gab), dass die Formulare aus `zuUnterschreiben` " +
          "von Hand zu unterschreiben sind, welche Felder er laut `vonHandErgaenzen` selbst eintragen muss " +
          "und wie er einreicht (`einreichen`, mit der Adresse des Portals). Die Anhaenge der Ausschreibung " +
          "stehen in drei Listen: `selbstAuszufuellen` gehoert zur Bewerbung (s. `vordruckHinweis`), " +
          "`zurInformation` ist nur Lesestoff, und bei `zuPruefen` soll er selbst pruefen, ob einer davon " +
          "ausgefuellt mitmuss - rate nicht, welcher. Alles steht auch als WAS-NOCH-ZU-TUN.txt im Paket. " +
          "Die Mappe wird eine Stunde nach diesem Aufruf geloescht.",
        "Dein Paket ist fertig. Der Link gilt nur einmal. Lade es gleich herunter und heb die Datei auf: " +
          "eine Stunde nach dem Erstellen lösche ich alles wieder. Im Paket liegt eine Datei " +
          "WAS-NOCH-ZU-TUN.txt, die sagt, was du noch unterschreiben, von Hand ergänzen und beschaffen musst. " +
          `Du reichst die Bewerbung im offiziellen Bewerbungsportal der Bundeswehr ein (${BEWERBUNGSPORTAL_URL}). Wie ` +
          "genau, steht ebenfalls in der Datei.",
      ),
      offenePlatzhalter.length > 0
        ? geteilterHinweis(
            "In `offenePlatzhalter` stehen Platzhalter, die noch so im PDF stehen. Sag dem Bewerber, welche - " +
              "er muss sie vor dem Einreichen ersetzen.",
            `Achtung: In ${offenePlatzhalter.map((o) => `„${o.dokument}“ (${o.platzhalter.join(", ")})`).join(" und ")} ` +
              "stehen noch Platzhalter in eckigen Klammern. Ersetze sie, bevor du die Bewerbung einreichst.",
          )
        : null,
      vordruckHinweis,
      ausweiskopieHinweis(anforderungen.geforderteUnterlagen),
    ]) as GeteilterHinweis,
  };
}
