import { describe, expect, it, vi, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

const getFirestoreMock = vi.fn();
vi.mock("firebase-admin/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase-admin/firestore")>();
  return { ...actual, getFirestore: (...a: unknown[]) => getFirestoreMock(...a) };
});

const getStorageMock = vi.fn();
vi.mock("firebase-admin/storage", () => ({
  getStorage: (...a: unknown[]) => getStorageMock(...a),
}));

const getAuthMock = vi.fn();
vi.mock("firebase-admin/auth", () => ({
  getAuth: (...a: unknown[]) => getAuthMock(...a),
}));

const {
  normalisiere,
  normalisiereAngaben,
  normalisiereDokumente,
  sicht,
  ladeAngaben,
  speichereAngaben,
  widerrufeStaatsangehoerigkeit,
  loescheAngaben,
  ladeUnterlagen,
  registriereUnterlage,
  entferneUnterlage,
  loescheKonto,
  merkeAusstehendeUnterlage,
  ladeAusstehendeUnterlage,
  ladeAlleAusstehenden,
  vergissAusstehendeUnterlage,
  ladeReinLesend,
  aendereSuchprofile,
  ladeSuchprofilFilter,
  setzeBenachrichtigung,
  aendereMerkliste,
  schreibeNachVersand,
  entferneGeschlosseneVonMerkliste,
} = await import("./kontoStore");
const { MERKLISTE_MAX } = await import("./kontoTypen");

/**
 * WOZU: `normalisiere` ist der einzige Ort, der ein aus Firestore gelesenes,
 * moeglicherweise unvollstaendiges Dokument in ein vollstaendiges KontoRecord
 * verwandelt. Ein Dokument hat womoeglich keinen
 * `benachrichtigung`-Schluessel - der muss dann UNGESETZT bleiben (nicht auf
 * ein Leer-/false-Objekt normalisiert werden), sonst schreibt die naechste
 * Transaktion `undefined` nach Firestore (das Admin SDK lehnt das ab).
 */
describe("normalisiere", () => {
  it("laesst ein Dokument ohne benachrichtigung-Feld ungesetzt", () => {
    const record = normalisiere(
      { schemaVersion: "konto-v1", erstelltAm: Timestamp.fromMillis(0), suchprofil: null, merkliste: [] },
      1000,
    );
    expect(record.benachrichtigung).toBeUndefined();
  });

  // Aus dem Einzelfeld `suchprofil` wird ein Eintrag der Filterliste - das
  // Lesen wandelt um.
  it("macht aus einem Einzelfeld suchprofil genau einen aktiven Filter mit quelle 'hand' und fester Kennung", () => {
    const erstelltAm = Timestamp.fromMillis(500);
    const record = normalisiere({ erstelltAm, suchprofil: { bundesland: ["Bayern"] }, merkliste: [] } as never, 1000);
    expect(record.suchprofile).toEqual([
      { id: "bisher", filter: { bundesland: ["Bayern"] }, aktiv: true, quelle: "hand", erstelltAm },
    ]);
    // Bei jedem Lesen dieselbe Kennung - sonst liefen aendern/loeschen ins Leere.
    expect(normalisiere({ erstelltAm, suchprofil: { bundesland: ["Bayern"] } } as never, 2000).suchprofile[0].id).toBe("bisher");
  });

  it("macht aus suchprofil: null und aus einem frischen Konto eine leere Filterliste", () => {
    expect(normalisiere({ suchprofil: null } as never, 1000).suchprofile).toEqual([]);
    expect(normalisiere(undefined, 1000).suchprofile).toEqual([]);
  });

  it("bevorzugt suchprofile vor einem zusaetzlichen Einzelfeld suchprofil", () => {
    const record = normalisiere({ suchprofile: [], suchprofil: { bundesland: ["Bayern"] } } as never, 1000);
    expect(record.suchprofile).toEqual([]);
  });

  it("verwirft kaputte Filtereintraege und setzt Vorgaben statt blind zu casten", () => {
    const erstelltAm = Timestamp.fromMillis(500);
    const record = normalisiere(
      {
        erstelltAm,
        suchprofile: [
          { id: "a", filter: { suchbegriff: "IT" }, aktiv: false, quelle: "ki", erstelltAm: Timestamp.fromMillis(700), name: "IT" },
          { id: "b", filter: { wunschort: "Ulm" } },
          { id: "", filter: {} },
          { id: "c" },
          { id: "a", filter: { suchbegriff: "doppelt" } },
          "kaputt",
        ],
      } as never,
      1000,
    );
    expect(record.suchprofile).toEqual([
      { id: "a", name: "IT", filter: { suchbegriff: "IT" }, aktiv: false, quelle: "ki", erstelltAm: Timestamp.fromMillis(700) },
      { id: "b", filter: { wunschort: "Ulm" }, aktiv: true, quelle: "hand", erstelltAm },
    ]);
  });

  it("laesst ein frisches Konto (kein Dokument) ohne benachrichtigung-Feld", () => {
    const record = normalisiere(undefined, 1000);
    expect(record.benachrichtigung).toBeUndefined();
    expect(record.erstelltAm.toMillis()).toBe(1000);
  });

  it("behaelt ein vorhandenes benachrichtigung-Feld unveraendert", () => {
    const benachrichtigung = {
      aktiv: true,
      abmeldeToken: "t1",
      seit: Timestamp.fromMillis(500),
      letzteAm: null,
      gemeldet: [],
    };
    const record = normalisiere({ benachrichtigung }, 1000);
    expect(record.benachrichtigung).toEqual(benachrichtigung);
  });
});

/**
 * WOZU: `sicht` ist die einzige Stelle, die aus "nie eingeschaltet"
 * (kein benachrichtigung-Feld) ein `aktiv: false` fuer den Browser macht -
 * und `emailBestaetigt` kommt hier als PARAMETER (aus dem ID-Token), nie aus
 * dem gespeicherten Record.
 */
