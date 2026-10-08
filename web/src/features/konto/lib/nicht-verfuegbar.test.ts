import { describe, expect, it } from 'vitest';
import { istNichtVerfuegbar, istNichtVerfuegbarFehler } from './nicht-verfuegbar';

describe('istNichtVerfuegbar', () => {
  it('ist wahr bei 404', () => {
    expect(istNichtVerfuegbar(404)).toBe(true);
  });

  it('ist falsch bei anderen Status', () => {
    expect(istNichtVerfuegbar(200)).toBe(false);
    expect(istNichtVerfuegbar(401)).toBe(false);
    expect(istNichtVerfuegbar(500)).toBe(false);
  });
});

// WOZU: eine fehlende Function beantwortet schon den
// CORS-Preflight mit 404 ohne CORS-Header - der Browser laesst `fetch` dann mit
// einem TypeError scheitern, nicht mit einer lesbaren 404-Antwort.
describe('istNichtVerfuegbarFehler', () => {
  it('ist wahr bei einem TypeError aus fetch (Netz-/CORS-Fehler)', () => {
    expect(istNichtVerfuegbarFehler(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('ist wahr bei einem Fehler mit Status 404', () => {
    expect(istNichtVerfuegbarFehler(Object.assign(new Error('weg'), { status: 404 }))).toBe(true);
  });

  it('ist falsch bei anderen Fehlern und Status', () => {
    expect(istNichtVerfuegbarFehler(Object.assign(new Error('kaputt'), { status: 500 }))).toBe(false);
    expect(istNichtVerfuegbarFehler(Object.assign(new Error('abgemeldet'), { status: 401 }))).toBe(false);
    expect(istNichtVerfuegbarFehler(new SyntaxError('kein JSON'))).toBe(false);
    expect(istNichtVerfuegbarFehler(null)).toBe(false);
  });
});
