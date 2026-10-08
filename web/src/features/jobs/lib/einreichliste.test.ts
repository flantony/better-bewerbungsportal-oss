import { describe, expect, it } from 'vitest';
import type { JobDetail } from '../api/types';
import { BEWERBUNGSPORTAL_URL, checklisteFuerStelle, checklistenDateiname, KEINE_UNTERLAGENLISTE_FUER_BEWERBER } from './einreichliste';

// Dass diese Liste dasselbe sagt wie get_document_requirements, prueft
// functions/src/lib/einreichlisteSpiegel.test.ts. Hier: was in der Checkliste
// steht - und was nie darin stehen darf.

const SITE = 'https://better-bewerbungsportal.de';

function stelle(teile: Partial<JobDetail> = {}): JobDetail {
  return {
    pinstGuid: '0123456789ABCDEF0123456789ABCDEF',
    refCode: '2026-1-CIR-Fw-IT-E',
    title: 'Feldwebel IT (m/w/d)',
    besOrt: 'Bonn',
    contractTypeLabel: null,
    applicationEnd: '31.12.2026',
    arbeitszeit: '100.00',
    companyDesc: '',
    jobDesc: '',
    requireDesc: '',
    remarcDesc: '',
    // Namen und Telefonnummer einer Ansprechperson - duerfen nie in die Checkliste.
    contactDesc: '<p>Ansprechpartner: Hauptfeldwebel Mueller-Testmann, Tel. 0221-1234567, mueller@example.org</p>',
    documents: [
      { attHeader: 'Bewerbungsbogen_Militärisch', contentType: 'application/pdf', sizeBytes: 1, downloadUrl: 'https://example.org/bogen.pdf' },
      { attHeader: 'Anlage 1 zum Bewerbungsbogen', contentType: 'application/pdf', sizeBytes: 1, downloadUrl: 'https://example.org/anlage1.pdf' },
      { attHeader: 'Beiblatt Staatenliste', contentType: 'application/pdf', sizeBytes: 1, downloadUrl: 'https://example.org/beiblatt.pdf' },
      { attHeader: 'Factsheet_Fw_IT', contentType: 'application/pdf', sizeBytes: 1, downloadUrl: 'https://example.org/factsheet.pdf' },
      { attHeader: 'TD_Teil_1_31940726', contentType: 'application/pdf', sizeBytes: 1, downloadUrl: 'https://example.org/td.pdf' }
    ],
    unterlagen: ['einen tabellarischen Lebenslauf', 'Zeugniskopien', 'Kopie des Personalausweises'],
    unterlagenHinweise: 'Bitte alles als PDF.',
    hotJob: false,
    active: true,
    reqIndustry: 1,
    ...teile
  };
}

describe('checklisteFuerStelle - Inhalt', () => {
  const { liste, text, dateiname } = checklisteFuerStelle(stelle(), SITE);

  it('nennt die Unterlagen in normalisierter Form und die formalen Hinweise', () => {
    expect(liste.unterlagen).toEqual(['tabellarischen Lebenslauf', 'Zeugniskopien', 'Kopie des Personalausweises']);
    expect(text).toContain('  - tabellarischen Lebenslauf');
    expect(text).toContain('Formale Hinweise: Bitte alles als PDF.');
  });

  it('sagt, dass die Ausweiskopie selbst beizulegen ist, wenn die Ausschreibung eine verlangt', () => {
    expect(liste.ausweiskopieSelbstBeilegen).toBe(true);
    expect(text.replace(/\s+/g, ' ')).toContain('lege sie selbst bei. Wir nehmen keine Ausweiskopien entgegen');
  });

  it('listet Bewerbungsbogen und Vordrucke zum Ausfüllen und Unterschreiben mit Download-Link', () => {
    expect(text).toContain('FORMULARE AUSFÜLLEN UND UNTERSCHREIBEN');
    expect(text).toContain('  - Bewerbungsbogen_Militärisch\n    Download: https://example.org/bogen.pdf');
    expect(text).toContain('  - Anlage 1 zum Bewerbungsbogen\n    Download: https://example.org/anlage1.pdf');
    expect(text.replace(/\s+/g, ' ')).toContain('Ohne ihn ist die Bewerbung unvollständig');
  });

  it('nimmt Informationsmaterial und Beiblätter nicht als Formular auf, nennt Unklares zum Prüfen', () => {
    expect(text).not.toContain('Factsheet_Fw_IT');
    expect(text).not.toContain('Beiblatt Staatenliste');
    expect(text).toContain('WEITERE DATEIEN DER AUSSCHREIBUNG');
    expect(text).toContain('  - TD_Teil_1_31940726');
  });

  it('nennt den Einreichweg mit offizieller Portaladresse und Kennung', () => {
    const flach = text.replace(/\s+/g, ' ');
    expect(text).toContain('EINREICHEN');
    expect(flach).toContain(BEWERBUNGSPORTAL_URL);
    expect(flach).toContain('über ihre Kennung 2026-1-CIR-Fw-IT-E');
    expect(flach).toContain('die in der Ausschreibung genannte Ansprechperson');
  });

  it('nennt Stelle, Kennung und Link im Kopf und sagt, dass wir nicht die Bundeswehr sind', () => {
    expect(text).toContain('Feldwebel IT (m/w/d)');
    expect(text).toContain('Kennung: 2026-1-CIR-Fw-IT-E');
    expect(text).toContain(`${SITE}/dashboard/jobs/0123456789ABCDEF0123456789ABCDEF`);
    expect(text).toMatch(/nicht von der Bundeswehr/);
    expect(dateiname).toBe('Checkliste_2026-1-CIR-Fw-IT-E.txt');
  });

  it('enthält nie etwas aus contactDesc', () => {
    expect(text).not.toMatch(/Mueller-Testmann|0221-1234567|mueller@example\.org|Ansprechpartner:/);
    expect(JSON.stringify(liste)).not.toMatch(/Mueller-Testmann/);
  });

  it('bricht keine Zeile über 84 Zeichen, außer bei langen Links', () => {
    for (const zeile of text.split('\n')) {
      if (!/https?:\/\//.test(zeile)) expect(zeile.length).toBeLessThanOrEqual(84);
    }
  });
});

describe('checklisteFuerStelle - Leerfälle', () => {
  it('sagt ohne Unterlagenliste nie "nichts nötig", sondern was üblich und verbindlich ist', () => {
    const { liste, text } = checklisteFuerStelle(stelle({ unterlagen: [], documents: [] }), SITE);
    expect(liste.unterlagenHinweis).toBe(KEINE_UNTERLAGENLISTE_FUER_BEWERBER);
    expect(text.replace(/\s+/g, ' ')).toContain('Unterlagen brauchst du trotzdem');
    expect(liste.ausweiskopieSelbstBeilegen).toBe(false);
    expect(text).not.toMatch(/Ausweiskopie/);
  });

  it('erklärt, dass ohne beiliegenden Bogen keiner auszufüllen ist', () => {
    const { text } = checklisteFuerStelle(stelle({ documents: [] }), SITE);
    expect(text).toContain('FORMULARE');
    expect(text.replace(/\s+/g, ' ')).toContain('Dieser Ausschreibung liegt kein Bewerbungsbogen bei');
  });
});

describe('checklistenDateiname', () => {
  it('ersetzt Zeichen, die im Dateinamen stören', () => {
    expect(checklistenDateiname('A/B C?')).toBe('Checkliste_A_B_C.txt');
    expect(checklistenDateiname('')).toBe('Checkliste.txt');
  });
});