describe("sicht", () => {
  it("zeigt benachrichtigung.aktiv:false, wenn nie eingeschaltet", () => {
    const record = normalisiere(undefined, 1000);
    expect(sicht(record, false).benachrichtigung).toEqual({ aktiv: false, emailBestaetigt: false });
  });

  it("uebernimmt emailBestaetigt vom Parameter, nicht vom Record", () => {
    const record = normalisiere(undefined, 1000);
    expect(sicht(record, true).benachrichtigung).toEqual({ aktiv: false, emailBestaetigt: true });
  });

  it("zeigt benachrichtigung.aktiv:true, wenn eingeschaltet", () => {
    const record = normalisiere(
      {
        benachrichtigung: {
          aktiv: true,
          abmeldeToken: "t1",
          seit: Timestamp.fromMillis(500),
          letzteAm: null,
          gemeldet: [],
        },
      },
      1000,
    );
    expect(sicht(record, true).benachrichtigung).toEqual({ aktiv: true, emailBestaetigt: true });
  });

  it("gibt niemals Token oder gemeldete Stellen an die Sicht weiter", () => {
    const record = normalisiere(
      {
        benachrichtigung: {
          aktiv: true,
          abmeldeToken: "geheim",
          seit: Timestamp.fromMillis(500),
          letzteAm: null,
          gemeldet: ["FA16"],
        },
      },
      1000,
    );
    const ausgabe = sicht(record, true) as unknown as Record<string, unknown>;
    expect(JSON.stringify(ausgabe)).not.toContain("geheim");
    expect(JSON.stringify(ausgabe)).not.toContain("FA16");
  });
});

/**
 * Minimaler In-Memory-Firestore fuer die Store-Funktionen unter `privat/`: Pfade sind
 * Strings ("konten/{uid}/privat/angaben"), `runTransaction` wendet
 * Schreibvorgaenge SOFORT an (reicht fuer sequentielle Tests, keine echte
 * Nebenlaeufigkeit noetig - anders als mappeStore.test.ts, das echte
 * Wettlaeufe zeigen muss).
 */
// `FieldValue.delete()` ist intern eine DeleteTransform-Instanz - kein
// oeffentlich dokumentiertes Merkmal, aber fuer diesen Test-Fake reicht der
// Konstruktorname, da hier ausschliesslich der echte FieldValue-Import aus
// firebase-admin/firestore verwendet wird (kontoStore.vergissAusstehendeUnterlage).
function istFieldValueDelete(wert) {
  return Boolean(wert) && typeof wert === "object" && wert.constructor?.name === "DeleteTransform";
}

// `.update({"a.b": wert})` ist ein DOT-PFAD, kein Literalschluessel "a.b" -
// noetig fuer `vergissAusstehendeUnterlage` (`ausstehend.<docId>`).
function wendeDotPatchAn(basis, patch) {
  // Tiefe Kopie nur von reinen Objekten/Arrays - `Timestamp` bleibt erhalten
  // (ein JSON-Klon machte daraus `{ _seconds }`, was echtes Firestore nicht tut).
  const klon = (wert) => {
    if (Array.isArray(wert)) return wert.map(klon);
    if (wert && typeof wert === "object" && Object.getPrototypeOf(wert) === Object.prototype) {
      return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, klon(v)]));
    }
    return wert;
  };
  const ergebnis = klon(basis ?? {});
  for (const [pfad, wert] of Object.entries(patch)) {
    const teile = pfad.split(".");
    let knoten = ergebnis;
    for (let i = 0; i < teile.length - 1; i++) {
      const naechster = knoten[teile[i]];
      knoten[teile[i]] = naechster && typeof naechster === "object" ? naechster : {};
      knoten = knoten[teile[i]];
    }
    const letzterSchluessel = teile[teile.length - 1];
    if (istFieldValueDelete(wert)) delete knoten[letzterSchluessel];
    else knoten[letzterSchluessel] = wert;
  }
  return ergebnis;
}

function fakeFirestoreKonto() {
  const data = new Map();

  function machRef(pfad) {
    return {
      __pfad: pfad,
      get: async () => ({ exists: data.has(pfad), data: () => data.get(pfad) }),
      set: async (wert, opts) => {
        if (opts && opts.merge) {
          data.set(pfad, { ...(data.get(pfad) || {}), ...wert });
        } else {
          data.set(pfad, wert);
        }
      },
      update: async (patch) => {
        data.set(pfad, wendeDotPatchAn(data.get(pfad), patch));
      },
      delete: async () => {
        data.delete(pfad);
      },
      collection: (name) => ({ doc: (id) => machRef(`${pfad}/${name}/${id}`) }),
    };
  }

  return {
    _daten: data,
    collection: (name) => ({ doc: (id) => machRef(`${name}/${id}`) }),
    runTransaction: async (fn) => {
      const tx = {
        get: async (ref) => ref.get(),
        set: (ref, wert, opts) => {
          void ref.set(wert, opts);
        },
        update: (ref, patch) => {
          void ref.update(patch);
        },
      };
      return fn(tx);
    },
    recursiveDelete: async (ref) => {
      const praefix = ref.__pfad;
      for (const key of [...data.keys()]) {
        if (key === praefix || key.startsWith(`${praefix}/`)) data.delete(key);
      }
    },
  };
}

function fakeStorageKonto() {
  const dateien = new Map();
  return {
    dateien,
    bucket: () => ({
      file: (pfad) => ({
        delete: async () => {
          dateien.delete(pfad);
        },
      }),
      deleteFiles: async ({ prefix }) => {
        for (const key of [...dateien.keys()]) if (key.startsWith(prefix)) dateien.delete(key);
      },
    }),
  };
}

beforeEach(() => {
  getFirestoreMock.mockReset();
  getStorageMock.mockReset();
  getAuthMock.mockReset();
});

/**
 * WOZU: die `privat`-Dokumente werden nie blind gecastet - ein Dokument ohne
 * `eintraege`/`ausstehend`/Einwilligungsvermerk oder mit fremden Schluesseln
 * darf nicht ungeprueft bis in Sicht und Export kommen.
 */
