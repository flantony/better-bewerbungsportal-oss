import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DatenschutzPage from './page';

/**
 * WOZU: die Erklaerung muss zu DSFA.md und zum Code passen. Diese Tests halten
 * die Saetze fest, an denen das leicht auseinanderlaeuft - nicht den ganzen Text.
 */
describe('Datenschutzerklaerung', () => {
  const text = renderToStaticMarkup(createElement(DatenschutzPage)).replace(/<[^>]+>/g, ' ');

  it('behauptet weder, es gebe kein Konto, noch, Formularangaben wuerden nach dem Abruf nicht gespeichert', () => {
    expect(text).not.toMatch(/weil es kein Konto gibt/);
    expect(text).not.toMatch(/nach dem einen Abruf nicht gespeichert|danach nicht gespeichert/);
  });

  it('nennt beide Faelle der Mappen-Frist (nach Paketbau, ohne Paket nach letzter Aenderung)', () => {
    expect(text).toMatch(/eine Stunde, nachdem dein Download-Paket\s+gebaut wurde/);
    expect(text).toMatch(/Wird nie ein Paket gebaut, eine Stunde nach der letzten Änderung/);
  });

  it('nennt Server-Protokolle mit IP-Adresse und ihre Aufbewahrung von 30 Tagen', () => {
    expect(text).toMatch(/IP-Adresse/);
    expect(text).toMatch(/30 Tagen/);
  });

  it('nennt den Widerruf von Einwilligungen, die Aufsichtsbehoerde und das Beschwerderecht', () => {
    expect(text).toMatch(/Art\. 7 Abs\. 3 DSGVO/);
    expect(text).toMatch(/Art\. 77 DSGVO/);
    expect(text).toMatch(/Landesdatenschutzbehörde/);
  });

  it('stellt Gemini nicht als EU-gebunden dar und nennt die tatsaechlichen Regionen', () => {
    expect(text).toMatch(/ohne Festlegung auf eine Region/);
    expect(text).toMatch(/europe-west4/);
  });

  it('nennt den Zwischenspeicher der Angaben im Browser auf der Bewerben-Seite', () => {
    expect(text).toMatch(/Arbeitsspeicher dieses Browser-Tabs/);
  });

  it('sagt, dass wir keine Ausweiskopien entgegennehmen, und bietet keine Einwilligung dafuer an', () => {
    expect(text).toMatch(/Ausweiskopien nehmen wir nicht\s+entgegen/);
    expect(text).not.toMatch(/Ausweiskopie im Konto/);
    expect(text).not.toMatch(/eigenen Haken/);
  });

  it('nennt Frankfurt als Ort der Server-Protokolle und den Uebergang fuer aeltere Eintraege', () => {
    expect(text).toMatch(/Server-Protokolle führt Google Cloud Logging, seit dem 7\. Oktober\s+2026 ebenfalls in Frankfurt/);
    expect(text).toMatch(/ältere Protokolle/);
  });

  // Funktionsschalter BEWERBERDATEN_IM_KONTO ist aus.
  it('sagt, dass Angaben, Unterlagen und Paket aus dem Konto derzeit nicht angeboten werden - und was mit gespeicherten Daten ist', () => {
    expect(text).toMatch(/Derzeit nicht angeboten: Angaben, Unterlagen und Bewerben mit deinem Konto/);
    expect(text).toMatch(/Seit dem 8\. Oktober 2026/);
    expect(text).toMatch(/Früher gespeicherte Angaben und Unterlagen/);
  });

  it('nennt den bezahlten Gemini-Tarif', () => {
    expect(text).toMatch(/im bezahlten Tarif/);
  });

  it('beschreibt den Drittlandtransfer bei Resend als offen, nicht als geklaert', () => {
    expect(text).toMatch(/Resend/);
    expect(text).toMatch(/wird derzeit\s+geprüft/);
  });
});
