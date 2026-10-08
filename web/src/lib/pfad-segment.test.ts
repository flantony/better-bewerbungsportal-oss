import { describe, expect, it } from 'vitest';
import { beschrifteBreadcrumbSegment } from './pfad-segment';

describe('beschrifteBreadcrumbSegment', () => {
  it('ersetzt eine pinstGuid-artige ID direkt unter jobs durch Stellenangebot', () => {
    expect(beschrifteBreadcrumbSegment('FA163EC863931FE1AE8110DB12AB9279', 'jobs')).toBe('Stellenangebot');
  });

  it('beschriftet die bekannten Bereiche deutsch statt mit dem englischen Pfad', () => {
    expect(beschrifteBreadcrumbSegment('jobs', 'dashboard')).toBe('Stellenangebote');
    expect(beschrifteBreadcrumbSegment('ki', 'dashboard')).toBe('Mit KI bewerben');
    expect(beschrifteBreadcrumbSegment('konto', 'dashboard')).toBe('Mein Konto');
  });

  it('ersetzt eine pinstGuid-artige ID direkt unter bewerben ebenfalls durch Stellenangebot', () => {
    expect(beschrifteBreadcrumbSegment('FA163EC863931FE1AE8110DB12AB9279', 'bewerben')).toBe('Stellenangebot');
  });

  it('ersetzt eine ID nicht, wenn sie nicht direkt unter jobs liegt', () => {
    expect(beschrifteBreadcrumbSegment('FA163EC863931FE1AE8110DB12AB9279', 'konto')).toBe(
      'FA163EC863931FE1AE8110DB12AB9279'
    );
  });

  it('nennt den Einstieg Übersicht statt Dashboard', () => {
    expect(beschrifteBreadcrumbSegment('dashboard', undefined)).toBe('Übersicht');
  });

  it('grossgeschriebene erste Buchstaben im Standardfall', () => {
    expect(beschrifteBreadcrumbSegment('irgendwas', undefined)).toBe('Irgendwas');
  });
});