describe("normalisiereAngaben", () => {
  it("setzt fehlende Felder auf sichere Vorgaben", () => {
    const record = normalisiereAngaben({});
    expect(record.angaben).toEqual({});
    expect(record.einwilligungStaatsangehoerigkeit).toBeNull();
    expect(record.schemaVersion).toBe("konto-angaben-v1");
    expect(record.geaendertAm.toMillis()).toBe(0);
  });

  it("liefert einwilligungStaatsangehoerigkeit:null, wenn der Vermerk fehlt oder kaputt ist", () => {
    expect(normalisiereAngaben({ angaben: { staatsangehoerigkeit: "deutsch" } }).einwilligungStaatsangehoerigkeit).toBeNull();
    expect(
      normalisiereAngaben({ einwilligungStaatsangehoerigkeit: { erteiltAm: "gestern", textVersion: "staatsangehoerigkeit-v1" } })
        .einwilligungStaatsangehoerigkeit,
    ).toBeNull();
  });

  it("uebernimmt einen gueltigen Vermerk", () => {
    const erteiltAm = Timestamp.fromMillis(500);
    const record = normalisiereAngaben({ einwilligungStaatsangehoerigkeit: { erteiltAm, textVersion: "staatsangehoerigkeit-v1", extra: 1 } });
    expect(record.einwilligungStaatsangehoerigkeit).toEqual({ erteiltAm, textVersion: "staatsangehoerigkeit-v1" });
  });

  it("filtert angaben auf die bekannten Schluessel mit Textwerten und wirft fremde Felder weg", () => {
    const record = normalisiereAngaben({
      schemaVersion: "konto-angaben-v1",
      angaben: { nachname: "Mustermann", sprachkenntnisse: "x", iban: "DE00", plz: 12345, ort: "" },
      muell: true,
      geaendertAm: Timestamp.fromMillis(9),
    });
    expect(record.angaben).toEqual({ nachname: "Mustermann" });
    expect(Object.keys(record).sort()).toEqual(["angaben", "einwilligungStaatsangehoerigkeit", "geaendertAm", "schemaVersion"]);
    expect(record.geaendertAm.toMillis()).toBe(9);
  });

  it("vertraegt undefined/null/Nicht-Objekte", () => {
    expect(normalisiereAngaben(undefined).angaben).toEqual({});
    expect(normalisiereAngaben(null).angaben).toEqual({});
    expect(normalisiereAngaben({ angaben: ["a"] }).angaben).toEqual({});
  });
});

describe("normalisiereDokumente", () => {
  it("liefert leere eintraege/ausstehend, wenn beide fehlen", () => {
    expect(normalisiereDokumente({})).toEqual({ schemaVersion: "konto-angaben-v1", eintraege: [], ausstehend: {} });
    expect(normalisiereDokumente(undefined)).toEqual({ schemaVersion: "konto-angaben-v1", eintraege: [], ausstehend: {} });
  });

  it("liefert leeres ausstehend, wenn nur eintraege vorhanden sind (und umgekehrt)", () => {
    const hochgeladenAm = Timestamp.fromMillis(1);
    const nurEintraege = normalisiereDokumente({
      eintraege: [{ docId: "d1", art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf", sizeBytes: 5, hochgeladenAm }],
    });
    expect(nurEintraege.ausstehend).toEqual({});
    expect(nurEintraege.eintraege).toHaveLength(1);
    const nurAusstehend = normalisiereDokumente({
      ausstehend: { d2: { art: "lebenslauf", dateiname: "l.pdf", contentType: "application/pdf", erstelltAm: 7 } },
    });
    expect(nurAusstehend.eintraege).toEqual([]);
    expect(nurAusstehend.ausstehend.d2.erstelltAm).toBe(7);
  });

  it("wirft fremde Felder weg - im Dokument, in eintraege und in ausstehend", () => {
    const hochgeladenAm = Timestamp.fromMillis(1);
    const record = normalisiereDokumente({
      muell: 1,
      eintraege: [{ docId: "d1", art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf", sizeBytes: 5, hochgeladenAm, extra: "x" }],
      ausstehend: { d2: { art: "lebenslauf", dateiname: "l.pdf", contentType: "application/pdf", erstelltAm: 7, extra: "y" } },
    });
    expect(Object.keys(record).sort()).toEqual(["ausstehend", "eintraege", "schemaVersion"]);
    expect(record.eintraege[0]).not.toHaveProperty("extra");
    expect(record.ausstehend.d2).not.toHaveProperty("extra");
  });

  it("verwirft Eintraege ohne docId, ergaenzt sonst fehlende Felder mit Vorgaben", () => {
    const record = normalisiereDokumente({ eintraege: [{ art: "zeugnis" }, "kaputt", { docId: "d1" }] });
    expect(record.eintraege).toHaveLength(1);
    expect(record.eintraege[0]).toMatchObject({ docId: "d1", art: "sonstiges", dateiname: "unterlage", sizeBytes: 0 });
    expect(record.eintraege[0].hochgeladenAm.toMillis()).toBe(0);
  });

  it("verwirft ausstehend-Eintraege ohne gueltige Art; ohne numerisches erstelltAm wird es 0 (= abgelaufen)", () => {
    const record = normalisiereDokumente({
      ausstehend: { d1: { art: "unbekannt", erstelltAm: 5 }, d2: { art: "zeugnis", dateiname: "z.pdf", erstelltAm: "gestern" } },
    });
    expect(Object.keys(record.ausstehend)).toEqual(["d2"]);
    expect(record.ausstehend.d2.erstelltAm).toBe(0);
  });
});

/**
 * WOZU: Wir nehmen keine Ausweiskopien entgegen. Ein `ausstehend`-Eintrag mit
 * der Art Ausweiskopie wird nie registriert; ein Einwilligungsvermerk an einem
 * Eintrag hat keinen Gegenstand und wird nicht weitergetragen.
 */
describe("normalisiereDokumente - keine Ausweiskopie", () => {
  it("verwirft einen ausstehend-Eintrag mit der Art Ausweiskopie", () => {
    const record = normalisiereDokumente({
      ausstehend: { d2: { art: "ausweiskopie", dateiname: "p.jpg", contentType: "image/jpeg", erstelltAm: 7 } },
    });
    expect(record.ausstehend).toEqual({});
  });

  it("traegt keine Einwilligungsfelder an Eintrag oder ausstehend-Eintrag weiter", () => {
    const record = normalisiereDokumente({
      eintraege: [
        {
          docId: "d1",
          art: "zeugnis",
          dateiname: "z.pdf",
          contentType: "application/pdf",
          sizeBytes: 5,
          hochgeladenAm: Timestamp.fromMillis(1),
          einwilligung: { erteiltAm: Timestamp.fromMillis(1), textVersion: "ausweiskopie-konto-v1" },
        },
      ],
      ausstehend: {
        d2: { art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf", erstelltAm: 7, ausweisEinwilligungTextVersion: "x" },
      },
    });
    expect(record.eintraege[0]).not.toHaveProperty("einwilligung");
    expect(record.ausstehend.d2).not.toHaveProperty("ausweisEinwilligungTextVersion");
  });
});

describe("schemaVersion beim Schreiben", () => {
  it("schreibt konto-angaben-v1 in privat/angaben", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    await speichereAngaben("u1", { nachname: "Mustermann" }, 1000);
    expect(db._daten.get("konten/u1/privat/angaben").schemaVersion).toBe("konto-angaben-v1");
  });

  it("schreibt konto-angaben-v1 beim Widerruf", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1/privat/angaben", { angaben: { staatsangehoerigkeit: "deutsch" }, einwilligungStaatsangehoerigkeit: null });
    await widerrufeStaatsangehoerigkeit("u1");
    const daten = db._daten.get("konten/u1/privat/angaben");
    expect(daten.schemaVersion).toBe("konto-angaben-v1");
    expect(daten.angaben).toEqual({});
  });

  it("schreibt konto-angaben-v1 in privat/dokumente (ausstehend und Registrierung)", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    await merkeAusstehendeUnterlage("u1", "d1", { art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf" }, 1000);
    expect(db._daten.get("konten/u1/privat/dokumente").schemaVersion).toBe("konto-angaben-v1");
    db._daten.delete("konten/u1/privat/dokumente");
    await registriereUnterlage("u1", {
      docId: "d1",
      art: "zeugnis",
      dateiname: "z.pdf",
      contentType: "application/pdf",
      sizeBytes: 5,
      hochgeladenAm: Timestamp.fromMillis(1),
    });
    expect(db._daten.get("konten/u1/privat/dokumente").schemaVersion).toBe("konto-angaben-v1");
  });
});

/**
 * WOZU: `speichereAngaben` prueft UND schreibt in derselben Transaktion -
 * das ist der ganze Witz gegenueber getrennten Lese-/Schreibschritten (s.
 * Kommentar an der Funktion selbst).
 */
describe("ladeAngaben / speichereAngaben", () => {
  it("liefert null, wenn noch nichts gespeichert ist", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreKonto());
    expect(await ladeAngaben("u1")).toBeNull();
  });

  it("speichert gueltige Angaben und liest sie wieder", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await speichereAngaben("u1", { nachname: "Mustermann" }, 1000);

    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) expect(ergebnis.wert.angaben).toEqual({ nachname: "Mustermann" });
    const geladen = await ladeAngaben("u1");
    expect(geladen && geladen.angaben).toEqual({ nachname: "Mustermann" });
  });

  it("lehnt eine ungueltige Anfrage ab, ohne etwas zu schreiben", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await speichereAngaben("u1", { plz: "1234" }, 1000);

    expect(ergebnis.ok).toBe(false);
    expect(await ladeAngaben("u1")).toBeNull();
  });

  it("lehnt Staatsangehoerigkeit ohne Einwilligung ab - der bestehende Stand kommt aus DERSELBEN Transaktion", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await speichereAngaben("u1", { staatsangehoerigkeit: "deutsch" }, 1000);

    expect(ergebnis.ok).toBe(false);
  });

  it("behaelt bestehende Felder, die nicht mitgeschickt werden", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    await speichereAngaben("u1", { nachname: "Alt", vorname: "Bleibt" }, 1000);
    const zweite = await speichereAngaben("u1", { nachname: "Neu" }, 2000);

    expect(zweite.ok).toBe(true);
    if (zweite.ok) expect(zweite.wert.angaben).toEqual({ nachname: "Neu", vorname: "Bleibt" });
  });

  /**
   * WOZU: `privat/angaben` ist eine Subcollection von
   * `konten/{uid}` - ohne das Elterndokument sieht der Waisen-Sweep in
   * raeumeKontenAuf.ts (der ueber die TOP-LEVEL-Dokumente der `konten`-
   * Collection iteriert) dieses Konto nie, selbst wenn dazu ein Auth-Nutzer
   * existiert.
   */
  it("legt das Elterndokument konten/{uid} an, wenn es noch nicht existiert", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    await speichereAngaben("u1", { nachname: "Mustermann" }, 1000);

    expect(db._daten.has("konten/u1")).toBe(true);
  });

  it("laesst ein bestehendes Elterndokument unangetastet", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", { schemaVersion: "konto-v1", suchprofil: { irgendwas: true }, merkliste: [] });

    await speichereAngaben("u1", { nachname: "Mustermann" }, 1000);

    expect(db._daten.get("konten/u1")).toEqual({
      schemaVersion: "konto-v1",
      suchprofil: { irgendwas: true },
      merkliste: [],
    });
  });

  it("legt KEIN Elterndokument an, wenn die Anfrage ungueltig ist", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await speichereAngaben("u1", { plz: "1234" }, 1000);

    expect(ergebnis.ok).toBe(false);
    expect(db._daten.has("konten/u1")).toBe(false);
  });
});

