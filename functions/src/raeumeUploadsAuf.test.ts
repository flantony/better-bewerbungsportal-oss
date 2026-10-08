import { describe, expect, it, vi, beforeEach } from "vitest";

const getStorageMock = vi.fn();
vi.mock("firebase-admin/storage", () => ({
  getStorage: (...a: unknown[]) => getStorageMock(...a),
}));

const getFirestoreMock = vi.fn();
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: (...a: unknown[]) => getFirestoreMock(...a),
}));

const vergissAusstehendeUnterlageMock = vi.fn();
vi.mock("./konto/kontoStore", () => ({
  vergissAusstehendeUnterlage: (...a: unknown[]) => vergissAusstehendeUnterlageMock(...a),
}));

const {
  eingangAusPfad,
  paketAusPfad,
  raeumeVerwaisteEingaenge,
  raeumeVerwaisteAusstehendeEintraege,
  raeumeVerwaistePakete,
  fuehreUploadAufraeumenAus,
} = await import("./raeumeUploadsAuf");

/**
 * WOZU: `eingangAusPfad` ist die zweite Sicherung hinter dem serverseitigen
 * Filter und muss registrierte Unterlagen (`dokumente/`) zuverlaessig
 * aussortieren, sonst wuerde der Sweep echte, fertige
 * Bewerbungsdateien loeschen.
 */
describe("eingangAusPfad", () => {
  it("zieht uid und docId aus einem Eingangs-Pfad", () => {
    expect(eingangAusPfad("konten/u1/eingang/d1")).toEqual({ uid: "u1", docId: "d1" });
  });

  it("liefert null fuer eine REGISTRIERTE Unterlage (dokumente/) - die darf der Sweep nie anfassen", () => {
    expect(eingangAusPfad("konten/u1/dokumente/d1")).toBeNull();
  });

  it("liefert null fuer das privat/-Verzeichnis (Firestore, kein Storage-Objekt)", () => {
    expect(eingangAusPfad("konten/u1/privat/dokumente")).toBeNull();
  });

  it("liefert null fuer einen zu tief verschachtelten Pfad", () => {
    expect(eingangAusPfad("konten/u1/eingang/d1/zusatz")).toBeNull();
  });

  it("liefert null ausserhalb von konten/", () => {
    expect(eingangAusPfad("bewerbungsmappen/m1/eingang/d1")).toBeNull();
  });
});

/**
 * WOZU: befristete Bewerbungspakete (`konten/{uid}/pakete/{paketId}.zip`)
 * brauchen denselben Schutz wie `eingangAusPfad` - ein zu tief/zu flach
 * verschachtelter oder fremder Pfad darf den Sweep nicht zum Loeschen bringen.
 */
describe("paketAusPfad", () => {
  it("zieht uid und paketId aus einem Paket-Pfad", () => {
    expect(paketAusPfad("konten/u1/pakete/p1.zip")).toEqual({ uid: "u1", paketId: "p1.zip" });
  });

  it("liefert null fuer eine registrierte Unterlage (dokumente/)", () => {
    expect(paketAusPfad("konten/u1/dokumente/d1")).toBeNull();
  });

  it("liefert null fuer das privat/-Verzeichnis (Firestore, kein Storage-Objekt)", () => {
    expect(paketAusPfad("konten/u1/privat/dokumente")).toBeNull();
  });

  it("liefert null fuer einen zu tief verschachtelten Pfad", () => {
    expect(paketAusPfad("konten/u1/pakete/p1.zip/zusatz")).toBeNull();
  });

  it("liefert null ausserhalb von konten/", () => {
    expect(paketAusPfad("bewerbungsmappen/m1/pakete/p1.zip")).toBeNull();
  });
});

function fakeDatei(name: string, timeCreated: string | undefined, geloeschte: Set<string>) {
  return {
    name,
    metadata: { timeCreated },
    delete: async () => {
      geloeschte.add(name);
    },
  };
}

const JETZT = 1_800_000_000_000;
const STUNDE_MS = 60 * 60 * 1000;

beforeEach(() => {
  getStorageMock.mockReset();
  getFirestoreMock.mockReset();
  vergissAusstehendeUnterlageMock.mockReset();
});

