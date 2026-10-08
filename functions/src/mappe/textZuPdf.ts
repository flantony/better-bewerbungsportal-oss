import { PDFDocument, StandardFonts } from "pdf-lib";

/**
 * Setzt einen vom Client geschriebenen Text (Lebenslauf, Anschreiben) als
 * schlichtes PDF.
 *
 * WOZU kein Base64-Umweg: dasselbe Dokument als Base64 im Tool-Aufruf kostet
 * rund dreissigtausend Token, als Text zwei. Deshalb ist Text der Hauptweg.
 *
 * pdf-lib und nicht pdfjs-dist: hier entsteht ein NEUES PDF, das ist der
 * Codepfad ohne die Parse-Inkompatibilitaet der Bundeswehr-Vordrucke
 * (s. Kopfkommentar fillBewerbungsbogen.ts).
 *
 * Die Standardschrift (Helvetica, WinAnsi-Kodierung) kann kein Emoji - was
 * nicht darstellbar ist, wird entfernt statt den Aufruf scheitern zu lassen:
 * ein Anschreiben ohne Emoji ist brauchbar, ein Fehler nicht.
 */
const RAND = 56;
const ZEILE = 14;
const SEITE: [number, number] = [595.28, 841.89];

/**
 * Nur Escapes, keine Literale: typografische und gerade Anfuehrungszeichen sehen
 * im Quelltext identisch aus, und beim Bearbeiten werden typografische Zeichen
 * leicht zu geraden.
 *
 * Erlaubt ist druckbares Latin-1 plus genau die Zeichen, die die
 * WinAnsi-Kodierung von pdf-lib (@pdf-lib/standard-fonts, Encodings.WinAnsi)
 * fuer Helvetica darueber hinaus kennt; der Test "jedes behaltene Zeichen ist
 * kodierbar" prueft das gegen die installierte Version.
 * Darunter Euro (\u20AC), Halbgeviert-/Geviertstrich (\u2013/\u2014), die
 * Anfuehrungszeichen \u201E \u201C \u201D \u201A \u2018 \u2019,
 * Auslassungspunkte (\u2026) und Aufzaehlungspunkt (\u2022).
 */
const NICHT_DARSTELLBAR =
  /[^\u0020-\u007E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g;

const LEERRAUM = /[\t\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Macht EINE Zeile schrifttauglich. Zeilenumbrueche muessen vorher
 * herausgetrennt sein (s. zeilenFuerPdf) - sonst fielen sie hier als
 * Steuerzeichen weg und der ganze Text wuerde ein einziger Absatz.
 * Tabulator und typografische Leerzeichen werden zu einem Leerzeichen,
 * alle Steuerzeichen (C0/C1) und alles Nicht-Kodierbare entfallen - so
 * wirft die Kodierung nie.
 */
export function schriftSicher(text: string): string {
  return text.replace(LEERRAUM, " ").replace(NICHT_DARSTELLBAR, "");
}

export function umbrechen(text: string, maxZeichen: number): string[] {
  const grenze = Math.max(1, maxZeichen);
  const zeilen: string[] = [];
  for (const absatz of text.split(/\r?\n/)) {
    let rest = absatz;
    while (rest.length > grenze) {
      const schnitt = rest.lastIndexOf(" ", grenze);
      const bei = schnitt > grenze / 2 ? schnitt : grenze;
      zeilen.push(rest.slice(0, bei));
      rest = rest.slice(bei).trimStart();
    }
    zeilen.push(rest);
  }
  return zeilen;
}

/**
 * Erst in Zeilen trennen, dann je Zeile saeubern, dann umbrechen. Leere
 * Zeilen bleiben als Absatzabstand erhalten.
 */
export function zeilenFuerPdf(text: string, maxZeichen: number): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/[\n\u2028\u2029]/)
    .flatMap((zeile) => umbrechen(schriftSicher(zeile), maxZeichen));
}

export async function textZuPdf(titel: string, text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const schrift = await pdf.embedFont(StandardFonts.Helvetica);
  const fett = await pdf.embedFont(StandardFonts.HelveticaBold);

  let seite = pdf.addPage(SEITE);
  let y = SEITE[1] - RAND;
  seite.drawText(schriftSicher(titel.replace(/[\r\n\u2028\u2029]+/g, " ")), { x: RAND, y, size: 16, font: fett });
  y -= ZEILE * 2;

  for (const zeile of zeilenFuerPdf(text, 92)) {
    if (y < RAND) {
      seite = pdf.addPage(SEITE);
      y = SEITE[1] - RAND;
    }
    seite.drawText(zeile, { x: RAND, y, size: 10, font: schrift });
    y -= ZEILE;
  }

  return pdf.save();
}