describe("widerrufeStaatsangehoerigkeit (Store)", () => {
  it("entfernt Feld und Vermerk", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    await speichereAngaben(
      "u1",
      { staatsangehoerigkeit: "deutsch", einwilligung: { textVersion: "staatsangehoerigkeit-v1" } },
      1000,
    );

    await widerrufeStaatsangehoerigkeit("u1");

    const geladen = await ladeAngaben("u1");
    expect(geladen && geladen.angaben.staatsangehoerigkeit).toBeUndefined();
    expect(geladen && geladen.einwilligungStaatsangehoerigkeit).toBeNull();
  });

  it("ist idempotent - ein zweiter Widerruf ohne gespeicherte Angaben wirft nicht", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreKonto());
    await expect(widerrufeStaatsangehoerigkeit("u1")).resolves.toBeUndefined();
  });
});

describe("loescheAngaben", () => {
  it("loescht den gesamten Angaben-Datensatz", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    await speichereAngaben("u1", { nachname: "Mustermann" }, 1000);

    await loescheAngaben("u1");

    expect(await ladeAngaben("u1")).toBeNull();
  });
});

describe("ladeUnterlagen / registriereUnterlage", () => {
  function eintrag(teil) {
    return {
      docId: "d1",
      art: "lebenslauf",
      dateiname: "lebenslauf.pdf",
      contentType: "application/pdf",
      sizeBytes: 1000,
      hochgeladenAm: Timestamp.fromMillis(1000),
      ...teil,
    };
  }

  it("liefert eine leere Liste, wenn noch nichts registriert ist", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreKonto());
    expect(await ladeUnterlagen("u1")).toEqual([]);
  });

  it("registriert eine neue Unterlage", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    await registriereUnterlage("u1", eintrag());

    expect(await ladeUnterlagen("u1")).toEqual([eintrag()]);
  });

  it("ersetzt einen vorhandenen Eintrag mit derselben docId, statt ihn zu verdoppeln", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    await registriereUnterlage("u1", eintrag({ sizeBytes: 100 }));
    await registriereUnterlage("u1", eintrag({ sizeBytes: 999 }));

    const geladen = await ladeUnterlagen("u1");
    expect(geladen).toHaveLength(1);
    expect(geladen[0].sizeBytes).toBe(999);
  });
});