/**
 * WOZU: End-to-End (echter Funktionsaufruf, gemockter Bucket) statt nur der
 * reinen Pfad-Logik - das Zusammenspiel "verwaist? -> loeschen -> ausstehend
 * vergessen" ist der eigentliche Punkt dieses Sweeps.
 */
describe("raeumeVerwaisteEingaenge", () => {
  it("loescht ein Eingangs-Objekt aelter als die Frist und vergisst den ausstehend-Eintrag", async () => {
    const geloeschte = new Set<string>();
    const alt = new Date(JETZT - STUNDE_MS - 1000).toISOString();
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async () => [[fakeDatei("konten/u1/eingang/d1", alt, geloeschte)], null, {}],
      }),
    });

    const ergebnis = await raeumeVerwaisteEingaenge(JETZT);

    expect(ergebnis).toEqual({ geloescht: 1, fehlgeschlagen: 0 });
    expect(geloeschte.has("konten/u1/eingang/d1")).toBe(true);
    expect(vergissAusstehendeUnterlageMock).toHaveBeenCalledWith("u1", "d1");
  });

  it("laesst ein frisches Eingangs-Objekt (unter der Frist) unangetastet", async () => {
    const geloeschte = new Set<string>();
    const frisch = new Date(JETZT - 1000).toISOString();
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async () => [[fakeDatei("konten/u1/eingang/d1", frisch, geloeschte)], null, {}],
      }),
    });

    const ergebnis = await raeumeVerwaisteEingaenge(JETZT);

    expect(ergebnis).toEqual({ geloescht: 0, fehlgeschlagen: 0 });
    expect(geloeschte.size).toBe(0);
    expect(vergissAusstehendeUnterlageMock).not.toHaveBeenCalled();
  });

  it("laesst eine REGISTRIERTE Unterlage (dokumente/) unangetastet, egal wie alt", async () => {
    const geloeschte = new Set<string>();
    const uralt = new Date(JETZT - STUNDE_MS * 100).toISOString();
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async () => [[fakeDatei("konten/u1/dokumente/d1", uralt, geloeschte)], null, {}],
      }),
    });

    const ergebnis = await raeumeVerwaisteEingaenge(JETZT);

    expect(ergebnis).toEqual({ geloescht: 0, fehlgeschlagen: 0 });
    expect(geloeschte.size).toBe(0);
  });

  it("listet serverseitig nur Eingangs-Objekte (matchGlob), nicht den ganzen konten/-Bestand", async () => {
    const getFiles = vi.fn().mockResolvedValue([[], null, {}]);
    getStorageMock.mockReturnValue({ bucket: () => ({ getFiles }) });

    await raeumeVerwaisteEingaenge(JETZT);

    expect(getFiles).toHaveBeenCalledWith(expect.objectContaining({ prefix: "konten/", matchGlob: "konten/*/eingang/**" }));
  });

  it("liest mehrere Seiten (nextQuery), bis keine mehr existiert", async () => {
    const geloeschte = new Set<string>();
    const alt = new Date(JETZT - STUNDE_MS - 1000).toISOString();
    const getFiles = vi
      .fn()
      .mockResolvedValueOnce([[fakeDatei("konten/u1/eingang/d1", alt, geloeschte)], { pageToken: "weiter" }, {}])
      .mockResolvedValueOnce([[fakeDatei("konten/u2/eingang/d2", alt, geloeschte)], null, {}]);
    getStorageMock.mockReturnValue({ bucket: () => ({ getFiles }) });

    const ergebnis = await raeumeVerwaisteEingaenge(JETZT);

    expect(ergebnis).toEqual({ geloescht: 2, fehlgeschlagen: 0 });
    expect(getFiles).toHaveBeenCalledTimes(2);
    expect(geloeschte.has("konten/u1/eingang/d1")).toBe(true);
    expect(geloeschte.has("konten/u2/eingang/d2")).toBe(true);
  });

  it("zaehlt eine fehlgeschlagene Loeschung separat, ohne die uebrigen Objekte auszulassen", async () => {
    const geloeschte = new Set<string>();
    const alt = new Date(JETZT - STUNDE_MS - 1000).toISOString();
    const kaputt = {
      name: "konten/u1/eingang/kaputt",
      metadata: { timeCreated: alt },
      delete: async () => {
        throw new Error("boom");
      },
    };
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async () => [[kaputt, fakeDatei("konten/u2/eingang/d2", alt, geloeschte)], null, {}],
      }),
    });

    const ergebnis = await raeumeVerwaisteEingaenge(JETZT);

    expect(ergebnis).toEqual({ geloescht: 1, fehlgeschlagen: 1 });
    expect(geloeschte.has("konten/u2/eingang/d2")).toBe(true);
  });

  it("ignoriert ein Objekt ohne auswertbares timeCreated (im Zweifel nicht loeschen)", async () => {
    const geloeschte = new Set<string>();
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async () => [[fakeDatei("konten/u1/eingang/d1", undefined, geloeschte)], null, {}],
      }),
    });

    const ergebnis = await raeumeVerwaisteEingaenge(JETZT);

    expect(ergebnis).toEqual({ geloescht: 0, fehlgeschlagen: 0 });
    expect(geloeschte.size).toBe(0);
  });
});

