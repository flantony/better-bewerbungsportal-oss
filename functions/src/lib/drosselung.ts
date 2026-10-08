// Mechanik der Pro-IP-Drosselung - ohne jede Kenntnis davon, WAS gedrosselt
// wird. Eigenes Modul, weil neben dem MCP-Endpunkt (`mcp/lib/rateLimit.ts`)
// auch die vier `onRequest`-Endpunkte der Bewerbungsmappe (`mappeHttp.ts`)
// dieselbe Mechanik brauchen - über sie läuft der eigentliche Dateiverkehr
// (Lebenslauf, Zeugnisse). Zwei
// Implementierungen nebeneinander wären genau ein Ort zu viel, an dem die
// X-Forwarded-For-Falle (s. `clientKeyFromForwardedFor`) zuschnappen kann.
//
// Was hier NICHT liegt: welche Anfrage in welches Kontingent fällt. Das ist
// pro Endpunkt verschieden und bleibt beim jeweiligen Aufrufer
// (`mcp/lib/rateLimit.ts` für den MCP-Endpunkt, `mappeHttp.ts` für die Mappe).
//
// BEWUSSTE GRENZE: Die Buckets liegen im Arbeitsspeicher der jeweiligen
// Function-Instanz, nicht in Firestore. Bei `maxInstances: 10` ist das
// effektive globale Limit also bis zu zehnmal so hoch wie konfiguriert.
// Das fängt naive Abuse-Versuche und Endlosschleifen in fehlerhaften Clients
// ab - es ist keine Verteidigung gegen einen verteilten Angreifer. Ein
// Firestore-Zähler wäre das nicht wert: er würde jeden einzelnen Aufruf mit
// einem zusätzlichen Read+Write belasten.

const MINUTE_MS = 60_000;

export interface Quota {
  /** Maximal ansammelbare Aufrufe (Burst). */
  capacity: number;
  /** Nachfüllrate pro Minute. */
  refillPerMinute: number;
}

/** Obergrenze verfolgter Schlüssel, damit die Map nicht unbegrenzt wächst. */
const MAX_TRACKED_KEYS = 10_000;

interface Bucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillPerMinute: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Nur gesetzt, wenn `allowed === false`. */
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  check(clientKey: string, quota: Quota, kind: string): RateLimitDecision;
  /** Nur für Tests. */
  reset(): void;
}

export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, Bucket>();

  // Wichtig: Buckets werden nur beim `check()` nachgefüllt. Beim Aufräumen muss
  // deshalb der Füllstand *zum jetzigen Zeitpunkt* berechnet werden - sonst
  // gilt ein seit Stunden untätiger Client fälschlich als "noch aktiv" und die
  // Map wird nie kleiner.
  function pruneIdleBuckets(timestamp: number): void {
    for (const [key, bucket] of buckets) {
      const elapsed = Math.max(0, timestamp - bucket.lastRefill);
      const refilled = bucket.tokens + (elapsed / MINUTE_MS) * bucket.refillPerMinute;
      if (refilled >= bucket.capacity) buckets.delete(key);
    }
    // Falls ausschließlich aktive Buckets existieren, hilft Prunen nicht -
    // dann verwerfen wir den ältesten Eintrag, um die Obergrenze zu halten.
    if (buckets.size >= MAX_TRACKED_KEYS) {
      const oldest = buckets.keys().next();
      if (!oldest.done) buckets.delete(oldest.value);
    }
  }

  return {
    check(clientKey, quota, kind) {
      const key = `${kind}:${clientKey}`;
      const timestamp = now();
      let bucket = buckets.get(key);

      if (!bucket) {
        if (buckets.size >= MAX_TRACKED_KEYS) pruneIdleBuckets(timestamp);
        bucket = {
          tokens: quota.capacity,
          lastRefill: timestamp,
          capacity: quota.capacity,
          refillPerMinute: quota.refillPerMinute,
        };
        buckets.set(key, bucket);
      }

      const elapsed = timestamp - bucket.lastRefill;
      if (elapsed > 0) {
        bucket.tokens = Math.min(quota.capacity, bucket.tokens + (elapsed / MINUTE_MS) * quota.refillPerMinute);
        bucket.lastRefill = timestamp;
      }

      if (bucket.tokens < 1) {
        const missing = 1 - bucket.tokens;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((missing / quota.refillPerMinute) * 60)),
        };
      }

      bucket.tokens -= 1;
      return { allowed: true };
    },

    reset() {
      buckets.clear();
    },
  };
}