describe("merkeAusstehendeUnterlage / ladeAusstehendeUnterlage / vergissAusstehendeUnterlage", () => {
  it("liefert null, wenn nichts ausstehend ist", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreKonto());
    expect(await ladeAusstehendeUnterlage("u1", "d1")).toBeNull();
  });

  it("merkt eine ausstehende Unterlage und liest sie wieder", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    await merkeAusstehendeUnterlage("u1", "d1", { art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf" }, 1000);

    expect(await ladeAusstehendeUnterlage("u1", "d1")).toEqual({
      art: "zeugnis",
      dateiname: "z.pdf",
      contentType: "application/pdf",
      erstelltAm: 1000,
    });
  });

  it("legt das Elterndokument konten/{uid} an, wenn es fehlt", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    await merkeAusstehendeUnterlage("u1", "d1", { art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf" }, 1000);

    expect(db._daten.has("konten/u1")).toBe(true);
  });

  it("behaelt einen zweiten ausstehenden Eintrag, ohne den ersten zu ueberschreiben", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    await merkeAusstehendeUnterlage("u1", "d1", { art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf" }, 1000);
    await merkeAusstehendeUnterlage("u1", "d2", { art: "lebenslauf", dateiname: "l.pdf", contentType: "application/pdf" }, 1000);

    expect(await ladeAusstehendeUnterlage("u1", "d1")).not.toBeNull();
    expect(await ladeAusstehendeUnterlage("u1", "d2")).not.toBeNull();
  });

  it("entfernt genau den einen ausstehenden Eintrag", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    await merkeAusstehendeUnterlage("u1", "d1", { art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf" }, 1000);
    await merkeAusstehendeUnterlage("u1", "d2", { art: "lebenslauf", dateiname: "l.pdf", contentType: "application/pdf" }, 1000);

    await vergissAusstehendeUnterlage("u1", "d1");

    expect(await ladeAusstehendeUnterlage("u1", "d1")).toBeNull();
    expect(await ladeAusstehendeUnterlage("u1", "d2")).not.toBeNull();
  });

  it("stempelt erstelltAm mit dem uebergebenen jetzt-Zeitpunkt", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    await merkeAusstehendeUnterlage("u1", "d1", { art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf" }, 4242);

    const eintrag = await ladeAusstehendeUnterlage("u1", "d1");
    expect(eintrag?.erstelltAm).toBe(4242);
  });
});

/**
 * WOZU: das eigene Aufraeumen vor einer neuen
 * Upload-URL-Anfrage muss AELTERE ausstehend-Eintraege finden koennen, auch
 * wenn (schon oder noch) kein Storage-Objekt mehr dazu existiert - das rein
 * storage-basierte Auflisten (`getFiles`) sieht so einen Eintrag nie.
 */
describe("ladeAlleAusstehenden", () => {
  it("liefert ein leeres Objekt, wenn nichts ausstehend ist", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreKonto());
    expect(await ladeAlleAusstehenden("u1")).toEqual({});
  });

  it("liefert ALLE ausstehenden Eintraege eines Kontos", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    await merkeAusstehendeUnterlage("u1", "d1", { art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf" }, 1000);
    await merkeAusstehendeUnterlage("u1", "d2", { art: "lebenslauf", dateiname: "l.pdf", contentType: "application/pdf" }, 2000);

    const alle = await ladeAlleAusstehenden("u1");

    expect(Object.keys(alle).sort()).toEqual(["d1", "d2"]);
    expect(alle.d1.erstelltAm).toBe(1000);
    expect(alle.d2.erstelltAm).toBe(2000);
  });
});

describe("entferneUnterlage", () => {
  it("entfernt Verzeichniseintrag UND Storage-Datei", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageKonto();
    storage.dateien.set("konten/u1/dokumente/d1", { size: 1000 });
    getStorageMock.mockReturnValue(storage);
    await registriereUnterlage("u1", {
      docId: "d1",
      art: "lebenslauf",
      dateiname: "lebenslauf.pdf",
      contentType: "application/pdf",
      sizeBytes: 1000,
      hochgeladenAm: Timestamp.fromMillis(1000),
    });

    await entferneUnterlage("u1", "d1");

    expect(await ladeUnterlagen("u1")).toEqual([]);
    expect(storage.dateien.has("konten/u1/dokumente/d1")).toBe(false);
  });

  it("passiert nichts, wenn der Eintrag nicht (mehr) existiert - kein Firestore- oder Storage-Zugriff ausser dem Lesen", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageKonto();
    getStorageMock.mockImplementation(() => {
      throw new Error("Storage darf hier nicht angefasst werden");
    });

    await expect(entferneUnterlage("u1", "nie-registriert")).resolves.toBeUndefined();
  });
});

/**
 * WOZU (Loeschgarantie): `loescheKonto` raeumt zusaetzlich den
 * Storage-Praefix `konten/{uid}/` ab - `recursiveDelete` deckt nur die
 * Firestore-Subcollections ab.
 */
describe("loescheKonto - Loeschgarantie fuer Storage", () => {
  it("loescht Storage-Dateien unter konten/{uid}/, auch Unterlagen-Dateien", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageKonto();
    storage.dateien.set("konten/u1/dokumente/d1", { size: 1000 });
    storage.dateien.set("konten/u1/dokumente/d2", { size: 2000 });
    storage.dateien.set("konten/u2/dokumente/d3", { size: 3000 });
    getStorageMock.mockReturnValue(storage);
    getAuthMock.mockReturnValue({ deleteUser: async () => {} });

    await loescheKonto("u1");

    expect(storage.dateien.has("konten/u1/dokumente/d1")).toBe(false);
    expect(storage.dateien.has("konten/u1/dokumente/d2")).toBe(false);
    // Ein anderes Konto ist NICHT betroffen - reine Praefix-Loeschung.
    expect(storage.dateien.has("konten/u2/dokumente/d3")).toBe(true);
  });

  it("toleriert ein Konto ohne je hochgeladene Unterlage (kein Fehler bei leerem Praefix)", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreKonto());
    getStorageMock.mockReturnValue(fakeStorageKonto());
    getAuthMock.mockReturnValue({ deleteUser: async () => {} });

    await expect(loescheKonto("u-ohne-dateien")).resolves.toBeUndefined();
  });
});

