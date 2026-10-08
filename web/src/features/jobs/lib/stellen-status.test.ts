import { describe, expect, it } from 'vitest';
import { beschaeftigungsumfangLabel, bewerbungMoeglich, fristAbgelaufen } from './stellen-status';

// Mittags in Berlin, damit die Zeitzone des Testrechners keine Rolle spielt.
const AM_7_OKTOBER = new Date('2026-10-07T10:00:00Z');

describe('fristAbgelaufen', () => {
  // Eine Stelle mit vergangener Frist darf keinen aktiven Knopf "Bewerben" zeigen.
  it('erkennt eine vergangene Frist', () => {
    expect(fristAbgelaufen('30.09.2026', AM_7_OKTOBER)).toBe(true);
  });

  it('laesst den Stichtag selbst offen', () => {
    expect(fristAbgelaufen('07.10.2026', AM_7_OKTOBER)).toBe(false);
    expect(fristAbgelaufen('07.10.2026', new Date('2026-10-07T21:30:00Z'))).toBe(false);
  });

  it('rechnet in deutscher Zeit, nicht in UTC', () => {
    // 22:30 UTC am 07.10. ist in Berlin schon der 08.10.
    expect(fristAbgelaufen('07.10.2026', new Date('2026-10-07T22:30:00Z'))).toBe(true);
  });

  it('haelt eine kuenftige Frist fuer offen', () => {
    expect(fristAbgelaufen('31.12.2026', AM_7_OKTOBER)).toBe(false);
  });

  it('haelt fehlende oder unlesbare Fristen fuer offen', () => {
    expect(fristAbgelaufen('', AM_7_OKTOBER)).toBe(false);
    expect(fristAbgelaufen('laufend', AM_7_OKTOBER)).toBe(false);
    // Fehlt das Feld im Firestore-Dokument, darf die Seite nicht abstuerzen.
    expect(fristAbgelaufen(undefined, AM_7_OKTOBER)).toBe(false);
  });
});

describe('bewerbungMoeglich', () => {
  it('ist nur bei aktiver Stelle mit offener Frist moeglich', () => {
    expect(bewerbungMoeglich({ active: true, applicationEnd: '31.12.2026' }, AM_7_OKTOBER)).toBe(true);
    expect(bewerbungMoeglich({ active: true, applicationEnd: '30.09.2026' }, AM_7_OKTOBER)).toBe(false);
    expect(bewerbungMoeglich({ active: false, applicationEnd: '31.12.2026' }, AM_7_OKTOBER)).toBe(false);
  });
});

describe('beschaeftigungsumfangLabel', () => {
  // Die API liefert "100.00" - ein Vergleich mit "100" machte daraus
  // "Teilzeit (100.00%)".
  it('nennt 100 Prozent Vollzeit, egal wie die Zahl geschrieben ist', () => {
    expect(beschaeftigungsumfangLabel('100.00')).toBe('Vollzeit');
    expect(beschaeftigungsumfangLabel('100')).toBe('Vollzeit');
  });

  it('nennt weniger als 100 Prozent Teilzeit mit glatter Prozentzahl', () => {
    expect(beschaeftigungsumfangLabel('50.00')).toBe('Teilzeit (50 %)');
    expect(beschaeftigungsumfangLabel('75.50')).toBe('Teilzeit (75,5 %)');
  });

  it('zeigt nichts, wenn die Angabe fehlt oder unlesbar ist', () => {
    expect(beschaeftigungsumfangLabel('')).toBeNull();
    expect(beschaeftigungsumfangLabel('k.A.')).toBeNull();
    expect(beschaeftigungsumfangLabel('0')).toBeNull();
  });
});