/** Ein Firestore-`collectionGroup("privat")`-Treffer, wie er `doc.id`/`doc.ref.path`/`doc.data()` traegt. */
function fakePrivatDoc(pfad: string, daten: Record<string, unknown>) {
  const teile = pfad.split("/");
  return { id: teile[teile.length - 1], ref: { path: pfad }, data: () => daten };
}

function fakeFirestoreCollectionGroup(docs: ReturnType<typeof fakePrivatDoc>[]) {
  return {
    collectionGroup: (name: string) => {
      if (name !== "privat") throw new Error(`unerwartete collectionGroup: ${name}`);
      return { select: () => ({ get: async () => ({ docs }) }) };
    },
  };
}

/**
 * WOZU: ein `ausstehend`-Eintrag kann aelter als die
 * Stundenfrist sein, OHNE dass (noch) ein zugehoeriges Eingangs-Objekt im
 * Storage existiert (z.B. nach einem gescheiterten Best-Effort-
 * Loeschversuch) - der rein storage-basierte Sweep oben (`raeumeVerwaisteEingaenge`)
 * findet einen solchen Eintrag nie. Dieser zweite, Firestore-basierte Sweep
 * schon.
 */
describe("raeumeVerwaisteAusstehendeEintraege", () => {
  const JETZT2 = 1_800_000_000_000;
  const STUNDE = 60 * 60 * 1000;

  it("entfernt einen ausstehend-Eintrag aelter als die Frist", async () => {
    const doc = fakePrivatDoc("konten/u1/privat/dokumente", {
      ausstehend: { d1: { art: "sonstiges", dateiname: "a.pdf", contentType: "application/pdf", erstelltAm: JETZT2 - STUNDE - 1 } },
    });
    getFirestoreMock.mockReturnValue(fakeFirestoreCollectionGroup([doc]));
    vergissAusstehendeUnterlageMock.mockResolvedValue(undefined);

    const ergebnis = await raeumeVerwaisteAusstehendeEintraege(JETZT2);

    expect(ergebnis).toEqual({ geloescht: 1, fehlgeschlagen: 0 });
    expect(vergissAusstehendeUnterlageMock).toHaveBeenCalledWith("u1", "d1");
  });

  it("laesst einen frischen ausstehend-Eintrag (unter der Frist) unangetastet", async () => {
    const doc = fakePrivatDoc("konten/u1/privat/dokumente", {
      ausstehend: { d1: { art: "sonstiges", dateiname: "a.pdf", contentType: "application/pdf", erstelltAm: JETZT2 - 1000 } },
    });
    getFirestoreMock.mockReturnValue(fakeFirestoreCollectionGroup([doc]));

    const ergebnis = await raeumeVerwaisteAusstehendeEintraege(JETZT2);

    expect(ergebnis).toEqual({ geloescht: 0, fehlgeschlagen: 0 });
    expect(vergissAusstehendeUnterlageMock).not.toHaveBeenCalled();
  });

  it("ignoriert ein privat/angaben-Dokument (kann kein ausstehend tragen)", async () => {
    const doc = fakePrivatDoc("konten/u1/privat/angaben", {});
    getFirestoreMock.mockReturnValue(fakeFirestoreCollectionGroup([doc]));

    const ergebnis = await raeumeVerwaisteAusstehendeEintraege(JETZT2);

    expect(ergebnis).toEqual({ geloescht: 0, fehlgeschlagen: 0 });
    expect(vergissAusstehendeUnterlageMock).not.toHaveBeenCalled();
  });

  it("behandelt einen ausstehend-Eintrag ohne numerisches erstelltAm als abgelaufen", async () => {
    const doc = fakePrivatDoc("konten/u1/privat/dokumente", {
      ausstehend: {
        ohne: { art: "sonstiges", dateiname: "a.pdf", contentType: "application/pdf" },
        text: { art: "sonstiges", dateiname: "b.pdf", contentType: "application/pdf", erstelltAm: "2026-01-01" },
        frisch: { art: "sonstiges", dateiname: "c.pdf", contentType: "application/pdf", erstelltAm: JETZT2 - 1000 },
      },
    });
    getFirestoreMock.mockReturnValue(fakeFirestoreCollectionGroup([doc]));
    vergissAusstehendeUnterlageMock.mockResolvedValue(undefined);

    const ergebnis = await raeumeVerwaisteAusstehendeEintraege(JETZT2);

    expect(ergebnis).toEqual({ geloescht: 2, fehlgeschlagen: 0 });
    expect(vergissAusstehendeUnterlageMock).toHaveBeenCalledWith("u1", "ohne");
    expect(vergissAusstehendeUnterlageMock).toHaveBeenCalledWith("u1", "text");
    expect(vergissAusstehendeUnterlageMock).not.toHaveBeenCalledWith("u1", "frisch");
  });

  it("zaehlt einen fehlgeschlagenen Entfernungsversuch separat, ohne die uebrigen auszulassen", async () => {
    const doc = fakePrivatDoc("konten/u1/privat/dokumente", {
      ausstehend: {
        kaputt: { art: "sonstiges", dateiname: "a.pdf", contentType: "application/pdf", erstelltAm: JETZT2 - STUNDE - 1 },
        d2: { art: "sonstiges", dateiname: "b.pdf", contentType: "application/pdf", erstelltAm: JETZT2 - STUNDE - 1 },
      },
    });
    getFirestoreMock.mockReturnValue(fakeFirestoreCollectionGroup([doc]));
    vergissAusstehendeUnterlageMock.mockImplementation(async (_uid: string, docId: string) => {
      if (docId === "kaputt") throw new Error("boom");
    });

    const ergebnis = await raeumeVerwaisteAusstehendeEintraege(JETZT2);

    expect(ergebnis).toEqual({ geloescht: 1, fehlgeschlagen: 1 });
  });
});

