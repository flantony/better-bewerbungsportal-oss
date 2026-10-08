import { Timestamp } from "firebase-admin/firestore";

const FAR_FUTURE = Timestamp.fromDate(new Date(9999, 0, 1));

/**
 * Wandelt ein `DD.MM.YYYY`-Datum (Bundeswehr-API-Format, `applicationEnd`) in
 * einen sortierbaren Firestore-Timestamp um - `applicationEnd` selbst ist ein
 * String und lexikographisch NICHT chronologisch sortierbar (z.B. "01.09.2026"
 * vor "15.08.2026", obwohl August früher liegt). Fehlende/nicht parsbare Werte
 * (offene Ausschreibungen) ergeben einen weit in der Zukunft liegenden
 * Sentinel-Wert, damit sie beim aufsteigenden Sortieren nach Bewerbungsschluss
 * ans Ende rutschen statt fälschlich ganz vorn zu landen.
 */
export function toApplicationEndSortKey(value: string): Timestamp {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return FAR_FUTURE;
  const [, day, month, year] = match;
  return Timestamp.fromDate(new Date(Number(year), Number(month) - 1, Number(day)));
}