/**
 * WOZU: `kontoExport` ist ein reiner Lesevorgang
 * (Art. 15 DSGVO) - der darf kein Konto anlegen, das vorher nicht da war.
 * `ladeOderLegeAn` (fuer `kontoLaden`) tut genau das; `ladeReinLesend`
 * ist das Gegenstueck ohne diesen Nebeneffekt.
 */
describe("ladeReinLesend", () => {
  it("liefert die Vorgabewerte, OHNE ein Dokument anzulegen", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await ladeReinLesend("u1", 1000, true);

    expect(ergebnis.suchprofile).toEqual([]);
    expect(ergebnis.merkliste).toEqual([]);
    expect(db._daten.has("konten/u1")).toBe(false);
  });

  it("liest ein bestehendes Konto unveraendert", async () => {
    const db = fakeFirestoreKonto();
    db._daten.set("konten/u1", {
      schemaVersion: "konto-v1",
      erstelltAm: Timestamp.fromMillis(0),
      suchprofil: { suchbegriff: "IT" },
      merkliste: [],
    });
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await ladeReinLesend("u1", 1000, true);

    expect(ergebnis.suchprofile).toEqual([
      { id: "bisher", filter: { suchbegriff: "IT" }, aktiv: true, quelle: "hand", erstelltAm: "1970-01-01T00:00:00.000Z" },
    ]);
    // Weiterhin nicht geschrieben - nur gelesen.
    expect(db._daten.has("konten/u1")).toBe(true);
  });
});

/**
 * WOZU: Obergrenze und Dublettenpruefung muessen gegen den Stand laufen, der
 * in DERSELBEN Transaktion gelesen wird - und die erste Schreibaktion an den
 * Filtern ersetzt ein Einzelfeld `suchprofil`, statt es neben der Liste
 * liegen zu lassen.
 */
describe("aendereSuchprofile", () => {
  const kontoMit = (db, daten) =>
    db._daten.set("konten/u1", { schemaVersion: "konto-v1", erstelltAm: Timestamp.fromMillis(0), merkliste: [], ...daten });

  it("legt fuer ein neues Konto das vollstaendige Dokument mit dem Filter an", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await aendereSuchprofile(
      "u1",
      { aktion: "hinzufuegen", suchprofile: [{ filter: { wunschort: "Köln" }, quelle: "ki", name: "Köln" }] },
      1000,
    );

    expect(ergebnis).toMatchObject({ ergebnis: "hinzugefuegt", uebersprungen: 0 });
    const gespeichert = db._daten.get("konten/u1");
    expect(gespeichert.merkliste).toEqual([]);
    expect(gespeichert.suchprofile).toHaveLength(1);
    expect(gespeichert.suchprofile[0]).toMatchObject({ name: "Köln", filter: { wunschort: "Köln" }, aktiv: true, quelle: "ki" });
    expect(ergebnis.ergebnis === "hinzugefuegt" && ergebnis.hinzugefuegt).toEqual([gespeichert.suchprofile[0].id]);
  });

  it("uebernimmt beim ersten Schreiben das Einzelfeld suchprofil als Filter und entfernt es", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    kontoMit(db, { suchprofil: { bundesland: ["Bayern"] }, merkliste: [{ pinstGuid: "FA16", gemerktAm: Timestamp.fromMillis(1) }] });

    await aendereSuchprofile("u1", { aktion: "hinzufuegen", suchprofile: [{ filter: { suchbegriff: "IT" }, quelle: "hand" }] }, 1000);

    const gespeichert = db._daten.get("konten/u1");
    expect("suchprofil" in gespeichert).toBe(false);
    expect(gespeichert.suchprofile.map((e) => e.filter)).toEqual([{ bundesland: ["Bayern"] }, { suchbegriff: "IT" }]);
    expect(gespeichert.suchprofile[0].id).toBe("bisher");
    // Die Merkliste bleibt unangetastet.
    expect(gespeichert.merkliste).toHaveLength(1);
  });

  it("ueberspringt eine Dublette, ohne zu schreiben", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    kontoMit(db, { suchprofil: { bundesland: ["Bayern"] } });

    const ergebnis = await aendereSuchprofile(
      "u1",
      { aktion: "hinzufuegen", suchprofile: [{ filter: { bundesland: ["Bayern"] }, quelle: "ki" }] },
      1000,
    );

    expect(ergebnis).toMatchObject({ ergebnis: "hinzugefuegt", hinzugefuegt: [], uebersprungen: 1 });
    // Nichts geschrieben: das Einzelfeld liegt unveraendert da.
    expect(db._daten.get("konten/u1").suchprofil).toEqual({ bundesland: ["Bayern"] });
  });

  it("lehnt den elften Filter ab und schreibt nichts", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    const zehn = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      filter: { suchbegriff: `W${i}` },
      aktiv: true,
      quelle: "hand",
      erstelltAm: Timestamp.fromMillis(0),
    }));
    kontoMit(db, { suchprofile: zehn });

    const ergebnis = await aendereSuchprofile(
      "u1",
      { aktion: "hinzufuegen", suchprofile: [{ filter: { suchbegriff: "elf" }, quelle: "hand" }] },
      1000,
    );

    expect(ergebnis).toEqual({ ergebnis: "zu-viele", frei: 0 });
    expect(db._daten.get("konten/u1").suchprofile).toHaveLength(10);
  });

  it("aendert und pausiert einen Filter per Kennung", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    kontoMit(db, { suchprofil: { bundesland: ["Bayern"] } });

    const ergebnis = await aendereSuchprofile(
      "u1",
      { aktion: "aendern", id: "bisher", aenderung: { aktiv: false, name: "Bayern", filter: { bundesland: ["Bayern", "Hessen"] } } },
      1000,
    );

    expect(ergebnis).toEqual({
      ergebnis: "geaendert",
      suchprofile: [
        {
          id: "bisher",
          name: "Bayern",
          filter: { bundesland: ["Bayern", "Hessen"] },
          aktiv: false,
          quelle: "hand",
          erstelltAm: "1970-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(db._daten.get("konten/u1").suchprofile[0].aktiv).toBe(false);
  });

  it("meldet eine unbekannte Kennung beim Aendern", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    kontoMit(db, {});

    expect(await aendereSuchprofile("u1", { aktion: "aendern", id: "gibtsnicht", aenderung: { aktiv: false } }, 1000)).toEqual({
      ergebnis: "unbekannt",
    });
  });

  it("loescht einen Filter per Kennung; eine unbekannte Kennung ist kein Fehler", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    kontoMit(db, { suchprofil: { bundesland: ["Bayern"] } });

    expect(await aendereSuchprofile("u1", { aktion: "loeschen", id: "gibtsnicht" }, 1000)).toMatchObject({
      ergebnis: "geloescht",
      suchprofile: [{ id: "bisher" }],
    });
    expect(await aendereSuchprofile("u1", { aktion: "loeschen", id: "bisher" }, 1000)).toEqual({
      ergebnis: "geloescht",
      suchprofile: [],
    });
    const gespeichert = db._daten.get("konten/u1");
    expect(gespeichert.suchprofile).toEqual([]);
    expect("suchprofil" in gespeichert).toBe(false);
  });
});

