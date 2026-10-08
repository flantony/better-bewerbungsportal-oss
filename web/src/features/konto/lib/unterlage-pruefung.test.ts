import { describe, expect, it } from 'vitest';
import { pruefeUnterlageVorAuswahl } from './unterlage-pruefung';

const LEERER_BESTAND = { anzahl: 0, bytes: 0 };

describe('pruefeUnterlageVorAuswahl', () => {
  it('akzeptiert eine gueltige PDF-Datei', () => {
    const ergebnis = pruefeUnterlageVorAuswahl(
      { art: 'lebenslauf', contentType: 'application/pdf', sizeBytes: 1024 },
      LEERER_BESTAND
    );
    expect(ergebnis).toEqual({ ok: true });
  });

  it('lehnt einen nicht erlaubten Dateityp ab', () => {
    const ergebnis = pruefeUnterlageVorAuswahl(
      { art: 'sonstiges', contentType: 'application/zip', sizeBytes: 1024 },
      LEERER_BESTAND
    );
    expect(ergebnis).toEqual({ ok: false, fehler: 'Erlaubt sind PDF, JPEG und PNG.' });
  });

  it('lehnt eine zu grosse Datei ab', () => {
    const ergebnis = pruefeUnterlageVorAuswahl(
      { art: 'sonstiges', contentType: 'application/pdf', sizeBytes: 11 * 1024 * 1024 },
      LEERER_BESTAND
    );
    expect(ergebnis).toEqual({ ok: false, fehler: 'Eine Datei darf höchstens 10 MB haben.' });
  });

  it('lehnt ab, wenn schon 15 Dateien vorliegen', () => {
    const ergebnis = pruefeUnterlageVorAuswahl(
      { art: 'sonstiges', contentType: 'application/pdf', sizeBytes: 1024 },
      { anzahl: 15, bytes: 0 }
    );
    expect(ergebnis).toEqual({ ok: false, fehler: 'Ein Konto nimmt höchstens 15 Dateien.' });
  });

  it('lehnt ab, wenn die Gesamtgroesse ueberschritten wuerde', () => {
    const ergebnis = pruefeUnterlageVorAuswahl(
      { art: 'sonstiges', contentType: 'application/pdf', sizeBytes: 2 * 1024 * 1024 },
      { anzahl: 1, bytes: 49 * 1024 * 1024 }
    );
    expect(ergebnis).toEqual({ ok: false, fehler: 'Ein Konto darf insgesamt höchstens 50 MB haben.' });
  });
});
