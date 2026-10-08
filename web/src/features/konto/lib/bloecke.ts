/** Teilt eine Liste in Bloecke fester Groesse - Firestore erlaubt bei `in` hoechstens 30 Werte je Abfrage. */
export function inBloecken<T>(liste: T[], groesse: number): T[][] {
  const bloecke: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) bloecke.push(liste.slice(i, i + groesse));
  return bloecke;
}
