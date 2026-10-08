import { describe, expect, it } from 'vitest';
import {
  kontoSichtSchema,
  unterlageDownloadUrlSchema,
  unterlageSichtSchema,
  unterlageUploadUrlAntwortSchema
} from './schema';

// WOZU: `ladeKonto` vertraut der Serverantwort nicht blind (kein blosser
// Type-Cast). Eine unerwartete Serverantwort waere sonst erst als kryptischer
// Runtime-Fehler tief in der Seite sichtbar statt als klare Meldung.
const GUELTIGER_FILTER = {
  id: 'f1',
  name: 'Berlin',
  filter: { wunschort: 'Berlin' },
  aktiv: true,
  quelle: 'ki',
  erstelltAm: '2026-10-08T00:00:00.000Z'
};

const GUELTIGE_ANTWORT = {
  suchprofile: [GUELTIGER_FILTER],
  merkliste: [{ pinstGuid: 'abc123', gemerktAm: '2026-01-01T00:00:00.000Z' }],
  optionen: {
    organisationsbereich: ['Heer'],
    laufbahngruppe: ['mannschaften'],
    bundesland: ['Bayern'],
    vertragsarten: ['SaZ'],
    einstiegswege: ['seiteneinstieg'],
    laufbahngruppeBedeutung: { mannschaften: 'Mannschaften' },
    einstiegswegBedeutung: { seiteneinstieg: 'Seiteneinstieg' }
  },
  benachrichtigung: { aktiv: false, emailBestaetigt: false }
};

describe('kontoSichtSchema', () => {
  it('akzeptiert eine gueltige Antwort', () => {
    expect(kontoSichtSchema.safeParse(GUELTIGE_ANTWORT).success).toBe(true);
  });

  it('akzeptiert Merklisten-Eintraege mit und ohne Herkunft aus der Mail und behaelt sie', () => {
    const ergebnis = kontoSichtSchema.parse({
      ...GUELTIGE_ANTWORT,
      merkliste: [
        { pinstGuid: 'mail', gemerktAm: '2026-10-12T02:00:00.000Z', ausMail: '2026-10-12T02:00:00.000Z' },
        { pinstGuid: 'alt', gemerktAm: '2026-01-01T00:00:00.000Z' }
      ]
    });
    expect(ergebnis.merkliste[0].ausMail).toBe('2026-10-12T02:00:00.000Z');
    expect(ergebnis.merkliste[1]).not.toHaveProperty('ausMail');
  });

  it('akzeptiert eine leere Filterliste', () => {
    expect(kontoSichtSchema.safeParse({ ...GUELTIGE_ANTWORT, suchprofile: [] }).success).toBe(true);
  });

  it('akzeptiert einen Filter mit Feldern, die das Formular nicht zeigt', () => {
    const antwort = { ...GUELTIGE_ANTWORT, suchprofile: [{ ...GUELTIGER_FILTER, filter: { mindestbesoldung: 9 } }] };
    expect(kontoSichtSchema.safeParse(antwort).success).toBe(true);
  });

  // WOZU: Web und Functions werden getrennt ausgerollt - eine Antwort ohne
  // `suchprofile` (auch mit unbekannten Feldern) darf die Seite nicht brechen.
  it('akzeptiert eine Antwort ohne suchprofile und macht daraus eine leere Liste', () => {
    const { suchprofile: _suchprofile, ...ohneListe } = GUELTIGE_ANTWORT;
    const geprueft = kontoSichtSchema.safeParse({ ...ohneListe, suchprofil: { wunschort: 'Berlin' } });
    expect(geprueft.success).toBe(true);
    expect(geprueft.data?.suchprofile).toEqual([]);
  });

  it('macht aus einer unbekannten quelle einen von Hand angelegten Filter, statt abzubrechen', () => {
    const antwort = { ...GUELTIGE_ANTWORT, suchprofile: [{ ...GUELTIGER_FILTER, quelle: 'import' }] };
    const geprueft = kontoSichtSchema.safeParse(antwort);
    expect(geprueft.success).toBe(true);
    expect(geprueft.data?.suchprofile[0].quelle).toBe('hand');
  });

  it('faellt durch, wenn ein Filter keine Kennung hat', () => {
    const { id: _id, ...ohneId } = GUELTIGER_FILTER;
    expect(kontoSichtSchema.safeParse({ ...GUELTIGE_ANTWORT, suchprofile: [ohneId] }).success).toBe(false);
  });

  it('faellt durch, wenn optionen fehlt', () => {
    const { optionen: _optionen, ...ohneOptionen } = GUELTIGE_ANTWORT;
    expect(kontoSichtSchema.safeParse(ohneOptionen).success).toBe(false);
  });

  it('faellt durch, wenn merkliste fehlt', () => {
    const { merkliste: _merkliste, ...ohneMerkliste } = GUELTIGE_ANTWORT;
    expect(kontoSichtSchema.safeParse(ohneMerkliste).success).toBe(false);
  });

  // WOZU: Web und Functions werden getrennt ausgerollt - fehlt
  // `benachrichtigung` in der Antwort, braeche ohne diese Toleranz jede
  // angemeldete Seite.
  it('akzeptiert eine Antwort ohne benachrichtigung und macht daraus null', () => {
    const { benachrichtigung: _benachrichtigung, ...ohneBenachrichtigung } = GUELTIGE_ANTWORT;
    const geprueft = kontoSichtSchema.safeParse(ohneBenachrichtigung);
    expect(geprueft.success).toBe(true);
    expect(geprueft.data?.benachrichtigung).toBeNull();
  });

  // Funktionsschalter BEWERBERDATEN_IM_KONTO: der Server meldet ihn,
  // das Web hat keine eigene Kopie. Ein kontoLaden ohne das Feld heisst "aus".
  it('macht aus einem fehlenden bewerberdatenAktiv false', () => {
    const geprueft = kontoSichtSchema.safeParse(GUELTIGE_ANTWORT);
    expect(geprueft.success).toBe(true);
    expect(geprueft.data?.bewerberdatenAktiv).toBe(false);
  });

  it('uebernimmt bewerberdatenAktiv vom Server', () => {
    expect(kontoSichtSchema.safeParse({ ...GUELTIGE_ANTWORT, bewerberdatenAktiv: true }).data?.bewerberdatenAktiv).toBe(true);
    expect(kontoSichtSchema.safeParse({ ...GUELTIGE_ANTWORT, bewerberdatenAktiv: false }).data?.bewerberdatenAktiv).toBe(false);
  });

  it('faellt durch, wenn bewerberdatenAktiv kein Wahrheitswert ist', () => {
    expect(kontoSichtSchema.safeParse({ ...GUELTIGE_ANTWORT, bewerberdatenAktiv: 'ja' }).success).toBe(false);
  });

  it('faellt durch, wenn benachrichtigung die falsche Form hat', () => {
    const antwort = { ...GUELTIGE_ANTWORT, benachrichtigung: { aktiv: 'ja' } };
    expect(kontoSichtSchema.safeParse(antwort).success).toBe(false);
  });
});

