import { describe, expect, it } from "vitest";
import {
  istOneClickAnfrage,
  pruefeAbbestellParameter,
  pruefeBenachrichtigungsAnfrage,
  pruefeLoeschAnfrage,
  pruefeMerklistenAnfrage,
  pruefeSuchprofileAnfrage,
  pruefeSuchprofilIdAbfrage,
} from "./kontoAnfragen";

/**
 * WOZU: Alles, was der Browser schickt, ist Nutzereingabe und wird
 * serverseitig validiert. Die Pruefung ist rein, damit sie ohne Firestore
 * testbar ist - der Endpunkt reicht nur weiter.
 */
describe("pruefeSuchprofileAnfrage", () => {
  it("nimmt hinzufuegen an und setzt quelle 'hand' als Vorgabe", () => {
    const r = pruefeSuchprofileAnfrage({ aktion: "hinzufuegen", suchprofile: [{ filter: { wunschort: "Köln" } }] });
    expect(r).toEqual({
      ok: true,
      wert: { aktion: "hinzufuegen", suchprofile: [{ filter: { wunschort: "Köln" }, quelle: "hand" }] },
    });
  });

  it("uebernimmt quelle 'ki' und einen getrimmten Namen; ein leerer Name entfaellt", () => {
    const r = pruefeSuchprofileAnfrage({
      aktion: "hinzufuegen",
      suchprofile: [
        { filter: { suchbegriff: "IT" }, name: "  IT im Westen ", quelle: "ki" },
        { filter: { suchbegriff: "Sanitäter" }, name: "   " },
      ],
    });
    expect(r).toEqual({
      ok: true,
      wert: {
        aktion: "hinzufuegen",
        suchprofile: [
          { filter: { suchbegriff: "IT" }, name: "IT im Westen", quelle: "ki" },
          { filter: { suchbegriff: "Sanitäter" }, quelle: "hand" },
        ],
      },
    });
  });

  it("lehnt einen unbekannten Filterwert, eine unbekannte quelle und eine unbekannte Aktion ab", () => {
    expect(pruefeSuchprofileAnfrage({ aktion: "hinzufuegen", suchprofile: [{ filter: { vorname: "X" } }] }).ok).toBe(false);
    expect(pruefeSuchprofileAnfrage({ aktion: "hinzufuegen", suchprofile: [{ filter: {}, quelle: "bot" }] }).ok).toBe(false);
    expect(pruefeSuchprofileAnfrage({ aktion: "ersetzen", id: "a" }).ok).toBe(false);
    expect(pruefeSuchprofileAnfrage({}).ok).toBe(false);
  });

  it("lehnt mehr als zehn Filter in einem Aufruf mit einer verstaendlichen Meldung ab", () => {
    const suchprofile = Array.from({ length: 11 }, (_, i) => ({ filter: { suchbegriff: `W${i}` } }));
    expect(pruefeSuchprofileAnfrage({ aktion: "hinzufuegen", suchprofile })).toEqual({
      ok: false,
      fehler: "Du kannst höchstens 10 Filter speichern.",
    });
    expect(pruefeSuchprofileAnfrage({ aktion: "hinzufuegen", suchprofile: [] }).ok).toBe(false);
  });

  it("lehnt einen zu langen Namen oder Steuerzeichen im Namen ab", () => {
    const zuLang = pruefeSuchprofileAnfrage({ aktion: "aendern", id: "abc", name: "x".repeat(61) });
    expect(zuLang).toEqual({ ok: false, fehler: "Der Name darf höchstens 60 Zeichen lang sein." });
    expect(pruefeSuchprofileAnfrage({ aktion: "aendern", id: "abc", name: "a\u0007b" })).toEqual({
      ok: false,
      fehler: "Der Name enthält ein Zeichen, das wir nicht speichern können.",
    });
  });

  it("nimmt aendern mit Filter, Name oder aktiv an - aber nicht ohne jede Aenderung", () => {
    expect(pruefeSuchprofileAnfrage({ aktion: "aendern", id: "abc", aktiv: false })).toEqual({
      ok: true,
      wert: { aktion: "aendern", id: "abc", aenderung: { aktiv: false } },
    });
    expect(pruefeSuchprofileAnfrage({ aktion: "aendern", id: "abc", name: "" })).toEqual({
      ok: true,
      wert: { aktion: "aendern", id: "abc", aenderung: { name: "" } },
    });
    expect(pruefeSuchprofileAnfrage({ aktion: "aendern", id: "abc" }).ok).toBe(false);
  });

  it("nimmt loeschen an und prueft die Form der Kennung", () => {
    expect(pruefeSuchprofileAnfrage({ aktion: "loeschen", id: "a_b-C9" })).toEqual({
      ok: true,
      wert: { aktion: "loeschen", id: "a_b-C9" },
    });
    expect(pruefeSuchprofileAnfrage({ aktion: "loeschen", id: "../x" }).ok).toBe(false);
    expect(pruefeSuchprofileAnfrage({ aktion: "loeschen", id: "a".repeat(65) }).ok).toBe(false);
  });
});

describe("pruefeSuchprofilIdAbfrage", () => {
  it("nimmt eine Kennung an, lehnt Listen und Pfadzeichen ab", () => {
    expect(pruefeSuchprofilIdAbfrage("abc").ok).toBe(true);
    expect(pruefeSuchprofilIdAbfrage(["abc"]).ok).toBe(false);
    expect(pruefeSuchprofilIdAbfrage("a/b").ok).toBe(false);
    expect(pruefeSuchprofilIdAbfrage(undefined).ok).toBe(false);
  });
});

