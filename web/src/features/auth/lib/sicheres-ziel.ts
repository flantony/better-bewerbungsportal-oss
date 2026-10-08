/**
 * Ziel nach der Anmeldung aus dem `weiter`-Parameter - nur, wenn es auf dieser
 * Seite bleibt. Geprueft wird mit dem URL-Parser des Browsers statt mit
 * `startsWith`, weil `/\evil.com` oder ein Tab nach dem ersten Schraegstrich
 * dort zu einem fremden Host werden.
 *
 * Zusaetzlich wird die einmal dekodierte Fassung geprueft: `/%09/evil.com`
 * ist fuer sich ein harmloser Pfad, wird aber nach einer weiteren Dekodierung
 * irgendwo auf dem Weg zu `//evil.com`. Was sich nicht dekodieren laesst,
 * faellt auf den Rueckfall.
 *
 * Geprueft wird ausserdem das ERGEBNIS: `/.//evil.com` oder `/%2e//evil.com`
 * bleiben fuer den Parser auf dieser Seite, ihr normalisierter Pfad ist aber
 * `//evil.com` - und den liest `router.push` als fremden Host.
 */
const EIGENER_PFAD = /^\/(?![/\\])/;

export function sicheresZiel(weiter: string | null, origin: string, rueckfall = '/dashboard/konto'): string {
  if (!weiter) return rueckfall;
  try {
    for (const kandidat of [weiter, decodeURIComponent(weiter)]) {
      if (new URL(kandidat, origin).origin !== origin) return rueckfall;
    }
    const u = new URL(weiter, origin);
    const ziel = u.pathname + u.search + u.hash;
    for (const kandidat of [ziel, decodeURIComponent(ziel)]) {
      if (!EIGENER_PFAD.test(kandidat)) return rueckfall;
    }
    return ziel;
  } catch {
    return rueckfall;
  }
}
