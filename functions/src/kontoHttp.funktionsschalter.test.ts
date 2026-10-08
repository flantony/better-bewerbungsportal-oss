import { describe, it, expect, vi, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

/**
 * Funktionsschalter BEWERBERDATEN_IM_KONTO. Massgeblich ist der Server:
 * ausgeschaltet lehnen die schreibenden bzw. verarbeitenden Endpunkte ab,
 * BEVOR sie Firestore, Storage oder eine Ausschreibung anfassen. Lesen,
 * Export und Loeschen gespeicherter Daten muessen weiter gehen. Der Schalter ist hier umstellbar, damit
 * die Tests nicht davon abhaengen, wie er im Code gerade steht.
 */
const schalter = vi.hoisted(() => ({ an: false }));
vi.mock("./lib/funktionsschalter", () => ({
  get BEWERBERDATEN_IM_KONTO() {
    return schalter.an;
  },
}));

const getAuthMock = vi.fn();
vi.mock("firebase-admin/auth", () => ({
  getAuth: (...a: unknown[]) => getAuthMock(...a),
}));

const getFirestoreMock = vi.fn();
vi.mock("firebase-admin/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase-admin/firestore")>();
  return { ...actual, getFirestore: (...a: unknown[]) => getFirestoreMock(...a) };
});

const getStorageMock = vi.fn();
vi.mock("firebase-admin/storage", () => ({
  getStorage: (...a: unknown[]) => getStorageMock(...a),
}));

const loadJobRecordMock = vi.fn();
vi.mock("./mcp/lib/loadJobRecord", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcp/lib/loadJobRecord")>();
  return { ...actual, loadJobRecord: (...a: unknown[]) => loadJobRecordMock(...a) };
});

const {
  BEWERBERDATEN_AUS,
  kontoLaden,
  kontoAngabenSpeichern,
  kontoAngabenLaden,
  kontoAngabenLoeschen,
  kontoUnterlageUploadUrl,
  kontoUnterlageRegistrieren,
  kontoUnterlagen,
  kontoExport,
  kontoBewerbungsplan,
  kontoBewerbungspaketBauen,
} = await import("./kontoHttp");

const PINST_GUID = "0123456789ABCDEF0123456789ABCDEF";
const DOC_ID = "a".repeat(32);

/** Pfad-basierter Mini-Firestore: genug fuer Konto-, Angaben- und Unterlagen-Dokument. */
function fakeFirestore(start: Record<string, Record<string, unknown>> = {}) {
  const daten = new Map<string, Record<string, unknown>>(Object.entries(start));
  const zugriffe: string[] = [];
  function ref(pfad: string) {
    return {
      __pfad: pfad,
      get: async () => {
        zugriffe.push(`get ${pfad}`);
        return { exists: daten.has(pfad), data: () => daten.get(pfad) };
      },
      set: async (wert: Record<string, unknown>) => {
        zugriffe.push(`set ${pfad}`);
        daten.set(pfad, wert);
      },
      delete: async () => {
        zugriffe.push(`delete ${pfad}`);
        daten.delete(pfad);
      },
      collection: (name: string) => ({ doc: (id: string) => ref(`${pfad}/${name}/${id}`) }),
    };
  }
  return {
    daten,
    zugriffe,
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: (r: ReturnType<typeof ref>) => r.get(),
        set: (r: ReturnType<typeof ref>, wert: Record<string, unknown>) => void r.set(wert),
      }),
  };
}

function fakeStorage() {
  const aufrufe: string[] = [];
  return {
    aufrufe,
    bucket: () => ({
      getFiles: async ({ prefix }: { prefix: string }) => {
        aufrufe.push(`getFiles ${prefix}`);
        return [[]];
      },
      file: (pfad: string) => {
        aufrufe.push(`file ${pfad}`);
        return { save: async () => undefined, getSignedUrl: async () => ["https://signed.example/x"] };
      },
    }),
  };
}