describe("ladeSuchprofilFilter", () => {
  it("liefert den Filter mit dieser Kennung, sonst null - ohne ein Konto anzulegen", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    expect(await ladeSuchprofilFilter("u1", "bisher", 1000)).toBeNull();
    expect(db._daten.has("konten/u1")).toBe(false);

    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), suchprofil: { wunschort: "Ulm" } });
    expect(await ladeSuchprofilFilter("u1", "bisher", 1000)).toEqual({ wunschort: "Ulm" });
    expect(await ladeSuchprofilFilter("u1", "anders", 1000)).toBeNull();
  });
});

/**
 * WOZU: Einschalten verlangt mindestens EINEN aktiven, einschraenkenden
 * Filter - pausierte zaehlen nicht (sonst kaeme nie eine Mail, obwohl der
 * Schalter an ist).
 */
describe("setzeBenachrichtigung - aktive Filter", () => {
  const filter = (aktiv, f = { bundesland: ["Bayern"] }) => ({
    id: "a",
    filter: f,
    aktiv,
    quelle: "hand",
    erstelltAm: Timestamp.fromMillis(0),
  });

  it("lehnt das Einschalten ab, wenn alle Filter pausiert sind", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), suchprofile: [filter(false)], merkliste: [] });
    expect(await setzeBenachrichtigung("u1", true, 1000)).toBe("kein-profil");
  });

  it("lehnt das Einschalten mit einem Filter ohne Einschraenkung ab", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", {
      erstelltAm: Timestamp.fromMillis(0),
      suchprofile: [filter(true, { taetigkeitsbereich: "beide" })],
      merkliste: [],
    });
    expect(await setzeBenachrichtigung("u1", true, 1000)).toBe("kein-profil");
  });

  it("schaltet mit einem aktiven Filter ein - auch wenn er aus dem Einzelfeld suchprofil stammt", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), suchprofil: { bundesland: ["Bayern"] }, merkliste: [] });
    expect(await setzeBenachrichtigung("u1", true, 1000)).toBe("gesetzt");
    expect(db._daten.get("konten/u1").benachrichtigung.aktiv).toBe(true);
  });
});

// ─── Merkliste aus der Treffer-Mail ─────────────────────────────────────────

const MAIL_AM = 5_000_000;
const benachrichtigungAlt = () => ({
  aktiv: true,
  abmeldeToken: "t1",
  seit: Timestamp.fromMillis(1),
  letzteAm: null,
  gemeldet: ["ALT"],
});
const eintrag = (pinstGuid, gemerktAm, ausMail?) => ({
  pinstGuid,
  gemerktAm: Timestamp.fromMillis(gemerktAm),
  ...(ausMail !== undefined ? { ausMail: Timestamp.fromMillis(ausMail) } : {}),
});

/** Zeichnet jedes `tx.update` einer Transaktion auf - fuer "in DERSELBEN Transaktion". */
function mitTxProtokoll(db) {
  const protokoll = [];
  const original = db.runTransaction;
  db.runTransaction = async (fn) =>
    original(async (tx) => {
      const updates = [];
      protokoll.push(updates);
      return fn({
        ...tx,
        update: (ref, patch) => {
          updates.push(patch);
          tx.update(ref, patch);
        },
      });
    });
  return protokoll;
}

/**
 * WOZU: nach dem Versand muss `gemeldet` fortgeschrieben werden, sonst kommt
 * dieselbe Mail morgen noch einmal. Die Merkliste haengt in derselben
 * Transaktion dran - aber nie so, dass sie diesen Schreibvorgang verhindert.
 */
