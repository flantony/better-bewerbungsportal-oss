// Zuordnung der Kontingente für den öffentlichen, unauthentifizierten
// MCP-Endpunkt: welche Anfrage ist wie teuer.
//
// Die Mechanik (Token-Buckets, X-Forwarded-For) liegt in
// `../../lib/drosselung.ts` und wird von den Mappe-Endpunkten in
// `mappeHttp.ts` mitbenutzt - dort gilt dieselbe Begründung für die
// Grenzen der Bauart (Buckets im Instanz-Speicher, kein Firestore-Zähler).

import type { Quota } from "../../lib/drosselung";

// Von hier aus re-exportiert: `server.ts` und die Tests holen die Mechanik
// zusammen mit der Zuordnung unten über diesen Modulpfad.
export {
  createRateLimiter,
  clientKeyFromForwardedFor,
  type Quota,
  type RateLimiter,
  type RateLimitDecision,
} from "../../lib/drosselung";

/** Name des teuren Tools: PDF-Vorlage laden + pdfjs-Ausfüllung (512 MiB). */
export const FILL_TOOL_NAME = "fuelle_formular";

/**
 * Wege, die eine ganze Datei aus Storage holen und base64-kodiert ausliefern.
 * Deutlich teurer als eine Firestore-Abfrage (Storage-Download + Traffic), aber
 * billiger als das Ausfüllen - deshalb ein eigenes Kontingent dazwischen.
 */
export const DOKUMENT_TOOL_NAME = "hole_formular";
export const FORMULAR_URI_PREFIX = "bw://formular/";

/**
 * Werkzeuge, die eine Ablage in Firestore UND Storage anfassen - deutlich
 * strenger als eine Suche.
 *
 * `fuege_dokument_hinzu` gehört dazu: der Aufruf rendert ein PDF, schreibt es
 * nach Storage und ergänzt das Firestore-Verzeichnis - dieselbe Kostenklasse
 * wie das Eröffnen und Schließen. Fehlt es hier, fällt es unter das weite
 * `GENERAL_QUOTA` (60/Minute), also ausgerechnet der schreibende Weg unter das
 * Kontingent für lesende Abfragen.
 */
export const MAPPE_TOOL_NAMES = ["fuege_dokument_hinzu", "schliesse_bewerbungsmappe"] as const;

/**
 * Das Anlegen einer Mappe hat ein eigenes, strenges Kontingent: es gibt einen globalen Deckel offener Mappen
 * (`MAX_OFFENE_MAPPEN` in mappe/mappeStore.ts), und mit dem Mappen-Kontingent
 * (10/Minute) haette eine einzige IP rund 600 Mappen je Stunde anlegen und den
 * Deckel fuer alle anderen dauerhaft fuellen koennen.
 */
export const ANLEGEN_TOOL_NAME = "eroeffne_bewerbungsmappe";

/** Lesende Tools + Handshake - großzügig, das ist normaler Gesprächsbetrieb. */
export const GENERAL_QUOTA: Quota = { capacity: 60, refillPerMinute: 60 };

/** Ausfüllen - deutlich strenger, das ist der teure Pfad. */
export const FILL_QUOTA: Quota = { capacity: 6, refillPerMinute: 6 };

/** Dateiauslieferung - zwischen lesenden Abfragen und dem Ausfüllen. */
export const DOKUMENT_QUOTA: Quota = { capacity: 15, refillPerMinute: 15 };

/**
 * Mappe eröffnen / bestücken / schließen.
 *
 * Die Zahlen kommen aus dem längsten legitimen Ablauf, nicht aus Sparsamkeit:
 * eröffnen (1) + bis zu zehn Dokumente über `fuege_dokument_hinzu` (die
 * Mengengrenze der Mappe, s. `uploadRegeln.ts`) + schließen (1) = 12 Aufrufe,
 * und ein zweiter Anlauf nach einem verpatzten Lebenslauf soll nicht am
 * Kontingent hängen. Burst 15 deckt das ab; 10/Minute bleibt weit unter dem,
 * was ein Angreifer bräuchte, um Firestore und Storage nennenswert zu füllen.
 */
export const MAPPE_QUOTA: Quota = { capacity: 15, refillPerMinute: 10 };

/**
 * Mappe anlegen: ein Bewerber braucht je Stelle eine, und ein zweiter oder
 * dritter Versuch (Frist abgelaufen, neue Stelle) soll gehen. Burst 3, eine je
 * Minute - hoechstens rund 60 offene Mappen je IP und Stunde statt 600.
 */
