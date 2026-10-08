// Schlanker Wrapper um die Resend-HTTP-API (kein SDK/Extra-Dependency - fetch
// ist in Node 22 nativ vorhanden, gleiches Muster wie bundeswehrClient.ts).
//
// LOGGT NICHTS VOM ANTWORTTEXT: eine Resend-Fehlermeldung kann
// die Empfaengeradresse enthalten. Der Aufrufer bekommt bei Fehlschlag nur den
// HTTP-Status im Error, den er dann selbst (nur als Status/Fehlername) loggt.
import type { MailInhalt } from "../konto/trefferMail";

export interface SendeMailParams {
  apiKey: string;
  /** Domain, von der aus gesendet wird (z.B. "mail.better-bewerbungsportal.de") - muss in Resend verifiziert sein. */
  domain: string;
  an: string;
  inhalt: MailInhalt;
  /**
   * Zusaetzliche Mail-Kopfzeilen, z.B. `List-Unsubscribe` +
   * `List-Unsubscribe-Post` (RFC 8058) fuer den Abbestell-Link.
   */
  kopfzeilen?: Record<string, string>;
}

/** Wartezeit vor der einen Wiederholung nach 429: `Retry-After` in Sekunden, sonst 1 s, hoechstens 5 s. */
const RETRY_STANDARD_S = 1;
const RETRY_MAX_S = 5;

function wartezeitMs(retryAfter: string | null): number {
  const sekunden = retryAfter !== null && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) : RETRY_STANDARD_S;
  return Math.min(sekunden, RETRY_MAX_S) * 1000;
}

const warte = (ms: number) => new Promise<void>((fertig) => setTimeout(fertig, ms));

/**
 * Bei HTTP 429 genau EIN weiterer Versuch nach `Retry-After` -
 * Resend drosselt kurzzeitig, ohne Wiederholung ginge die Mail erst eine Nacht
 * spaeter raus. `schlafen` ist fuer Tests injizierbar.
 */
export async function sendeMail(
  params: SendeMailParams,
  abrufen: typeof fetch = fetch,
  schlafen: (ms: number) => Promise<void> = warte,
): Promise<void> {
  const senden = () =>
    abrufen("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Better Bewerbungsportal <benachrichtigung@${params.domain}>`,
        to: params.an,
        subject: params.inhalt.betreff,
        text: params.inhalt.text,
        html: params.inhalt.html,
        ...(params.kopfzeilen ? { headers: params.kopfzeilen } : {}),
      }),
    });

  let res = await senden();
  if (res.status === 429) {
    await schlafen(wartezeitMs(res.headers.get("retry-after")));
    res = await senden();
  }

  if (!res.ok) {
    throw new Error(`Resend-Status ${res.status}`);
  }
}
