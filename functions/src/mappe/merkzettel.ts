/**
 * Bausteine des Merkzettels WAS-NOCH-ZU-TUN.txt - EINE Quelle fuer beide
 * Pakete: die transiente Mappe (`wasNochZuTun`, paketVerzeichnis.ts) und das
 * Kontopaket (`merkzettel`, konto/bewerbung.ts). Getrennt gepflegte Saetze
 * laufen auseinander - etwa so, dass eine Mappe Vollstaendigkeit behauptet fuer
 * eine Ausschreibung, zu der wir gar keine Unterlagenliste haben.
 *
 * DSGVO: hier gehen nur oeffentliche Ausschreibungsdaten (Anhangsnamen,
 * Laufbahngruppe) und Feldnamen der Vordrucke durch - nie ein Feldwert.
 */
import { detectBewerbungsbogenVariant, vonHandZuErgaenzen } from "../fillBewerbungsbogen";
import { KEINE_UNTERLAGENLISTE_FUER_BEWERBER } from "../mcp/lib/unterlagenHinweis";
import { READABLE_LAUFBAHNGRUPPE_BY_CODE } from "../mcp/lib/filterOptions";
import { einreichenSchritte } from "../lib/einreichen";
import { teileAnhaengeAuf, type AufgeteilteAnhaenge, type AusschreibungsAnhang } from "./anhangArt";
import { AUSWEISKOPIE_HINWEIS, verlangtAusweiskopie } from "./ausweiskopie";
import type { JobSummaryRecord } from "../types";

/** Was in einem ausgefuellten Vordruck noch fehlt - auch der Rueckgabewert an den MCP-Client. */
export interface VonHandFormular {
  formular: string;
  felder: string[];
}

const ZEILENBREITE = 84;

/** Bricht einen Satz in eingerueckte Zeilen um - der Zettel wird in einem Texteditor gelesen. */
function eingerueckt(text: string, einzug = "  "): string {
  const zeilen: string[] = [];
  let zeile = "";
  for (const wort of text.split(/\s+/)) {
    if (zeile && einzug.length + zeile.length + 1 + wort.length > ZEILENBREITE) {
      zeilen.push(einzug + zeile);
      zeile = wort;
    } else {
      zeile = zeile ? `${zeile} ${wort}` : wort;
    }
  }
  if (zeile) zeilen.push(einzug + zeile);
  return zeilen.join("\n");
}

function aufzaehlung(eintraege: string[], einzug = "  "): string {
  return eintraege.map((eintrag) => eingerueckt(eintrag, `${einzug}  `).replace(/^(\s*) {2}/, `$1- `)).join("\n");
}

/** Der Text, wenn wir keine Unterlagenliste haben - wortgleich mit `get_document_requirements`. */
export function keineUnterlagenliste(): string {
  return eingerueckt(KEINE_UNTERLAGENLISTE_FUER_BEWERBER);
}

/**
 * Die Zeile zur Ausweiskopie, als Aufzaehlungspunkt - nur wenn die
 * Unterlagenliste eine verlangt. Wir nehmen keine entgegen
 * (s. ausweiskopie.ts); der Bewerber legt sie selbst bei. Fuer beide Pakete.
 */
export function ausweiskopieZeile(geforderteUnterlagen: string[]): string | null {
  return verlangtAusweiskopie(geforderteUnterlagen) ? aufzaehlung([AUSWEISKOPIE_HINWEIS]) : null;
}

/**
 * "Vollstaendig" darf hier NUR stehen, wenn es eine Liste gab und nichts
 * daraus fehlt. Ohne Liste ist "es fehlt nichts" nicht belegt - und genau das
 * ist der Satz, nach dem der Bewerber aufhoert zu suchen. Eine verlangte
 * Ausweiskopie steht nie in `fehlendeUnterlagen` (s. `mappenSicht`), fehlt dem
 * Paket aber trotzdem - dann also auch nicht "vollstaendig".
 */
export function abschnittNochBeschaffen(geforderteUnterlagen: string[], fehlendeUnterlagen: string[]): string {
  if (geforderteUnterlagen.length === 0) return `NOCH BESCHAFFEN\n${keineUnterlagenliste()}`;
  const ausweis = ausweiskopieZeile(geforderteUnterlagen);
  if (fehlendeUnterlagen.length === 0 && !ausweis) {
    return "NOCH BESCHAFFEN\n  Nichts. Nach der Unterlagenliste dieser Ausschreibung ist das Paket vollständig.";
  }
  return [
    "NOCH BESCHAFFEN",
    ...(fehlendeUnterlagen.length > 0 ? [aufzaehlung(fehlendeUnterlagen)] : []),
    ...(ausweis ? [ausweis] : []),
  ].join("\n");
}

/**
 * Anhaenge der Ausschreibung, die nicht ausgefuellt im Paket liegen - die
 * Namen aller, fuer den Rueckgabewert `anhaengeNichtImPaket`. Welcher davon
 * zur Bewerbung gehoert, sagt `weitereAnhaenge`.
 */