export const ANLEGEN_QUOTA: Quota = { capacity: 3, refillPerMinute: 1 };

/**
 * Liest den Tool-Namen aus einem geparsten JSON-RPC-Body. Gibt `null` zurück,
 * wenn es kein `tools/call` ist (Handshake, tools/list, ...). Batches (Array)
 * gelten als Fill-Aufruf, sobald ein Element eines ist.
 *
 * Im Normalfall erreicht kein Array diese Stelle: `pruefeAnfrageform`
 * in server.ts weist Batches vorher ab, weil ein Array mit hunderten Aufrufen
 * sonst nur EIN Token kostete. Die Array-Behandlung hier bleibt als zweites Netz.
 */
export function extractToolName(body: unknown): string | null {
  const entries = Array.isArray(body) ? body : [body];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as { method?: unknown; params?: unknown };
    if (record.method !== "tools/call") continue;
    const params = record.params;
    if (typeof params !== "object" || params === null) continue;
    const name = (params as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

export type Anfrageart = "fill" | "dokument" | "mappe" | "anlegen" | "general";

/**
 * Ordnet eine eingehende Anfrage einem Kontingent zu.
 *
 * WICHTIG: Es reicht NICHT, nur `tools/call` anzusehen. Ein Formular lässt sich
 * auch über `resources/read` auf `bw://formular/...` holen - würde nur der
 * Tool-Weg gedrosselt, wäre ausgerechnet der teure Pfad der ungedrosselte.
 *
 * Bei gemischten Batches gewinnt das strengste Kontingent: eine Anfrage, die
 * unter anderem ausfüllt, ist eine Ausfüll-Anfrage. "Strenger" wird dabei aus
 * dem Kontingent selbst abgeleitet (s. `istStrengerAls`) statt aus der
 * Reihenfolge der Zuweisungen hier - sonst gewinnt bei einer gemischten Anfrage
 * schlicht die zuletzt verarbeitete Art, unabhängig davon, wie streng ihr
 * Kontingent tatsächlich ist.
 */
export function classifyRequest(body: unknown): Anfrageart {
  const entries = Array.isArray(body) ? body : [body];
  let art: Anfrageart = "general";
  const verschaerfe = (kandidat: Anfrageart) => {
    if (istStrengerAls(kandidat, art)) art = kandidat;
  };

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as { method?: unknown; params?: unknown };
    const params = typeof record.params === "object" && record.params !== null ? record.params : null;

    if (record.method === "tools/call") {
      const name = (params as { name?: unknown } | null)?.name;
      if (name === FILL_TOOL_NAME) verschaerfe("fill");
      if (name === DOKUMENT_TOOL_NAME) verschaerfe("dokument");
      if (typeof name === "string" && (MAPPE_TOOL_NAMES as readonly string[]).includes(name)) verschaerfe("mappe");
      if (name === ANLEGEN_TOOL_NAME) verschaerfe("anlegen");
    }

    if (record.method === "resources/read") {
      const uri = (params as { uri?: unknown } | null)?.uri;
      if (typeof uri === "string" && uri.startsWith(FORMULAR_URI_PREFIX)) verschaerfe("dokument");
    }
  }

  return art;
}

/**
 * Vergleicht zwei Kontingente über ihre Zahlen, nicht über eine von Hand
 * gepflegte Rangliste: kleinere Nachfüllrate ist strenger, bei Gleichstand
 * entscheidet die kleinere Kapazität. Damit gilt "strengstes Kontingent
 * gewinnt" automatisch weiter, wenn eine neue Art dazukommt.
 */
function istStrengerAls(kandidat: Anfrageart, bisher: Anfrageart): boolean {
  const a = quotaFor(kandidat);
  const b = quotaFor(bisher);
  if (a.refillPerMinute !== b.refillPerMinute) return a.refillPerMinute < b.refillPerMinute;
  return a.capacity < b.capacity;
}

/** Kontingent zu einer Anfrageart. */
export function quotaFor(art: Anfrageart): Quota {
  if (art === "fill") return FILL_QUOTA;
  if (art === "dokument") return DOKUMENT_QUOTA;
  if (art === "mappe") return MAPPE_QUOTA;
  if (art === "anlegen") return ANLEGEN_QUOTA;
  return GENERAL_QUOTA;
}

/** Übernimmt die `id` des Requests, damit der Client die Antwort zuordnen kann. */
export function extractRequestId(body: unknown): string | number | null {
  if (Array.isArray(body) || typeof body !== "object" || body === null) return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" || typeof id === "number" ? id : null;
}
