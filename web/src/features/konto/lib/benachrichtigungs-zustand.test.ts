import { describe, expect, it } from 'vitest';
import type { KontoSicht, Suchprofil } from '../api/types';
import { benachrichtigungsZustand } from './benachrichtigungs-zustand';

// WOZU: der Schalter fuer Benachrichtigungen ist in genau zwei Faellen
// gesperrt (kein aktiver Filter, unbestaetigte Mail) - diese reine Funktion
// entscheidet, welcher davon (falls ueberhaupt) zutrifft, damit die
// Komponente selbst keine Verzweigung ueber `sicht` braucht.
const OPTIONEN = {
  organisationsbereich: [],
  laufbahngruppe: [],
  bundesland: [],
  vertragsarten: [],
  einstiegswege: [],
  laufbahngruppeBedeutung: {},
  einstiegswegBedeutung: {}
};

function filter(f: Suchprofil, aktiv = true) {
  return { id: 'a', filter: f, aktiv, quelle: 'hand' as const, erstelltAm: '2026-10-08T00:00:00.000Z' };
}

function sicht(teile: Partial<KontoSicht>): KontoSicht {
  return {
    suchprofile: [],
    merkliste: [],
    optionen: OPTIONEN,
    benachrichtigung: { aktiv: false, emailBestaetigt: false },
    bewerberdatenAktiv: false,
    ...teile
  };
}

describe('benachrichtigungsZustand', () => {
  it('ist "nicht-verfuegbar", solange der Server keine benachrichtigung schickt', () => {
    const wert = sicht({ suchprofile: [filter({ wunschort: 'Berlin' })], benachrichtigung: null });
    expect(benachrichtigungsZustand(wert)).toBe('nicht-verfuegbar');
  });

  it('ist "kein-profil" bei einem Filter ohne gesetztes Feld', () => {
    const benachrichtigung = { aktiv: false, emailBestaetigt: true };
    expect(benachrichtigungsZustand(sicht({ suchprofile: [filter({})], benachrichtigung }))).toBe('kein-profil');
    expect(
      benachrichtigungsZustand(sicht({ suchprofile: [filter({ bundesland: [], wunschort: '' })], benachrichtigung }))
    ).toBe('kein-profil');
    const nurVorgaben = { taetigkeitsbereich: 'beide', beschaeftigungsumfang: 'beide', seiteneinstieg: false } as const;
    expect(benachrichtigungsZustand(sicht({ suchprofile: [filter(nurVorgaben)], benachrichtigung }))).toBe('kein-profil');
    expect(benachrichtigungsZustand(sicht({ suchprofile: [filter({ bundesland: ['Bayern'] })], benachrichtigung }))).toBe(
      'bereit'
    );
  });

  it('ist "kein-profil" ohne gespeicherten Filter', () => {
    expect(benachrichtigungsZustand(sicht({ suchprofile: [] }))).toBe('kein-profil');
  });

  it('ist "kein-profil", wenn alle Filter pausiert sind, und "bereit", sobald einer aktiv ist', () => {
    const benachrichtigung = { aktiv: false, emailBestaetigt: true };
    const pausiert = filter({ bundesland: ['Bayern'] }, false);
    expect(benachrichtigungsZustand(sicht({ suchprofile: [pausiert], benachrichtigung }))).toBe('kein-profil');
    expect(
      benachrichtigungsZustand(
        sicht({ suchprofile: [pausiert, { ...filter({ suchbegriff: 'IT' }), id: 'b' }], benachrichtigung })
      )
    ).toBe('bereit');
  });

  it('ist "unbestaetigt" mit Suchprofil, aber ohne bestaetigte Mail', () => {
    const wert = sicht({
      suchprofile: [filter({ wunschort: 'Berlin' })],
      benachrichtigung: { aktiv: false, emailBestaetigt: false }
    });
    expect(benachrichtigungsZustand(wert)).toBe('unbestaetigt');
  });

  it('ist "bereit" mit Suchprofil und bestaetigter Mail', () => {
    const wert = sicht({
      suchprofile: [filter({ wunschort: 'Berlin' })],
      benachrichtigung: { aktiv: false, emailBestaetigt: true }
    });
    expect(benachrichtigungsZustand(wert)).toBe('bereit');
  });

  it('bleibt "bereit", auch wenn die Benachrichtigung schon aktiv ist', () => {
    const wert = sicht({
      suchprofile: [filter({ wunschort: 'Berlin' })],
      benachrichtigung: { aktiv: true, emailBestaetigt: true }
    });
    expect(benachrichtigungsZustand(wert)).toBe('bereit');
  });
});
