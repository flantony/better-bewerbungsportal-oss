import { z } from "zod/v3";
import { erstelleMappe } from "../../mappe/mappeStore";
import { MAPPE_FRIST_MS } from "../../mappe/ablauf";
import { loadJobRecord } from "../lib/loadJobRecord";
import { getDocumentRequirements } from "./getDocumentRequirements";
import { anforderungenAus } from "../lib/mappenAnforderungen";
import { fasseHinweiseZusammen, geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";
import { ausweiskopieHinweis } from "../lib/ausweiskopieHinweis";
import { istAusweisUnterlage } from "../../mappe/ausweiskopie";
import { PUBLIC_SITE_URL } from "../publicSite";
import type { AngabeSchluessel } from "../../fillBewerbungsbogen";

export const eroeffneBewerbungsmappeInputSchema = {
  pinstGuid: z.string().min(1).describe("The pinstGuid identifier returned by list_jobs."),
};

const eingabe = z.object(eroeffneBewerbungsmappeInputSchema);
export type EroeffneBewerbungsmappeInput = z.infer<typeof eingabe>;

export interface MappenFormular {
  docId: string;
  attHeader: string;
  ausfuellbar: boolean;
  benoetigteAngaben?: AngabeSchluessel[];
  nichtVerwendeteAngaben?: AngabeSchluessel[];
  downloadUrl: string;
}

export interface EroeffneMappeResult {
  mappenId: string;
  uploadSeite: string;
  gueltigMinuten: number;
  benoetigteUnterlagen: string[];
  /**
   * Was die Ausschreibung verlangt, die Mappe aber nie annimmt
   * (Ausweiskopie) - der Bewerber legt es selbst bei. Steht deshalb nicht in
   * `benoetigteUnterlagen`, sonst liest ein Client es als Upload-Auftrag.
   */
  selbstBeilegen: string[];
  formulare: MappenFormular[];
  hinweis: GeteilterHinweis;
}

export async function eroeffneBewerbungsmappe(
  input: EroeffneBewerbungsmappeInput,
): Promise<EroeffneMappeResult> {
  const job = await loadJobRecord(input.pinstGuid);
  // Den geladenen Datensatz weitergeben, statt ihn drinnen erneut zu holen:
  // `loadJobRecord` liest zwei Dokumente, sonst waeren es vier statt zwei Reads
  // fuer dieselbe Ausschreibung im selben Aufruf.
  const anforderungen = await getDocumentRequirements({ pinstGuid: input.pinstGuid }, job);
  const mappenId = await erstelleMappe({
    pinstGuid: input.pinstGuid,
    refCode: job.refCode,
    titel: job.title,
    // Einmal berechnet, danach aus der Mappe gelesen - sonst ermittelte
    // `mappe_status` das bei jedem Pollen neu (s. `MappenAnforderungen`).
    anforderungen: anforderungenAus(job, anforderungen),
  });

  return {
    mappenId,
    uploadSeite: `${PUBLIC_SITE_URL}/mappe/${mappenId}`,
    gueltigMinuten: MAPPE_FRIST_MS / 60_000,
    benoetigteUnterlagen: anforderungen.geforderteUnterlagen.filter((unterlage) => !istAusweisUnterlage(unterlage)),
    selbstBeilegen: anforderungen.geforderteUnterlagen.filter(istAusweisUnterlage),
    formulare: anforderungen.bewerbungsboegen.map((bogen) => ({
      docId: bogen.docId,
      attHeader: bogen.attHeader,
      ausfuellbar: bogen.ausfuellbar,
      benoetigteAngaben: bogen.benoetigteAngaben,
      nichtVerwendeteAngaben: bogen.nichtVerwendeteAngaben,
      downloadUrl: bogen.downloadUrl,
    })),
    hinweis: fasseHinweiseZusammen([
      geteilterHinweis(
        "Die Mappe ist offen. Gib dem Bewerber `uploadSeite` als Link, damit er Zeugnisse und " +
          "andere fertige Dateien dort ablegt - durch diesen Aufruf passen sie nicht. Was du selbst " +
          "schreibst (Lebenslauf, Anschreiben), schickst du mit fuege_dokument_hinzu als TEXT. " +
          "Amtliche Formulare füllst du mit fuelle_formular; das Ergebnis landet in der Mappe, nicht " +
          "im Chat. Mit mappe_status siehst du, was angekommen ist und was fehlt. Die Kennung ist der " +
          "einzige Zugriffsschutz: behandle sie wie ein Passwort und schreibe sie nirgends hin außer " +
          "in den Link für den Bewerber.",
        "Ich habe eine Mappe für diese Bewerbung angelegt. Du bekommst am Ende ein einzelnes " +
          "Paket zum Herunterladen. Die Mappe wird eine Stunde nach dem Paket automatisch gelöscht, " +
          "und wenn es nie zu einem Paket kommt, eine Stunde nach der letzten Änderung. Es gibt kein " +
          "Konto, und niemand außer dir kommt an die Dateien.",
      ),
      // Keine Ausweiskopie ueber die Upload-Seite.
      ausweiskopieHinweis(anforderungen.geforderteUnterlagen),
    ]) as GeteilterHinweis,
  };
}