// WOZU: Upload-URL, Registrierung und Download-URL werden nicht blind der
// Serverantwort entnommen - eine kaputte Antwort waere sonst erst als
// kryptischer Fehler beim PUT bzw. als Navigation ins Leere sichtbar.
describe('unterlageUploadUrlAntwortSchema', () => {
  const GUELTIG = {
    docId: 'abc',
    uploadUrl: 'https://storage.googleapis.com/bucket/konten/u/eingang/abc?X-Goog-Signature=1',
    pflichtHeader: { 'x-goog-content-length-range': '0,1000' }
  };

  it('akzeptiert eine gueltige Antwort', () => {
    expect(unterlageUploadUrlAntwortSchema.safeParse(GUELTIG).success).toBe(true);
  });

  it('faellt durch ohne docId, ohne https-URL oder mit falschen Kopfzeilen', () => {
    expect(unterlageUploadUrlAntwortSchema.safeParse({ ...GUELTIG, docId: '' }).success).toBe(false);
    expect(unterlageUploadUrlAntwortSchema.safeParse({ ...GUELTIG, uploadUrl: 'keine-url' }).success).toBe(false);
    expect(unterlageUploadUrlAntwortSchema.safeParse({ ...GUELTIG, uploadUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(unterlageUploadUrlAntwortSchema.safeParse({ ...GUELTIG, pflichtHeader: { a: 1 } }).success).toBe(false);
  });
});

describe('unterlageSichtSchema', () => {
  const GUELTIG = {
    docId: 'abc',
    art: 'zeugnis',
    dateiname: 'z.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1000,
    hochgeladenAm: '2026-01-01T00:00:00.000Z'
  };

  it('akzeptiert eine registrierte Unterlage', () => {
    expect(unterlageSichtSchema.safeParse(GUELTIG).success).toBe(true);
  });

  it('faellt durch bei unbekannter Art oder fehlender Groesse', () => {
    expect(unterlageSichtSchema.safeParse({ ...GUELTIG, art: 'pass' }).success).toBe(false);
    const { sizeBytes: _sizeBytes, ...ohneGroesse } = GUELTIG;
    expect(unterlageSichtSchema.safeParse(ohneGroesse).success).toBe(false);
  });
});

describe('unterlageDownloadUrlSchema', () => {
  it('akzeptiert eine https-URL', () => {
    expect(unterlageDownloadUrlSchema.safeParse({ url: 'https://storage.googleapis.com/x?sig=1' }).success).toBe(true);
  });

  it('faellt durch ohne url oder mit einem anderen Protokoll', () => {
    expect(unterlageDownloadUrlSchema.safeParse({}).success).toBe(false);
    expect(unterlageDownloadUrlSchema.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
    expect(unterlageDownloadUrlSchema.safeParse({ url: 'http://storage.googleapis.com/x' }).success).toBe(false);
  });
});