export function anhaengeNichtImPaket(
  anhaenge: { docId: string; attHeader: string }[],
  ausgefuellteVorlagen: string[],
): string[] {
  return anhaenge.filter((anhang) => !ausgefuellteVorlagen.includes(anhang.docId)).map((anhang) => anhang.attHeader);
}

/**
 * Dieselben Anhaenge, aufgeteilt nach Art (s. anhangArt.ts): Vordrucke zum
 * Ausfuellen und Unterschreiben, Beiblaetter dazu, Informationsmaterial und
 * der Rest, den der Bewerber selbst pruefen muss.
 */
export function weitereAnhaenge<T extends AusschreibungsAnhang>(
  anhaenge: T[],
  ausgefuellteVorlagen: string[],
): AufgeteilteAnhaenge<T> {
  return teileAnhaengeAuf(anhaenge.filter((anhang) => !ausgefuellteVorlagen.includes(anhang.docId)));
}

/**
 * "Anlage 1 zum Bewerbungsbogen" darf nicht gleichrangig neben einer
 * Infobroschuere stehen - ohne sie ist die Bewerbung unvollstaendig. Steht
 * deshalb direkt nach UNTERSCHREIBEN, mit Link. Wir
 * fuellen diese Vordrucke nie aus (Anlage 1 fragt nach Parteien und
 * Vereinigungen - Art.-9-nah) und sagen das.
 */
export function abschnittVordrucke(teile: Pick<AufgeteilteAnhaenge<AusschreibungsAnhang>, "ausfuellen" | "beiblaetter">): string | null {
  if (teile.ausfuellen.length === 0) return null;
  const vordrucke = teile.ausfuellen.map((anhang) =>
    anhang.downloadUrl ? `  - ${anhang.attHeader}\n    Download: ${anhang.downloadUrl}` : `  - ${anhang.attHeader}`,
  );
  return [
    "AUSFÜLLEN UND UNTERSCHREIBEN (gehört zur Bewerbung)",
    eingerueckt(
      "Diese Vordrucke der Ausschreibung füllen wir nicht aus und sie liegen nicht im Paket. Lade sie " +
        "herunter, fülle sie von Hand aus, unterschreibe sie und reiche sie mit der Bewerbung ein:",
    ),
    ...vordrucke,
    ...(teile.beiblaetter.length > 0
      ? [eingerueckt("Zum Nachschlagen dafür (nicht ausfüllen):"), aufzaehlung(teile.beiblaetter.map((b) => b.attHeader))]
      : []),
    eingerueckt(
      "Steht auf einem Vordruck, dass er nur in bestimmten Fällen gilt (z. B. bei Minderjährigen), richte dich danach.",
    ),
  ].join("\n");
}

/** Anhaenge, die sich nicht sicher einordnen lassen - neutral, der Bewerber prueft selbst. */
export function abschnittAnhaenge(anhaenge: string[]): string | null {
  if (anhaenge.length === 0) return null;
  return [
    "WEITERE DATEIEN DER AUSSCHREIBUNG",
    eingerueckt(
      "Der Ausschreibung liegen auch diese Dateien bei. Ob eine davon ausgefüllt mitgeschickt werden " +
        "muss, können wir nicht sicher sagen. Prüf das bitte selbst:",
    ),
    aufzaehlung(anhaenge),
  ].join("\n");
}

/** Informationsmaterial der Ausschreibung - lesenswert, nicht mitzuschicken. */
export function abschnittInformation(anhaenge: string[]): string | null {
  if (anhaenge.length === 0) return null;
  return [
    "ZUR INFORMATION",
    eingerueckt("Diese Dateien der Ausschreibung sind Informationsmaterial, das du nicht mitschicken musst:"),
    aufzaehlung(anhaenge),
  ].join("\n");
}

/**
 * Die ausgefuellten amtlichen Vordrucke im Paket, unter dem Namen, unter dem
 * der Bewerber sie im ZIP findet (nicht "Bewerbungsbogen_Militärisch", wenn im
 * ZIP "03_Bewerbungsbogen.pdf" liegt).
 */
export function abschnittUnterschreiben(formulareImPaket: string[]): string {
  if (formulareImPaket.length === 0) {
    return "UNTERSCHREIBEN\n  In diesem Paket liegt kein Vordruck, den du unterschreiben musst.";
  }
  return [
    "UNTERSCHREIBEN",
    "  Die amtlichen Vordrucke haben kein digitales Unterschriftsfeld. Druck sie aus,",
    "  unterschreib sie von Hand und scanne sie dann ein oder schick sie mit:",
    aufzaehlung(formulareImPaket),
  ].join("\n");
}

export const FUSS = [
  "Dieses Paket stammt von Better Bewerbungsportal, einem unabhängigen privaten",
  "Projekt, und nicht von der Bundeswehr. Prüfe die Angaben, bevor du sie einreichst.",
];

/**
 * Der Einreichweg, fuer beide Pakete gleich (Text aus lib/einreichen.ts).
 * `ansprechperson` ist nie ein Name aus contactDesc, sondern ein Verweis.
 */
