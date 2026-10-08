/**
 * Was zu sagen ist, wenn wir keine Unterlagenliste haben.
 *
 * WOZU: Viele aktive Ausschreibungen tragen keine extrahierte Liste. Ein leeres Array ist fuer eine fremde KI nicht
 * unterscheidbar von "es wird nichts verlangt" - und dieser Schluss ist bei
 * einer Bewerbung immer falsch. Ohne diesen Satz bekommt der Bewerber im
 * schlechtesten Fall "Unterlagen brauchst du keine" zu hoeren.
 *
 * Steht im Rueckgabewert und nicht in der Tool-Beschreibung: eine Regel,
 * die erst im Leerfall greift, kommt in der Beschreibung nicht an. Zweigeteilt, weil derselbe Satz beide
 * Adressaten hat - s. geteilterHinweis.ts.
 */
import { geteilterHinweis, type GeteilterHinweis } from "./geteilterHinweis";
import { istVerfassungstreueErklaerung } from "../../mappe/anhangArt";

/**
 * Was zu sagen ist, wenn die Ausschreibung keinen Bewerbungsbogen anhaengt.
 *
 * WOZU: Die Domaenenregel dieser Ausschreibungen lautet - was an Formularen
 * verlangt wird, LIEGT BEI. Kein Anhang heisst also: es wird keiner verlangt.
 * Den fuer die Laufbahngruppe ueblichen Bogen einer VERGLEICHBAREN
 * Ausschreibung herauszureichen hiesse: der Bewerber fuellt genau dann ein
 * amtliches Formular aus, wenn niemand eines von ihm will. Hier steht deshalb
 * der Satz, der die Leere richtig deutet, statt einer fremden Vorlage.
 */
export function hinweisZuBewerbungsboegen(
  anzahlBoegen: number,
  anzahlAusfuellbar: number,
  /** Vordrucke zum Selbst-Ausfuellen (s. `hinweisZuVordrucken`) - aendern den Leerfall-Satz. */
  anzahlVordrucke = 0,
): GeteilterHinweis | null {
  // Ein ausfuellbarer Bogen ist da - dann traegt die Feldliste alles Weitere.
  if (anzahlAusfuellbar > 0) return null;

  // Ein Bogen liegt bei, wir haben nur keine Feldzuordnung dafuer. Ohne Hinweis
  // sammelt ein Client trotz `ausfuellbar: false` Angaben ein, raet Felder aus
  // eigenem Wissen zusammen ("Standardfeld eines Bewerbungsbogens") und
  // verspricht, das Formular auszufuellen. Eine Regel in den Instructions kommt
  // dafuer nicht an; hier kommt sie an.
  if (anzahlBoegen > 0) {
    return geteilterHinweis(
      "Der beiliegende Bogen ist der richtige, aber dieser Server hat keine Feldzuordnung dafür " +
        "(`ausfuellbar: false`). Sammle deshalb KEINE Personendaten für ihn ein und versprich kein " +
        "ausgefülltes PDF: es gibt keine Feldliste, und alles, was du erfragst, müsste der Bewerber " +
        "hinterher trotzdem selbst eintragen. Rate die Felder auch nicht aus eigenem Wissen zusammen. " +
        "Gib die downloadUrl weiter — mehr ist hier nicht zu holen, und der Bewerber ist damit " +
        "vollständig versorgt. Bitte ihn nicht, dir das Formular hochzuladen: du hast den Link.",
      "Das Formular für diese Ausschreibung liegt bei. Ausfüllen musst du es selbst, am Rechner " +
        "im PDF oder ausgedruckt. Über den Link bekommst du es leer.",
    );
  }

  // Haengt nur ein Vordruck wie ein "Fragebogen Stellenbörse" an, sagten ohne
  // diesen Zusatz "es muss keiner ausgefuellt werden" und `vordruckHinweis`
  // daneben das Gegenteil.
  const vordruckeNurFuerDich =
    anzahlVordrucke > 0
      ? " Das betrifft nur den Bewerbungsbogen: die Vordrucke unter `selbstAuszufuellen` gehören trotzdem dazu (s. `vordruckHinweis`)."
      : "";
  const vordruckeFuerBewerber =
    anzahlVordrucke > 0 ? " Die übrigen beiliegenden Vordrucke gelten davon unabhängig." : "";

  return geteilterHinweis(
    "Diese Ausschreibung hängt keinen Bewerbungsbogen an. Bei den Bundeswehr-Ausschreibungen heißt das: es " +
      "wird keiner verlangt — verlangte Formulare liegen der Ausschreibung bei. Suche deshalb KEINEN Bogen aus " +
      "einer anderen Ausschreibung heraus und bitte den Bewerber nicht, einen hochzuladen; es genügen die unter " +
      "`geforderteUnterlagen` genannten Unterlagen. Nur wenn der Ausschreibungstext selbst ausdrücklich einen " +
      "Bewerbungsbogen nennt, verweise auf die dort genannte Ansprechperson bzw. das Karriereberatungsbüro." +
      vordruckeNurFuerDich,
    "Dieser Ausschreibung liegt kein Bewerbungsbogen bei. Bei der Bundeswehr heißt das, dass du für sie auch " +
      "keinen ausfüllen musst: verlangte Formulare hängen immer an der Ausschreibung selbst." +
      vordruckeFuerBewerber,
  );
}

