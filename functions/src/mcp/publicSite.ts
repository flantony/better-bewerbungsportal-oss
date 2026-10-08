/** Öffentliche Basis-URL der App - Quelle für websiteUrl, Icon und Mappen-Links. */
export const PUBLIC_SITE_URL = "https://better-bewerbungsportal.de";

/**
 * Herkuenfte, deren Browser-Skripte die Konto- und Mappen-Endpunkte aufrufen
 * duerfen (CORS). Statt `cors: true`, das jede fremde Seite zuliesse. Dieselbe Liste wie die Bucket-CORS in
 * `storage.cors.json`; eine neue Domain muss in beide. CORS ist eine Sperre
 * fuer fremde Webseiten, keine Authentifizierung: Aufrufe ohne `Origin` (der
 * Kurzlink `/k/{id}` holt `kiSeite` serverseitig, Mail-Anbieter beim
 * One-Click-Abbestellen) bleiben davon unberuehrt. MCP-Server und `kiSeite`
 * bleiben fuer alle offen.
 */
export const ERLAUBTE_URSPRUENGE: string[] = [PUBLIC_SITE_URL, "http://localhost:3000"];

/** Basis der Cloud Functions - Ziel der Upload-Aufrufe der Mappen-Seite und des Download-Links. */
export const FUNCTIONS_BASE_URL = "https://europe-west3-better-bewerbungsportal.cloudfunctions.net";