describe("schreibeNachVersand", () => {
  it("schreibt Zustand und Merkliste in EINER Transaktion, mit einem einzigen update", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), merkliste: [eintrag("A", 10)], benachrichtigung: benachrichtigungAlt() });
    const protokoll = mitTxProtokoll(db);

    const ergebnis = await schreibeNachVersand("u1", MAIL_AM, ["N1", "N2", "ALT"], ["N1", "N2"]);

    expect(ergebnis).toEqual({ ergebnis: "geschrieben", aufMerkliste: 2, keinPlatz: 0, merklisteFehler: false });
    expect(protokoll).toHaveLength(1);
    expect(protokoll[0]).toHaveLength(1);
    expect(Object.keys(protokoll[0][0]).sort()).toEqual(["benachrichtigung.gemeldet", "benachrichtigung.letzteAm", "merkliste"]);
    const gespeichert = db._daten.get("konten/u1");
    expect(gespeichert.benachrichtigung.gemeldet).toEqual(["N1", "N2", "ALT"]);
    expect(gespeichert.benachrichtigung.letzteAm.toMillis()).toBe(MAIL_AM);
    expect(gespeichert.benachrichtigung.abmeldeToken).toBe("t1");
    expect(gespeichert.merkliste).toEqual([eintrag("N1", MAIL_AM, MAIL_AM), eintrag("N2", MAIL_AM, MAIL_AM), eintrag("A", 10)]);
  });

  it("ueberspringt eine Stelle, die schon auf der Liste steht, und laesst sie selbst gemerkt", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), merkliste: [eintrag("A", 10)], benachrichtigung: benachrichtigungAlt() });

    const ergebnis = await schreibeNachVersand("u1", MAIL_AM, ["A", "N1"], ["A", "N1"]);

    expect(ergebnis).toMatchObject({ aufMerkliste: 1 });
    expect(db._daten.get("konten/u1").merkliste).toEqual([eintrag("N1", MAIL_AM, MAIL_AM), eintrag("A", 10)]);
  });

  it("schreibt bei voller Liste nur den Zustand - die Merkliste bleibt, wie sie ist", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    const voll = Array.from({ length: MERKLISTE_MAX }, (_, i) => eintrag(`S${i}`, i));
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), merkliste: voll, benachrichtigung: benachrichtigungAlt() });
    const protokoll = mitTxProtokoll(db);

    const ergebnis = await schreibeNachVersand("u1", MAIL_AM, ["N1", "ALT"], ["N1"]);

    expect(ergebnis).toEqual({ ergebnis: "geschrieben", aufMerkliste: 0, keinPlatz: 1, merklisteFehler: false });
    expect(Object.keys(protokoll[0][0])).not.toContain("merkliste");
    const gespeichert = db._daten.get("konten/u1");
    expect(gespeichert.benachrichtigung.gemeldet).toEqual(["N1", "ALT"]);
    expect(gespeichert.merkliste).toEqual(voll);
  });

  it("schreibt den Zustand auch, wenn die Merkliste kaputt ist", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", {
      erstelltAm: Timestamp.fromMillis(0),
      merkliste: [{ pinstGuid: "KAPUTT" }],
      benachrichtigung: benachrichtigungAlt(),
    });

    const ergebnis = await schreibeNachVersand("u1", MAIL_AM, ["N1", "ALT"], ["N1"]);

    expect(ergebnis).toMatchObject({ ergebnis: "geschrieben", merklisteFehler: true, aufMerkliste: 0 });
    const gespeichert = db._daten.get("konten/u1");
    expect(gespeichert.benachrichtigung.gemeldet).toEqual(["N1", "ALT"]);
    expect(gespeichert.merkliste).toEqual([{ pinstGuid: "KAPUTT" }]);
  });

  it("schreibt nur den Zustand, wenn die Transaktion als Ganzes scheitert", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), merkliste: [], benachrichtigung: benachrichtigungAlt() });
    db.runTransaction = async () => {
      throw Object.assign(new Error("contention"), { code: 10 });
    };

    const ergebnis = await schreibeNachVersand("u1", MAIL_AM, ["N1", "ALT"], ["N1"]);

    expect(ergebnis).toMatchObject({ ergebnis: "geschrieben", merklisteFehler: true });
    const gespeichert = db._daten.get("konten/u1");
    expect(gespeichert.benachrichtigung.gemeldet).toEqual(["N1", "ALT"]);
    expect(gespeichert.benachrichtigung.letzteAm.toMillis()).toBe(MAIL_AM);
    expect(gespeichert.merkliste).toEqual([]);
  });

  it("meldet ein inzwischen geloeschtes Konto und legt es nicht wieder an", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);

    expect(await schreibeNachVersand("u1", MAIL_AM, ["N1"], ["N1"])).toEqual({ ergebnis: "konto-fehlt" });
    expect(db._daten.has("konten/u1")).toBe(false);
  });
});

/**
 * WOZU: die Herkunft "aus der Mail" darf durch ein spaeteres Merken oder
 * Vergessen nicht verloren gehen, und Eintraege ohne Herkunft bleiben
 * gueltig.
 */
describe("Merkliste: Herkunft aus der Mail", () => {
  it("behaelt ausMail an den uebrigen Eintraegen, wenn der Nutzer etwas vergisst", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", {
      erstelltAm: Timestamp.fromMillis(0),
      merkliste: [eintrag("M", 20, 20), eintrag("A", 10), eintrag("B", 5)],
    });

    await aendereMerkliste("u1", "B", "vergessen", 1000);

    expect(db._daten.get("konten/u1").merkliste).toEqual([eintrag("M", 20, 20), eintrag("A", 10)]);
  });

  it("zeigt ausMail im Browser nur bei Mail-Eintraegen, selbst gemerkte bleiben ohne", () => {
    const record = normalisiere(
      { erstelltAm: Timestamp.fromMillis(0), merkliste: [eintrag("M", 0, 0), eintrag("A", 0)] } as never,
      1000,
    );
    expect(sicht(record, true).merkliste).toEqual([
      { pinstGuid: "M", gemerktAm: "1970-01-01T00:00:00.000Z", ausMail: "1970-01-01T00:00:00.000Z" },
      { pinstGuid: "A", gemerktAm: "1970-01-01T00:00:00.000Z" },
    ]);
  });
});

/**
 * WOZU: geschlossene Stellen verlassen die
 * Merkliste - alle, auch selbst gemerkte. Gelesen und geschrieben in einer
 * Transaktion; ohne Aenderung wird nichts geschrieben.
 */
describe("entferneGeschlosseneVonMerkliste", () => {
  it("entfernt die geschlossenen Stellen und laesst die offenen samt Herkunft stehen", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", {
      erstelltAm: Timestamp.fromMillis(0),
      merkliste: [eintrag("ZU1", 30, 30), eintrag("OFFEN", 20, 20), eintrag("ZU2", 10), eintrag("ALT", 5)],
      benachrichtigung: benachrichtigungAlt(),
    });

    expect(await entferneGeschlosseneVonMerkliste("u1", new Set(["ZU1", "ZU2"]), 1000)).toBe(2);
    const gespeichert = db._daten.get("konten/u1");
    expect(gespeichert.merkliste).toEqual([eintrag("OFFEN", 20, 20), eintrag("ALT", 5)]);
    expect(gespeichert.benachrichtigung).toEqual(benachrichtigungAlt());
  });

  it("schreibt nichts, wenn nichts geschlossen ist, und nichts fuer ein fehlendes Konto", async () => {
    const db = fakeFirestoreKonto();
    getFirestoreMock.mockReturnValue(db);
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), merkliste: [eintrag("A", 1)] });
    const protokoll = mitTxProtokoll(db);

    expect(await entferneGeschlosseneVonMerkliste("u1", new Set(["X"]), 1000)).toBe(0);
    expect(await entferneGeschlosseneVonMerkliste("u2", new Set(["X"]), 1000)).toBe(0);
    expect(protokoll.flat()).toEqual([]);
    expect(db._daten.has("konten/u2")).toBe(false);
  });
});