/**
 * Ermittelt den Drosselungs-Schlüssel aus `X-Forwarded-For`.
 *
 * SICHERHEIT: Bewusst der **letzte** (rechteste) Eintrag, nicht der erste.
 * `X-Forwarded-For` wird von Proxys angehängt; der Client kann den Header mit
 * beliebigen Werten vorbelegen. Der linkeste Eintrag ist damit frei fälschbar -
 * ein Angreifer könnte pro Request eine andere Fantasie-IP schicken und die
 * Pro-IP-Drosselung vollständig umgehen. Der rechteste Eintrag stammt dagegen
 * von der unmittelbar vorgelagerten Google-Infrastruktur und ist nicht
 * clientseitig setzbar. Aus demselben Grund wird `req.ip` hier NICHT verwendet:
 * mit `trust proxy: true` liefert Express genau den fälschbaren linkesten Wert.
 */
export function clientKeyFromForwardedFor(
  forwardedFor: string | string[] | undefined,
  fallback: string | undefined,
): string {
  const raw = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
  const entries = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const adresse = entries.at(-1) ?? fallback;
  return adresse ? drosselSchluessel(adresse) : "unknown";
}

const HEXTETT = /^[0-9a-f]{1,4}$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Schluessel je Client: IPv4 wie sie ist, IPv6 als /64-Praefix.
 *
 * WOZU: ein Internetanschluss bekommt in aller
 * Regel ein ganzes /64 (oft ein /56) zugeteilt - 2^64 Adressen, die alle
 * derselbe Client sind. Mit der vollen Adresse als Schluessel waere die
 * Drosselung fuer jeden IPv6-Nutzer durch Adresswechsel aufhebbar, jede
 * Anfrage bekaeme einen frischen Bucket. Ein Schluessel je /64 entspricht einem
 * Anschluss, wie eine IPv4-Adresse.
 *
 * IPv4-in-IPv6 (`::ffff:1.2.3.4`, so meldet Node lokale IPv4-Verbindungen) wird
 * zur IPv4-Adresse. Was sich nicht als Adresse lesen laesst, bleibt unveraendert
 * Schluessel.
 */
export function drosselSchluessel(adresse: string): string {
  let text = adresse.trim().toLowerCase();
  // "[2001:db8::1]:443" -> "2001:db8::1"; Zonenangabe ("fe80::1%eth0") weg.
  const klammer = /^\[([^\]]+)\](?::\d+)?$/.exec(text);
  if (klammer) text = klammer[1];
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  if (!text.includes(":")) return text;

  const gemappt = /^(?:0{1,4}:){0,4}:?(?:0{0,4}:)?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (gemappt && IPV4.test(gemappt[1])) return gemappt[1];

  const hextette = ipv6Hextette(text);
  if (!hextette) return text;
  return `${hextette.slice(0, 4).join(":")}::/64`;
}

/** Die acht Hextette einer IPv6-Adresse (ohne fuehrende Nullen), oder `null`. */
function ipv6Hextette(text: string): string[] | null {
  const teile = text.split("::");
  if (teile.length > 2) return null;
  const zerlege = (abschnitt: string): string[] | null => {
    if (abschnitt === "") return [];
    const gruppen = abschnitt.split(":");
    const letzte = gruppen.at(-1) ?? "";
    // Eingebettete IPv4 am Ende ("64:ff9b::1.2.3.4") zaehlt als zwei Hextette.
    const v4 = IPV4.exec(letzte);
    if (v4) {
      const [a, b, c, d] = v4.slice(1).map(Number);
      if ([a, b, c, d].some((zahl) => zahl > 255)) return null;
      gruppen.splice(-1, 1, ((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
    }
    return gruppen.every((gruppe) => HEXTETT.test(gruppe)) ? gruppen : null;
  };
  const links = zerlege(teile[0]);
  const rechts = teile.length === 2 ? zerlege(teile[1]) : [];
  if (!links || !rechts) return null;
  const fehlend = 8 - links.length - rechts.length;
  if (teile.length === 2 ? fehlend < 1 : fehlend !== 0) return null;
  const alle = [...links, ...Array<string>(teile.length === 2 ? fehlend : 0).fill("0"), ...rechts];
  return alle.map((gruppe) => parseInt(gruppe, 16).toString(16));
}