export function abschnittEinreichen(refCode: string, ansprechperson: string): string {
  return [
    "EINREICHEN",
    eingerueckt("Die Bewerbung reichst du selbst bei der Bundeswehr ein:"),
    aufzaehlung(einreichenSchritte(refCode)),
    eingerueckt(`Bei Fragen: ${ansprechperson || "die in der Ausschreibung genannte Ansprechperson"}`),
  ].join("\n");
}

/**
 * Je ausgefuelltem Vordruck die Felder, die der Bewerber selbst eintragen muss.
 * Eine Vorlage ohne bekannte Variante liefert nichts - sie kann gar nicht
 * ausgefuellt im Paket liegen, und erfundene Feldnamen waeren schlimmer als
 * keine.
 */
export const VORDRUCK_PRUEFEN = "Den Vordruck auf leere Felder durchsehen und von Hand ergänzen";

export function vonHandFuerFormulare(
  formulare: { attHeader: string; fehlendeAngaben: readonly string[] }[],
  laufbahngruppen: string[],
): VonHandFormular[] {
  return formulare.flatMap((formular) => {
    const variante = detectBewerbungsbogenVariant(formular.attHeader);
    // Ein ausgefuellter Vordruck, dessen Vorlage sich nicht mehr zuordnen laesst
    // (z.B. Anhangsliste nach dem Eroeffnen geaendert), darf nicht still aus der
    // Liste fallen - sonst fehlt genau der Hinweis auf die Handarbeit.
    if (!variante) {
      return [{ formular: formular.attHeader || "Ausgefüllter Vordruck", felder: [VORDRUCK_PRUEFEN] }];
    }
    return [
      {
        formular: formular.attHeader,
        felder: vonHandZuErgaenzen(variante, { fehlendeAngaben: formular.fehlendeAngaben, laufbahngruppen }),
      },
    ];
  });
}

export function abschnittVonHand(formulare: VonHandFormular[]): string | null {
  const mitFeldern = formulare.filter((formular) => formular.felder.length > 0);
  if (mitFeldern.length === 0) return null;
  return [
    "VON HAND ERGÄNZEN",
    eingerueckt("Diese Felder haben wir nicht ausgefüllt, weil du sie selbst entscheidest oder uns die Angabe fehlte:"),
    ...mitFeldern.map((formular) => `  ${formular.formular}:\n${aufzaehlung(formular.felder, "    ")}`),
  ].join("\n");
}

/**
 * Platzhalter, die beim Paketbau noch in einem selbst geschriebenen Text
 * stehen (s. lib/platzhalter.ts). `ort` ist die Ortsangabe im Satz, vom
 * Aufrufer gewaehlt ("Im Anschreiben", "In 01_Anschreiben.pdf").
 */
export interface OffenePlatzhalter {
  ort: string;
  platzhalter: string[];
}

/**
 * "[Adresse]", "[Telefon]" usw. koennen unveraendert im Anschreiben-PDF
 * stehen. Steht im Zettel vor allem anderen - ein Platzhalter in
 * einer eingereichten Bewerbung ist der peinlichste Fehler, den das Paket
 * enthalten kann. Nur die Platzhalter-Namen, nie Text oder Werte.
 */
export function abschnittPlatzhalter(eintraege: OffenePlatzhalter[]): string | null {
  const mitPlatzhaltern = eintraege.filter((eintrag) => eintrag.platzhalter.length > 0);
  if (mitPlatzhaltern.length === 0) return null;
  return [
    "PLATZHALTER ERSETZEN",
    aufzaehlung(
      mitPlatzhaltern.map(
        (eintrag) =>
          `${eintrag.ort} stehen noch Platzhalter: ${eintrag.platzhalter.join(", ")}. Ersetze sie vor dem Einreichen.`,
      ),
    ),
  ].join("\n");
}

/**
 * Facetten-Code -> Wort auf dem Vordruck. Dieselbe Tabelle wie fuer die
 * MCP-Filter: die Kurzformen dort ("Feldwebel", "Offiziere") sind genau die
 * Woerter, die der militaerische Bogen an seine Kaestchen druckt. Sie traegt
 * nur die militaerischen Laufbahngruppen - zivile haben kein Kaestchen.
 */
const LAUFBAHN_JE_FACETTE = READABLE_LAUFBAHNGRUPPE_BY_CODE;

/**
 * Die Laufbahngruppe der Ausschreibung in den Worten des Vordrucks - fuer den
 * Hinweis an der Laufbahn-Zeile. Vorrang hat die amtliche Facette; nur wenn sie
 * fehlt, die Auswertung des Textes.
 */
export function laufbahngruppenDerStelle(job: Pick<JobSummaryRecord, "laufbahngruppe" | "jobAttributes">): string[] {
  const amtlich = LAUFBAHN_JE_FACETTE[job.laufbahngruppe ?? ""];
  if (amtlich) return [amtlich];
  if (job.laufbahngruppe) return [];
  const bekannt = Object.values(LAUFBAHN_JE_FACETTE);
  return (job.jobAttributes?.laufbahngruppen ?? []).filter((gruppe) => bekannt.includes(gruppe));
}
