/**
 * Wie eine Bewerbung eingereicht wird - EINE Quelle fuer den Merkzettel in
 * beiden Paketen (mappe/, konto/), die KI-Seite, den Bewerbungsplan der
 * Paketseite und das Ablaufwissen (mcp/knowledge/bewerbungsablauf.ts).
 *
 * WOZU: "offizielles Portal ... Kennung suchen" allein reicht nicht - es fehlen
 * die Adresse und was mit den PDFs geschieht. Die Saetze folgen den
 * Ausschreibungen selbst: die meisten contactDesc-Texte mit Link nennen
 * genau diese Adresse, die haeufigsten Vorlagensaetze lauten "Klick auf
 * 'Karriere starten' & Profil erstellen", "Ihre Bewerbungsunterlagen laden
 * Sie bitte als PDF-Druckversion ... in Ihr Bewerbungsprofil hoch" und
 * "Unsere Karriereberatung meldet sich anschliessend zur Terminvereinbarung".
 *
 * contactDesc selbst geht dafuer NIE in einen Text: er nennt die
 * Ansprechpersonen mit Namen.
 */
export const BEWERBUNGSPORTAL_URL = "https://bewerbung.bundeswehr-karriere.de";

/**
 * Dieselben Schritte als ein Absatz - fuer das Ablaufwissen
 * (mcp/knowledge/bewerbungsablauf.ts), wo eine Unterliste den Schritt
 * zerreissen wuerde.
 */
export const EINREICHEN_KURZ =
  `Im offiziellen Bewerbungsportal der Bundeswehr (${BEWERBUNGSPORTAL_URL}) über „Karriere starten“ ein ` +
  "Profil anlegen, die Stelle über ihre Kennung suchen und die Unterlagen als PDF hochladen - " +
  "unterschriebene Vordrucke vorher einscannen. Das Portal fragt die persönlichen Angaben dort noch einmal " +
  "selbst ab. Nennt die Ausschreibung einen anderen Weg, gilt dieser.";

/**
 * Die Schritte als ganze Saetze, ohne Aufzaehlungszeichen - der Aufrufer
 * formatiert (Textdatei, Markdown, Liste im Web). Ohne Anrede: dieselben Saetze
 * liest der Bewerber im Paket und eine fremde KI im Rueckgabewert.
 * Ohne `refCode` (Wissensseite
 * ohne konkrete Stelle) heisst es "ueber ihre Kennung".
 */
export function einreichenSchritte(refCode?: string): string[] {
  const kennung = refCode ? `über ihre Kennung ${refCode}` : "über ihre Kennung";
  return [
    `Im offiziellen Bewerbungsportal der Bundeswehr (${BEWERBUNGSPORTAL_URL}) auf „Karriere starten“ klicken und ein Profil anlegen.`,
    `Dort die Stelle ${kennung} suchen und die Unterlagen als PDF im Bewerbungsprofil hochladen. Unterschriebene Vordrucke vorher einscannen.`,
    "Das Portal fragt die persönlichen Angaben dort noch einmal selbst ab.",
    "In der Regel meldet sich danach die Karriereberatung zur Terminvereinbarung.",
    "Nennt die Ausschreibung einen anderen Weg, gilt dieser.",
  ];
}