function fakeReq(body: unknown, methode: "GET" | "POST" | "PUT", query: Record<string, unknown> = {}) {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  return { body, headers: { authorization: "Bearer test-token", "x-forwarded-for": ip }, method: methode, socket: {}, query };
}

function fakeRes() {
  const aufrufe: { status?: number; body?: unknown }[] = [];
  let letzterStatus: number | undefined;
  const res = {
    status(code: number) {
      letzterStatus = code;
      return res;
    },
    set() {
      return res;
    },
    setHeader() {
      return res;
    },
    getHeader() {
      return undefined;
    },
    on() {
      return res;
    },
    json(body: unknown) {
      aufrufe.push({ status: letzterStatus, body });
    },
    end(body: unknown) {
      aufrufe.push({ status: letzterStatus, body });
    },
  };
  return { res, aufrufe };
}

type Endpunkt = (req: never, res: never) => Promise<void> | void;

async function rufe(endpunkt: unknown, body: unknown, methode: "GET" | "POST" | "PUT", query: Record<string, unknown> = {}) {
  const { res, aufrufe } = fakeRes();
  await (endpunkt as Endpunkt)(fakeReq(body, methode, query) as never, res as never);
  return aufrufe[0];
}

let db: ReturnType<typeof fakeFirestore>;
let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  schalter.an = false;
  getAuthMock.mockReset();
  getFirestoreMock.mockReset();
  getStorageMock.mockReset();
  loadJobRecordMock.mockReset();
  getAuthMock.mockReturnValue({
    verifyIdToken: async () => ({ uid: "u1", email: "u1@example.com", email_verified: true }),
  });
  db = fakeFirestore();
  storage = fakeStorage();
  getFirestoreMock.mockReturnValue(db);
  getStorageMock.mockReturnValue(storage);
});

// ─── Ausgeschaltet: Ablehnung vor jedem Zugriff ─────────────────────────────