/**
 * WOZU: `kontoBewerbungspaketBauen` loescht die eigenen ALTEN
 * Pakete schon bei jedem Neubau - dieser Sweep faengt nur das eine Paket ab,
 * das nach dem letzten Neubau nie abgeholt (und dann nicht durch einen
 * naechsten Bau ersetzt) wurde. Kein Firestore-Gegenstueck wie `ausstehend`
 * noetig, deshalb kein `vergissAusstehendeUnterlageMock`-Erwartungswert hier.
 */
describe("raeumeVerwaistePakete", () => {
  it("loescht ein Paket aelter als die Frist", async () => {
    const geloeschte = new Set<string>();
    const alt = new Date(JETZT - STUNDE_MS - 1000).toISOString();
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async () => [[fakeDatei("konten/u1/pakete/p1.zip", alt, geloeschte)], null, {}],
      }),
    });

    const ergebnis = await raeumeVerwaistePakete(JETZT);

    expect(ergebnis).toEqual({ geloescht: 1, fehlgeschlagen: 0 });
    expect(geloeschte.has("konten/u1/pakete/p1.zip")).toBe(true);
  });

  it("laesst ein frisches Paket (unter der Frist) unangetastet", async () => {
    const geloeschte = new Set<string>();
    const frisch = new Date(JETZT - 1000).toISOString();
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async () => [[fakeDatei("konten/u1/pakete/p1.zip", frisch, geloeschte)], null, {}],
      }),
    });

    const ergebnis = await raeumeVerwaistePakete(JETZT);

    expect(ergebnis).toEqual({ geloescht: 0, fehlgeschlagen: 0 });
    expect(geloeschte.size).toBe(0);
  });

  it("listet serverseitig nur Pakete (matchGlob), nicht den ganzen konten/-Bestand", async () => {
    const getFiles = vi.fn().mockResolvedValue([[], null, {}]);
    getStorageMock.mockReturnValue({ bucket: () => ({ getFiles }) });

    await raeumeVerwaistePakete(JETZT);

    expect(getFiles).toHaveBeenCalledWith(expect.objectContaining({ prefix: "konten/", matchGlob: "konten/*/pakete/**" }));
  });

  it("liest mehrere Seiten (nextQuery), bis keine mehr existiert", async () => {
    const geloeschte = new Set<string>();
    const alt = new Date(JETZT - STUNDE_MS - 1000).toISOString();
    const getFiles = vi
      .fn()
      .mockResolvedValueOnce([[fakeDatei("konten/u1/pakete/p1.zip", alt, geloeschte)], { pageToken: "weiter" }, {}])
      .mockResolvedValueOnce([[fakeDatei("konten/u2/pakete/p2.zip", alt, geloeschte)], null, {}]);
    getStorageMock.mockReturnValue({ bucket: () => ({ getFiles }) });

    const ergebnis = await raeumeVerwaistePakete(JETZT);

    expect(ergebnis).toEqual({ geloescht: 2, fehlgeschlagen: 0 });
    expect(getFiles).toHaveBeenCalledTimes(2);
  });

  it("zaehlt eine fehlgeschlagene Loeschung separat, ohne die uebrigen Pakete auszulassen", async () => {
    const geloeschte = new Set<string>();
    const alt = new Date(JETZT - STUNDE_MS - 1000).toISOString();
    const kaputt = {
      name: "konten/u1/pakete/kaputt.zip",
      metadata: { timeCreated: alt },
      delete: async () => {
        throw new Error("boom");
      },
    };
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async () => [[kaputt, fakeDatei("konten/u2/pakete/p2.zip", alt, geloeschte)], null, {}],
      }),
    });

    const ergebnis = await raeumeVerwaistePakete(JETZT);

    expect(ergebnis).toEqual({ geloescht: 1, fehlgeschlagen: 1 });
    expect(geloeschte.has("konten/u2/pakete/p2.zip")).toBe(true);
  });

  it("ignoriert ein Objekt ohne auswertbares timeCreated (im Zweifel nicht loeschen)", async () => {
    const geloeschte = new Set<string>();
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async () => [[fakeDatei("konten/u1/pakete/p1.zip", undefined, geloeschte)], null, {}],
      }),
    });

    const ergebnis = await raeumeVerwaistePakete(JETZT);

    expect(ergebnis).toEqual({ geloescht: 0, fehlgeschlagen: 0 });
    expect(geloeschte.size).toBe(0);
  });
});

