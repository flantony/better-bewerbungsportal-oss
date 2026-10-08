export type TokenPruefer = (token: string) => Promise<{ uid: string; email_verified?: boolean; email?: string }>;

export function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Der Pruefer wird hineingegeben (im Endpunkt: getAuth().verifyIdToken), damit
 * die Entscheidung "uid oder nicht" ohne Admin SDK testbar ist.
 */
export async function uidAusAnfrage(authorization: string | undefined, pruefe: TokenPruefer): Promise<string | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  try {
    return (await pruefe(token)).uid;
  } catch {
    // Abgelaufen, gefaelscht, falsches Projekt - fuer den Aufrufer alles
    // dasselbe: nicht angemeldet. Der Grund wird nicht geloggt (er hilft nur
    // einem Angreifer beim Kalibrieren).
    return null;
  }
}

/**
 * Wie `uidAusAnfrage`, liefert zusaetzlich `emailBestaetigt` - aus dem
 * geprueften ID-Token (`email_verified`-Claim), NIE aus Firestore
 * (`kontoLaden` und `kontoBenachrichtigungSetzen` brauchen das, um Zusagen ueber
 * eine bestaetigte Mailadresse zu machen, ohne selbst einen Mailversand oder
 * eine gespeicherte Kopie der Adresse zu brauchen). `uidAusAnfrage` bleibt fuer
 * die Endpunkte, die nur die uid brauchen (ein Aufruf des Pruefers reicht).
 *
 * `email` (`kontoExport`): ebenfalls aus dem geprueften ID-Token,
 * NIE aus Firestore gespeichert - der Export braucht die Adresse selbst
 * (Art. 15 DSGVO), aber das Konto legt sie nirgends dauerhaft ab.
 */
export async function anmeldungAusAnfrage(
  authorization: string | undefined,
  pruefe: TokenPruefer,
): Promise<{ uid: string; emailBestaetigt: boolean; email: string | null } | null> {
  const token = bearerToken(authorization);
  if (!token) return null;
  try {
    const ergebnis = await pruefe(token);
    return { uid: ergebnis.uid, emailBestaetigt: ergebnis.email_verified ?? false, email: ergebnis.email ?? null };
  } catch {
    return null;
  }
}
