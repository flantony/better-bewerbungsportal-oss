/**
 * Was ein MCP-Client zu einem LEEREN `applicationEnd` erfaehrt.
 *
 * WOZU: Ein leerer Wert ohne Hinweis ist ein Fehler, kein Ergebnis. Ein Client
 * liest ihn sonst als "Frist unbekannt" oder laesst ihn in der Kurzliste einfach
 * weg - dabei sagen fast alle solcher Stellen im Text ausdruecklich, dass die
 * Bewerbung jederzeit moeglich ist (s. lib/bewerbungsschluss.ts, dort die
 * Erkennung).
 */
import { geteilterHinweis, type GeteilterHinweis } from "./geteilterHinweis";

/**
 * Fuer EINE Stelle, deren Text vorliegt (get_job). `null`, wenn ein Datum da ist.
 */
export function bewerbungsschlussHinweis(applicationEnd: string, jederzeit: boolean): GeteilterHinweis | null {
  if (applicationEnd) return null;
  if (jederzeit) {
    return geteilterHinweis(
      "`applicationEnd` ist leer, weil diese Ausschreibung keine Frist hat: ihr Text sagt, dass die Bewerbung " +
        "jederzeit möglich ist. Gib das so weiter - nicht als \"Frist unbekannt\" und nicht als \"abgelaufen\".",
      "Für diese Stelle gibt es keinen Bewerbungsschluss. Laut Ausschreibung ist die Bewerbung jederzeit möglich.",
    );
  }
  return geteilterHinweis(
    "`applicationEnd` ist leer, und im Ausschreibungstext haben wir keine Aussage zur Frist erkannt. Erfinde " +
      "kein Datum und behaupte auch nicht, es gebe keine Frist. Lies `companyDesc` und `remarcDesc` selbst nach; " +
      "steht dort nichts, verweise an die Karriereberatung.",
    "Die Ausschreibung nennt keinen Bewerbungsschluss. Frag im Zweifel bei der Karriereberatung nach.",
  );
}

/**
 * Fuer eine Trefferliste, deren Zeilen den Volltext NICHT tragen (list_jobs):
 * dort ist nur zu sagen, was "leer" nicht heisst, und wo es sich klaert. Den
 * Text je Treffer nachzuladen kostete einen Read pro Zeile auf dem haeufigsten
 * Aufruf dieses Servers.
 */
export function bewerbungsschlussHinweisFuerListe(anzahlOhneDatum: number): GeteilterHinweis | null {
  if (anzahlOhneDatum === 0) return null;
  return geteilterHinweis(
    `Bei ${anzahlOhneDatum} Treffer(n) ist \`applicationEnd\` leer: die Ausschreibung nennt kein Datum. Das ` +
      "heisst weder \"abgelaufen\" noch \"keine Frist\" - meist steht im Text, dass die Bewerbung jederzeit " +
      "möglich ist. Schreib in der Kurzliste \"kein Datum genannt\" statt das Feld wegzulassen; ob die einzelne " +
      "Stelle jederzeit offen ist, sagt get_job in `bewerbungsschlussHinweis`.",
    "Bei Stellen ohne Datum nennt die Ausschreibung keinen Bewerbungsschluss; ob die Bewerbung jederzeit möglich " +
      "ist, steht in der jeweiligen Ausschreibung.",
  );
}