describe("pruefeMerklistenAnfrage", () => {
  it("nimmt merken und vergessen an", () => {
    expect(pruefeMerklistenAnfrage({ pinstGuid: "FA16", aktion: "merken" }).ok).toBe(true);
    expect(pruefeMerklistenAnfrage({ pinstGuid: "FA16", aktion: "vergessen" }).ok).toBe(true);
  });
  it("lehnt eine pinstGuid mit Pfadzeichen ab", () => {
    expect(pruefeMerklistenAnfrage({ pinstGuid: "../konten/x", aktion: "merken" }).ok).toBe(false);
  });
  it("lehnt eine unbekannte Aktion ab", () => {
    expect(pruefeMerklistenAnfrage({ pinstGuid: "FA16", aktion: "loeschen" }).ok).toBe(false);
  });
});

describe("pruefeLoeschAnfrage", () => {
  it("verlangt die ausdrueckliche Bestaetigung", () => {
    expect(pruefeLoeschAnfrage({ bestaetigung: "LOESCHEN" }).ok).toBe(true);
    expect(pruefeLoeschAnfrage({}).ok).toBe(false);
  });
});

describe("pruefeBenachrichtigungsAnfrage", () => {
  it("nimmt {aktiv: true} und {aktiv: false} an", () => {
    expect(pruefeBenachrichtigungsAnfrage({ aktiv: true })).toEqual({ ok: true, wert: { aktiv: true } });
    expect(pruefeBenachrichtigungsAnfrage({ aktiv: false })).toEqual({ ok: true, wert: { aktiv: false } });
  });

  it("lehnt einen Body ohne aktiv ab", () => {
    expect(pruefeBenachrichtigungsAnfrage({}).ok).toBe(false);
  });

  it("lehnt einen nicht-booleschen Wert ab", () => {
    expect(pruefeBenachrichtigungsAnfrage({ aktiv: "true" }).ok).toBe(false);
  });

  it("lehnt zusaetzliche Felder ab (strict)", () => {
    expect(pruefeBenachrichtigungsAnfrage({ aktiv: true, gemeldet: [] }).ok).toBe(false);
  });
});

describe("pruefeAbbestellParameter", () => {
  it("nimmt kurze alphanumerische Werte mit '-' und '_' an", () => {
    const r = pruefeAbbestellParameter("uid-123_ABC", "t0abcdef123456789");
    expect(r).toEqual({ ok: true, wert: { uid: "uid-123_ABC", token: "t0abcdef123456789" } });
  });

  it("lehnt fehlende Parameter ab", () => {
    expect(pruefeAbbestellParameter(undefined, "t1").ok).toBe(false);
    expect(pruefeAbbestellParameter("uid1", undefined).ok).toBe(false);
  });

  it("lehnt Pfad-/Sonderzeichen ab", () => {
    expect(pruefeAbbestellParameter("../konten/x", "t1").ok).toBe(false);
    expect(pruefeAbbestellParameter("uid1", "t1;drop").ok).toBe(false);
  });

  it("lehnt einen zu langen Wert ab", () => {
    expect(pruefeAbbestellParameter("a".repeat(129), "t1").ok).toBe(false);
  });

  it("nimmt keine Array-Werte an (Query-Parameter koennen mehrfach vorkommen)", () => {
    expect(pruefeAbbestellParameter(["uid1", "uid2"], "t1").ok).toBe(false);
  });
});

/**
 * WOZU: der RFC-8058-One-Click-POST eines
 * Mail-Anbieters muss vom Browser-Formular-POST auf der Bestaetigungsseite
 * unterschieden werden - beide teilen sich denselben Content-Type. Ein
 * Fehler hier liefert entweder dem Mail-Client eine HTML-Seite statt 200/leer,
 * oder dem Browser-Nutzer nach dem Klick auf den Knopf gar keine Rueckmeldung.
 */
describe("istOneClickAnfrage", () => {
  it("erkennt den RFC-8058-Body", () => {
    expect(
      istOneClickAnfrage("application/x-www-form-urlencoded", { "List-Unsubscribe": "One-Click" }),
    ).toBe(true);
  });

  it("erkennt den Content-Type unabhaengig von Gross-/Kleinschreibung und einem charset-Zusatz", () => {
    expect(
      istOneClickAnfrage("Application/X-WWW-Form-Urlencoded; charset=UTF-8", {
        "List-Unsubscribe": "One-Click",
      }),
    ).toBe(true);
  });

  it("lehnt einen leeren Body ab (Browser-Formular ohne Felder)", () => {
    expect(istOneClickAnfrage("application/x-www-form-urlencoded", {})).toBe(false);
  });

  it("lehnt einen fehlenden Content-Type ab", () => {
    expect(istOneClickAnfrage(undefined, { "List-Unsubscribe": "One-Click" })).toBe(false);
  });

  it("lehnt einen anderen Content-Type ab (z.B. JSON)", () => {
    expect(istOneClickAnfrage("application/json", { "List-Unsubscribe": "One-Click" })).toBe(false);
  });

  it("lehnt einen abweichenden Feldwert ab", () => {
    expect(istOneClickAnfrage("application/x-www-form-urlencoded", { "List-Unsubscribe": "Anders" })).toBe(false);
  });

  it("lehnt zusaetzliche Felder ab", () => {
    expect(
      istOneClickAnfrage("application/x-www-form-urlencoded", {
        "List-Unsubscribe": "One-Click",
        extra: "1",
      }),
    ).toBe(false);
  });

  it("lehnt einen Nicht-Objekt-Body ab", () => {
    expect(istOneClickAnfrage("application/x-www-form-urlencoded", "List-Unsubscribe=One-Click")).toBe(false);
    expect(istOneClickAnfrage("application/x-www-form-urlencoded", null)).toBe(false);
  });
});