/**
 * Was zu sagen ist, wenn der Ausschreibung Vordrucke beiliegen, die der
 * Bewerber selbst ausfuellt und unterschreibt (s. mappe/anhangArt.ts) - z. B.
 * "Anlage 1 zum Bewerbungsbogen", die Erklaerung zur Verfassungstreue, aber
 * auch ein "Fragebogen Stellenbörse" oder eine Notenuebersicht.
 *
 * WOZU: ohne Anlage 1 ist die Bewerbung
 * unvollstaendig, und in `documents` steht sie gleichrangig neben einer
 * Infobroschuere. Steht im Rueckgabewert, weil die Regel nur dann greift, wenn
 * so ein Vordruck da ist.
 *
 * Zwei Stufen: fuer alle Vordrucke gilt
 * "selbst ausfuellen, soweit er auf dich zutrifft, keine Angaben im Chat
 * sammeln". Das Verbot, bei den Fragen zu helfen, und "ohne sie unvollstaendig"
 * gelten nur fuer die Erklaerung zur Verfassungstreue - sie fragt nach
 * Mitgliedschaften in Parteien und Vereinigungen und nach Verbindungen in die
 * Staaten der Staatenliste (Art.-9-nah). Bei einer Notenuebersicht waere das
 * Verbot grundlos.
 */
export function hinweisZuVordrucken(vordrucke: string[], beiblaetter: string[]): GeteilterHinweis | null {
  if (vordrucke.length === 0) return null;
  const inAnfuehrung = (titel: string) => `„${titel}“`;
  const erklaerungen = vordrucke.filter(istVerfassungstreueErklaerung);
  const uebrige = vordrucke.filter((titel) => !istVerfassungstreueErklaerung(titel));

  const nurFuerDich = [
    `${vordrucke.map(inAnfuehrung).join(", ")} (s. \`selbstAuszufuellen\`) sind Vordrucke, die der Bewerber ` +
      "selbst von Hand ausfüllt, unterschreibt und mit der Bewerbung einreicht. Dieser Server füllt sie nie aus. " +
      "Sag es dem Bewerber und gib die downloadUrl weiter; sammle für diese Vordrucke keine Angaben im Chat.",
    erklaerungen.length > 0
      ? `${erklaerungen.map(inAnfuehrung).join(", ")} ist die Erklärung zur Verfassungstreue und gehört immer ` +
        "dazu. Stelle ihre Fragen NICHT im Chat und hilf nicht beim Beantworten — sie betreffen Mitgliedschaften " +
        "in Parteien und Vereinigungen; das gehört aufs Papier, nicht in ein Gespräch."
      : "",
    beiblaetter.length > 0
      ? `${beiblaetter.map(inAnfuehrung).join(", ")} ist Nachschlagematerial dazu — nichts auszufüllen.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const fuerDenBewerber = [
    erklaerungen.length > 0
      ? `Zu dieser Bewerbung gehört auch: ${erklaerungen.join(", ")}. Diesen Vordruck füllst du selbst ` +
        "von Hand aus, unterschreibst ihn und reichst ihn mit der Bewerbung ein. Ohne ihn ist die Bewerbung " +
        "unvollständig."
      : "",
    uebrige.length > 0
      ? `Der Ausschreibung liegen Vordrucke bei, die du selbst ausfüllst und unterschreibst, soweit sie ` +
        `auf dich zutreffen: ${uebrige.join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return geteilterHinweis(nurFuerDich, fuerDenBewerber);
}

/**
 * Der Satz an den Bewerber, wenn wir keine Unterlagenliste haben - EINE Quelle
 * fuer `get_document_requirements` und den Merkzettel im Paket (s.
 * mappe/merkzettel.ts).
 */
export const KEINE_UNTERLAGENLISTE_FUER_BEWERBER =
  "Eine Liste der Unterlagen konnten wir aus dieser Ausschreibung nicht herauslesen. Unterlagen brauchst du " +
  "trotzdem: üblich sind ein Anschreiben, ein tabellarischer Lebenslauf und Zeugniskopien. Verbindlich " +
  "sind der Ausschreibungstext und die dort genannte Ansprechperson bzw. die Karriereberatung.";

export function hinweisZuUnterlagen(unterlagen: string[], anzahlAnhaenge: number): GeteilterHinweis | null {
  if (unterlagen.length > 0) return null;

  const anhang =
    anzahlAnhaenge > 0
      ? " Diese Ausschreibung hat Anhänge (s. `documents`) — sieh dort nach, was mitzuschicken ist."
      : "";
  const anhangFuerBewerber =
    anzahlAnhaenge > 0 ? " Der Ausschreibung liegen Anhänge bei, in denen weitere Angaben dazu stehen können." : "";

  return geteilterHinweis(
    "Unsere Auswertung hat aus dieser Ausschreibung keine Unterlagenliste gewinnen können. " +
      "Das heißt NICHT, dass keine nötig sind — sag dem Bewerber nicht, er brauche nichts. " +
      "SIEH SELBST NACH, bevor du antwortest: `contactDesc` und `remarcDesc` aus get_job nennen die " +
      "Unterlagen oft im Fließtext (\"Ihre Bewerbung umfasst ...\"), und `contactDesc` wird bei unserer " +
      "Auswertung bewusst nicht mitgelesen — dort steht also regelmäßig genau das, was hier fehlt. " +
      "Findest du auch dort nichts, nenne Anschreiben, tabellarischen Lebenslauf und Zeugniskopien als das, " +
      "was allgemein erwartet wird, nicht als Angabe dieser Ausschreibung." +
      anhang +
      " Die verbindliche Auskunft gibt die im Ausschreibungstext genannte Ansprechperson.",
    KEINE_UNTERLAGENLISTE_FUER_BEWERBER + anhangFuerBewerber,
  );
}
