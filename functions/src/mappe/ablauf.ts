/** Eine Stunde - die in `DSFA.md` zugesagte Aufbewahrungsfrist. */
export const MAPPE_FRIST_MS = 60 * 60 * 1000;

/**
 * Zwei Lagen, beide mit derselben Frist: nach dem Paketbau hat die Mappe ihren
 * Zweck erfüllt, und eine Mappe ohne Paket ist liegengeblieben. Ohne die zweite
 * Lage lägen Zeugnisscans unbegrenzt.
 */
export function istAbgelaufen(
  mappe: { zipGebautAm: number | null; letzteAktivitaetAm: number },
  jetzt: number,
): boolean {
  const stichzeit = mappe.zipGebautAm ?? mappe.letzteAktivitaetAm;
  return jetzt - stichzeit > MAPPE_FRIST_MS;
}

/**
 * Liefert letzteAktivitaetAm UND verfaelltAm zusammen, damit kein Aufrufer
 * eines von beiden vergisst. Die Stichzeit fuer verfaelltAm ist der Paketbau,
 * sobald es einen gibt - sonst dieser Schreibvorgang selbst (dieselbe Logik
 * wie in istAbgelaufen). Wer hier blind `jetzt` nimmt und das vorhandene
 * zipGebautAm ignoriert, verschiebt die Loeschung nach jedem spaeteren
 * Schreibvorgang nach hinten und verlaengert damit die Aufbewahrung, die wir
 * dem Bewerber zugesagt haben: ein Dokument, das nach dem Paketbau noch
 * hinzugefuegt wird, setzte verfaelltAm dann auf `jetzt + Frist` statt auf
 * `zipGebautAm + Frist`, und die Mappe wanderte exakt um die seit dem
 * Paketbau vergangene Zeit nach hinten.
 *
 * Deshalb MUSS jeder Aufrufer das vorhandene zipGebautAm kennen, und zwar aus
 * demselben Zug, in dem er schreibt: ein vorgelagerter `get()` reicht NICHT,
 * weil `merkeZip` dazwischenfallen kann und der Aufrufer dann `null` liest,
 * obwohl das Paket schon gebaut ist - das verlaengert die Frist. Lesen und
 * Schreiben liegen darum in einer Transaktion (s. mappeStore,
 * `schreibeMitAblauf`; ebenso registriereAtomar in mappeHttp.ts). NICHT fuer
 * den Download-Vermerk verwendet (s. mappeHttp.ts,
 * loeseDownloadEin): ein Abruf ist keine Aktivitaet, die die Aufbewahrung
 * verlaengert.
 */
export function aktivitaetsFelder(
  jetzt: number,
  zipGebautAm: number | null,
): { letzteAktivitaetAm: number; verfaelltAm: number } {
  return { letzteAktivitaetAm: jetzt, verfaelltAm: (zipGebautAm ?? jetzt) + MAPPE_FRIST_MS };
}
