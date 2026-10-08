import { artLabel, DOKUMENT_ARTEN, type DokumentArt, type MappenDokument } from "./mappeTypen";
import { bezeichneFuerClient } from "./mappeSicht";
import {
  abschnittAnhaenge,
  abschnittEinreichen,
  abschnittInformation,
  abschnittNochBeschaffen,
  abschnittPlatzhalter,
  abschnittUnterschreiben,
  abschnittVonHand,
  abschnittVordrucke,
  FUSS,
  type OffenePlatzhalter,
  type VonHandFormular,
} from "./merkzettel";
import type { AufgeteilteAnhaenge, AusschreibungsAnhang } from "./anhangArt";
import { bewerbungsschlussZeile } from "../lib/bewerbungsschluss";

const ENDUNG_JE_TYP: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

/** Der Inhaltstyp entscheidet, nicht der Dateiname des Bewerbers: ein Scan namens "scan" ist kein PDF. */
function endung(dokument: MappenDokument): string {
  const ausTyp = ENDUNG_JE_TYP[dokument.contentType];
  if (ausTyp) return ausTyp;
  const punkt = dokument.dateiname.lastIndexOf(".");
  return punkt > 0 ? dokument.dateiname.slice(punkt) : ".pdf";
}

function saeubere(dateiname: string): string {
  const punkt = dateiname.lastIndexOf(".");
  const stamm = punkt > 0 ? dateiname.slice(0, punkt) : dateiname;
  return stamm.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

/**
 * Benennt die Dateien im ZIP so, dass der Bewerber ohne Nachdenken sieht, was er
 * wem schickt - nummeriert in der Reihenfolge des Stapels (s. DOKUMENT_ARTEN),
 * nicht in der des Uploads. Der Originalname bleibt nur dort erhalten, wo eine
 * Art mehrfach vorkommt: "01_Zeugnis_Abitur.pdf" gegen "02_Zeugnis_Praktikum.pdf".
 *
 * ZWEI Namen je Eintrag, und die Trennung ist Absicht: `nameImZip` darf den
 * Dateinamen des Bewerbers tragen - das Paket geht an ihn selbst. `bezeichnung`
 * ist das, was der MCP-Client zu sehen bekommt, und traegt ihn deshalb nie (s.
 * `bezeichneFuerClient`).
 */
export function paketVerzeichnis(
  dokumente: MappenDokument[],
): { docId: string; nameImZip: string; bezeichnung: string }[] {
  const sortiert = [...dokumente].sort(
    (a, b) => DOKUMENT_ARTEN.indexOf(a.art) - DOKUMENT_ARTEN.indexOf(b.art) || a.hinzugefuegtAm - b.hinzugefuegtAm,
  );
  const anzahlJeArt = new Map<DokumentArt, number>();
  for (const dokument of sortiert) {
    anzahlJeArt.set(dokument.art, (anzahlJeArt.get(dokument.art) ?? 0) + 1);
  }

  const bezeichnungen = bezeichneFuerClient(sortiert);
  return sortiert.map((dokument, index) => {
    const nummer = String(index + 1).padStart(2, "0");
    const zusatz = (anzahlJeArt.get(dokument.art) ?? 0) > 1 ? `_${saeubere(dokument.dateiname)}` : "";
    return {
      docId: dokument.docId,
      nameImZip: `${nummer}_${artLabel(dokument.art)}${zusatz}${endung(dokument)}`,
      bezeichnung: bezeichnungen.get(dokument.docId) as string,
    };
  });
}

/**
 * Der Merkzettel WAS-NOCH-ZU-TUN.txt der transienten Mappe. Die Abschnitte
 * kommen aus mappe/merkzettel.ts - dieselben wie im Kontopaket.
 */
export function wasNochZuTun(input: {
  refCode: string;
  titel: string;
  bewerbungsschluss: string;
  /** Sagt der Ausschreibungstext, dass die Bewerbung jederzeit moeglich ist? Nur bei leerem Datum von Belang. */
  bewerbungJederzeit: boolean;
  /** Die Unterlagenliste der Ausschreibung - leer heisst "keine Liste", NICHT "nichts noetig". */
  geforderteUnterlagen: string[];
  fehlendeUnterlagen: string[];
  formulareImPaket: string[];
  vonHand: VonHandFormular[];
  /** Die Anhaenge, die nicht ausgefuellt im Paket liegen, nach Art aufgeteilt (s. `weitereAnhaenge`). */
  weitereAnhaenge: AufgeteilteAnhaenge<AusschreibungsAnhang>;
  ansprechperson: string;
  /** Platzhalter, die in selbst geschriebenen Texten stehen geblieben sind (nur Namen). */
  platzhalter?: OffenePlatzhalter[];
}): string {
  const platzhalter = abschnittPlatzhalter(input.platzhalter ?? []);
  const vordrucke = abschnittVordrucke(input.weitereAnhaenge);
  const vonHand = abschnittVonHand(input.vonHand);
  const pruefen = abschnittAnhaenge(input.weitereAnhaenge.pruefen.map((anhang) => anhang.attHeader));
  const information = abschnittInformation(input.weitereAnhaenge.information.map((anhang) => anhang.attHeader));

  return [
    `BEWERBUNG: ${input.titel}`,
    `Kennung der Ausschreibung: ${input.refCode}`,
    bewerbungsschlussZeile(input.bewerbungsschluss, input.bewerbungJederzeit),
    "",
    ...(platzhalter ? [platzhalter, ""] : []),
    abschnittUnterschreiben(input.formulareImPaket),
    "",
    ...(vordrucke ? [vordrucke, ""] : []),
    ...(vonHand ? [vonHand, ""] : []),
    abschnittNochBeschaffen(input.geforderteUnterlagen, input.fehlendeUnterlagen),
    "",
    ...(pruefen ? [pruefen, ""] : []),
    ...(information ? [information, ""] : []),
    abschnittEinreichen(input.refCode, input.ansprechperson),
    "",
    ...FUSS,
  ].join("\n");
}