describe("BEWERBERDATEN_IM_KONTO aus - schreibende und verarbeitende Endpunkte", () => {
  const faelle: [string, unknown, unknown, "GET" | "POST" | "PUT", Record<string, unknown>?][] = [
    ["kontoAngabenSpeichern", kontoAngabenSpeichern, { nachname: "Muster" }, "PUT"],
    [
      "kontoUnterlageUploadUrl",
      kontoUnterlageUploadUrl,
      { art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf", sizeBytes: 1000 },
      "POST",
    ],
    ["kontoUnterlageRegistrieren", kontoUnterlageRegistrieren, { docId: DOC_ID }, "POST"],
    ["kontoBewerbungsplan", kontoBewerbungsplan, undefined, "GET", { pinstGuid: PINST_GUID }],
    ["kontoBewerbungspaketBauen", kontoBewerbungspaketBauen, { pinstGuid: PINST_GUID, formulare: [], unterlagen: [] }, "POST"],
  ];

  it.each(faelle)("%s antwortet 404 mit verständlichem Satz und fasst nichts an", async (_name, endpunkt, body, methode, query) => {
    const antwort = await rufe(endpunkt, body, methode, query);
    expect(antwort).toEqual({ status: 404, body: { fehler: BEWERBERDATEN_AUS } });
    expect(db.zugriffe).toEqual([]);
    expect(storage.aufrufe).toEqual([]);
    expect(loadJobRecordMock).not.toHaveBeenCalled();
  });

  it("verlangt trotzdem zuerst die Anmeldung (401 ohne gültiges Token)", async () => {
    getAuthMock.mockReturnValue({
      verifyIdToken: async () => {
        throw new Error("ungueltig");
      },
    });
    const antwort = await rufe(kontoAngabenSpeichern, { nachname: "Muster" }, "PUT");
    expect(antwort?.status).toBe(401);
  });

  it("nennt im Satz den Weg ohne Konto - Stellenseite und KI", () => {
    expect(BEWERBERDATEN_AUS).toMatch(/Stellenseite/);
    expect(BEWERBERDATEN_AUS).toMatch(/KI/);
  });
});

describe("BEWERBERDATEN_IM_KONTO an - dieselben Endpunkte arbeiten wieder", () => {
  it("kontoBewerbungsplan prüft dann wieder die Anfrage selbst (400 statt Schalter-404)", async () => {
    schalter.an = true;
    const antwort = await rufe(kontoBewerbungsplan, undefined, "GET", { pinstGuid: "kein-guid" });
    expect(antwort?.status).toBe(400);
    expect(antwort?.body).not.toEqual({ fehler: BEWERBERDATEN_AUS });
  });
});

// ─── kontoLaden traegt den Schalter ─────────────────────────────────────────

describe("kontoLaden meldet den Schalter, damit das Web keine eigene Kopie braucht", () => {
  it("bewerberdatenAktiv: false, solange der Schalter aus ist", async () => {
    const antwort = await rufe(kontoLaden, undefined, "GET");
    expect(antwort?.status).toBe(200);
    expect((antwort?.body as { bewerberdatenAktiv: unknown }).bewerberdatenAktiv).toBe(false);
  });

  it("bewerberdatenAktiv: true, wenn er an ist", async () => {
    schalter.an = true;
    const antwort = await rufe(kontoLaden, undefined, "GET");
    expect((antwort?.body as { bewerberdatenAktiv: unknown }).bewerberdatenAktiv).toBe(true);
  });
});

// ─── Gespeicherte Daten: Lesen, Export, Loeschen bleiben ────────────────────

describe("BEWERBERDATEN_IM_KONTO aus - gespeicherte Daten bleiben einsehbar und löschbar", () => {
  const ALTBESTAND = {
    "konten/u1": { schemaVersion: "konto-v1", erstelltAm: Timestamp.fromMillis(0), suchprofil: null, merkliste: [] },
    "konten/u1/privat/angaben": { schemaVersion: "konto-angaben-v1", angaben: { nachname: "Muster" } },
    "konten/u1/privat/dokumente": {
      schemaVersion: "konto-angaben-v1",
      eintraege: [
        {
          docId: DOC_ID,
          art: "zeugnis",
          dateiname: "zeugnis.pdf",
          contentType: "application/pdf",
          sizeBytes: 10,
          hochgeladenAm: Timestamp.fromMillis(0),
        },
      ],
    },
  };

  beforeEach(() => {
    db = fakeFirestore(ALTBESTAND);
    getFirestoreMock.mockReturnValue(db);
  });

  it("kontoAngabenLaden liefert die gespeicherten Angaben", async () => {
    const antwort = await rufe(kontoAngabenLaden, undefined, "GET");
    expect(antwort?.status).toBe(200);
    expect((antwort?.body as { angaben: Record<string, string> }).angaben.nachname).toBe("Muster");
  });

  it("kontoUnterlagen listet die gespeicherten Unterlagen", async () => {
    const antwort = await rufe(kontoUnterlagen, undefined, "GET");
    expect(antwort?.status).toBe(200);
    expect(antwort?.body).toEqual([expect.objectContaining({ docId: DOC_ID, art: "zeugnis" })]);
  });

  it("kontoExport enthält Angaben und Unterlagen-Verzeichnis", async () => {
    const antwort = await rufe(kontoExport, undefined, "GET");
    expect(antwort?.status).toBe(200);
    const exportDaten = antwort?.body as { angaben: { angaben: Record<string, string> }; unterlagen: { verzeichnis: unknown[] } };
    expect(exportDaten.angaben.angaben.nachname).toBe("Muster");
    expect(exportDaten.unterlagen.verzeichnis).toHaveLength(1);
  });

  it("kontoAngabenLoeschen löscht die gespeicherten Angaben", async () => {
    const antwort = await rufe(kontoAngabenLoeschen, { bestaetigung: "LOESCHEN" }, "POST");
    expect(antwort?.status).toBe(204);
    expect(db.daten.has("konten/u1/privat/angaben")).toBe(false);
  });
});
