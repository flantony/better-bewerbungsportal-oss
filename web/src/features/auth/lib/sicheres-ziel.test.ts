import { describe, expect, it } from 'vitest';
import { sicheresZiel } from './sicheres-ziel';

// WOZU: `weiter` kommt aus der URL - jeder kann einen Anmeldelink bauen, der
// nach dem Login auf eine fremde Seite fuehrt. Ein Pruefen auf "/" und "//"
// reichte nicht: `/\evil.com` und `/%09/evil.com` loesen im Browser auf einen
// anderen Host auf.
describe('sicheresZiel', () => {
  const origin = 'https://bewerbung.example';

  it('behaelt einen eigenen Pfad', () => {
    expect(sicheresZiel('/dashboard/merkliste', origin)).toBe('/dashboard/merkliste');
  });

  it('behaelt Query und Hash', () => {
    expect(sicheresZiel('/dashboard/konto?tab=profil#oben', origin)).toBe('/dashboard/konto?tab=profil#oben');
  });

  // '/\t/evil.com' ist die Form, in der URLSearchParams ein `%09` aus der
  // Adresszeile tatsaechlich zurueckgibt.
  it.each(['//evil.com', '/\\evil.com', '/%09/evil.com', '/\t/evil.com', 'https://evil.com', 'javascript:alert(1)'])(
    'weist %j ab',
    (weiter) => {
      expect(sicheresZiel(weiter, origin)).toBe('/dashboard/konto');
    }
  );

  // Diese Formen bleiben fuer den URL-Parser auf dieser Seite - erst der
  // normalisierte Pfad ist `//evil.com`, und den nimmt `router.push` als Host.
  it.each([
    '/.//evil.com',
    '/..//evil.com',
    '/a/..//evil.com',
    '/%2e//evil.com',
    '/%2E%2E//evil.com',
    '/.\\/evil.com',
    '\\\\evil.com',
    '/%2F/evil.com',
    '/%5C/evil.com'
  ])('weist das normalisiert fremde Ziel %j ab', (weiter) => {
    expect(sicheresZiel(weiter, origin)).toBe('/dashboard/konto');
  });

  it('behaelt einen eigenen Pfad mit Punktsegment', () => {
    expect(sicheresZiel('/dashboard/./merkliste', origin)).toBe('/dashboard/merkliste');
  });

  it('faellt ohne Ziel auf den Rueckfall zurueck', () => {
    expect(sicheresZiel(null, origin)).toBe('/dashboard/konto');
    expect(sicheresZiel('', origin)).toBe('/dashboard/konto');
    expect(sicheresZiel(null, origin, '/')).toBe('/');
  });
});