/**
 * WOZU: der Paket-Sweep raeumt befristete Pakete mit
 * Bewerberangaben ab - er darf nicht ausfallen, nur weil ein frueherer
 * Schritt (hier die Firestore-Abfrage der ausstehend-Eintraege) wirft.
 */
describe("fuehreUploadAufraeumenAus", () => {
  it("laesst den Paket-Sweep laufen, obwohl ein frueherer Schritt wirft, und zaehlt den Abbruch", async () => {
    const geloeschte = new Set<string>();
    const alt = new Date(JETZT - STUNDE_MS - 1000).toISOString();
    getStorageMock.mockReturnValue({
      bucket: () => ({
        getFiles: async (query: { matchGlob?: string }) =>
          query.matchGlob?.includes("pakete")
            ? [[fakeDatei("konten/u1/pakete/p1.zip", alt, geloeschte)], null, {}]
            : [[], null, {}],
      }),
    });
    getFirestoreMock.mockImplementation(() => {
      throw Object.assign(new Error("Firestore nicht erreichbar"), { name: "FirestoreFehler" });
    });

    const ergebnis = await fuehreUploadAufraeumenAus(JETZT);

    expect(ergebnis.abgebrochen).toBe(1);
    expect(ergebnis.pakete).toEqual({ geloescht: 1, fehlgeschlagen: 0 });
    expect(geloeschte.has("konten/u1/pakete/p1.zip")).toBe(true);
  });

  it("meldet ohne Fehler keinen Abbruch", async () => {
    getStorageMock.mockReturnValue({ bucket: () => ({ getFiles: async () => [[], null, {}] }) });
    getFirestoreMock.mockReturnValue({ collectionGroup: () => ({ select: () => ({ get: async () => ({ docs: [] }) }) }) });

    const ergebnis = await fuehreUploadAufraeumenAus(JETZT);

    expect(ergebnis.abgebrochen).toBe(0);
  });
});
