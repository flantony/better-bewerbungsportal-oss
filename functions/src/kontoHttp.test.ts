import { describe, it, expect, vi, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import JSZip from "jszip";

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

/**
 * WOZU: `kontoBewerbungsplan`/`kontoBewerbungspaketBauen` laden eine
 * Ausschreibung ueber `loadJobRecord` - ein echter Jobs-Firestore-Fake waere
 * hier unnoetiger Aufwand (v2-Schema, `content`-Subcollection), das Ergebnis
 * ist reine Eingabe fuer den restlichen, bereits pur getesteten Ablauf (s.
 * bewerbung.test.ts). Dasselbe Muster wie in fuelleFormular.test.ts:
 * `loadJobRecord`/`loadJobDocuments`/`readStoredDocument` gemockt, `JobNotFoundError`
 * bleibt die ECHTE Klasse (fuer den `instanceof`-Check in kontoHttp.ts).
 */
const loadJobRecordMock = vi.fn();
vi.mock("./mcp/lib/loadJobRecord", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcp/lib/loadJobRecord")>();
  return { ...actual, loadJobRecord: (...a: unknown[]) => loadJobRecordMock(...a) };
});

const loadJobDocumentsMock = vi.fn();
const readStoredDocumentMock = vi.fn();
vi.mock("./jobDocumentStore", () => ({
  loadJobDocuments: (...a: unknown[]) => loadJobDocumentsMock(...a),
  readStoredDocument: (...a: unknown[]) => readStoredDocumentMock(...a),
}));

// `fillBewerbungsbogen` selbst gemockt (kein echtes PDF noetig), alles andere
// aus dem Modul (detectBewerbungsbogenVariant, angabenFuerVariante, ...) bleibt
// ECHT - `getDocumentRequirements` (ungemockt) braucht die echte Erkennung, um
// `benoetigteAngaben`/`fehlendeAngaben` realistisch zu berechnen.
const fillBewerbungsbogenMock = vi.fn();
vi.mock("./fillBewerbungsbogen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fillBewerbungsbogen")>();
  return { ...actual, fillBewerbungsbogen: (...a: unknown[]) => fillBewerbungsbogenMock(...a) };
});

// Diese Datei prueft die Bewerberdaten-Endpunkte im EINGESCHALTETEN Zustand -
// unabhaengig davon, wie der Schalter gerade steht. Den ausgeschalteten
// Zustand prueft kontoHttp.funktionsschalter.test.ts.
vi.mock("./lib/funktionsschalter", () => ({ BEWERBERDATEN_IM_KONTO: true }));
const queryJobsMock = vi.fn();
vi.mock("./mcp/lib/queryJobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcp/lib/queryJobs")>();
  return { ...actual, queryJobs: (...a: unknown[]) => queryJobsMock(...a) };
});

const {
  baueExport,
  kontoSuchprofileAendern,
  kontoSuchprofilTreffer,
  kontoUnterlageUploadUrl,
  kontoUnterlageRegistrieren,
  kontoUnterlagen,
  kontoUnterlageLoeschen,
  kontoStaatsangehoerigkeitWiderrufen,
  kontoAngabenLoeschen,
  kontoBewerbungsplan,
  kontoBewerbungspaketBauen,
  KONTO_UNTERLAGEN_QUOTA,
  KONTO_PAKET_QUOTA,
  KONTO_QUOTA,
} = await import("./kontoHttp");
const { JobNotFoundError } = await import("./mcp/lib/loadJobRecord");
const { KEINE_AUSWEISKOPIE } = await import("./mappe/ausweiskopie");

/**
 * WOZU: der Export (Art. 15/20 DSGVO) ist eine reine Zusammenstellung - kein
 * Firestore-/Storage-Zugriff. Entscheidend ist, was NICHT drin landet:
 * `optionen` (die statische Formular-Auswahlliste) und alles, was
 * `abmeldeToken`/`gemeldet` waere - beides bekommt diese Funktion aber gar
 * nicht erst hereingereicht (s. `kontoExport`, das nur `KontoSicht`-Felder
 * durchreicht).
 */
describe("baueExport", () => {
  const angaben = {
    angaben: { nachname: "Mustermann" },
    staatsangehoerigkeitEingewilligtAm: null,
    staatsangehoerigkeitTextVersion: null,
  };
  const unterlagen = [
    {
      docId: "d1",
      art: "lebenslauf" as const,
      dateiname: "lebenslauf.pdf",
      contentType: "application/pdf",
      sizeBytes: 1000,
      hochgeladenAm: "2026-01-01T00:00:00.000Z",
      einwilligung: null,
    },
  ];

  it("baut die drei Abschnitte (konto/angaben/unterlagen) plus email", () => {
    const werte = baueExport(
      { suchprofile: [], merkliste: [], benachrichtigungAktiv: false },
      angaben,
      unterlagen,
      "bewerber@example.com",
    );

    expect(werte.email).toBe("bewerber@example.com");
    expect(werte.angaben).toBe(angaben);
    expect(werte.unterlagen.verzeichnis).toBe(unterlagen);
    expect(werte.konto).toEqual({ suchprofile: [], merkliste: [], benachrichtigung: { aktiv: false } });
  });

  it("enthaelt ALLE gespeicherten Filter, auch pausierte", () => {
    const suchprofile = [
      { id: "a", name: "IT", filter: { suchbegriff: "IT" }, aktiv: true, quelle: "ki" as const, erstelltAm: "2026-10-08T00:00:00.000Z" },
      { id: "b", filter: { wunschort: "Ulm" }, aktiv: false, quelle: "hand" as const, erstelltAm: "2026-10-08T00:00:00.000Z" },
    ];
    const werte = baueExport({ suchprofile, merkliste: [], benachrichtigungAktiv: false }, angaben, [], null);
    expect(werte.konto.suchprofile).toEqual(suchprofile);
  });

  it("enthaelt einen Hinweis, dass Dateien einzeln herunterladbar sind - keine Dateiinhalte", () => {
    const werte = baueExport({ suchprofile: [], merkliste: [], benachrichtigungAktiv: false }, angaben, unterlagen, null);
    expect(werte.unterlagen.hinweis.length).toBeGreaterThan(0);
    expect(JSON.stringify(werte)).not.toMatch(/base64|inhalt/i);
  });

  it("nimmt weder abmeldeToken noch gemeldet auf - die Eingabe traegt sie ohnehin nicht", () => {
    const werte = baueExport(
      { suchprofile: [], merkliste: [{ pinstGuid: "abc", gemerktAm: "2026-01-01T00:00:00.000Z" }], benachrichtigungAktiv: true },
      angaben,
      [],
      null,
    );
    expect(JSON.stringify(werte)).not.toMatch(/abmeldeToken|gemeldet/i);
    expect(werte.konto.benachrichtigung).toEqual({ aktiv: true });
  });

  it("liefert email:null unveraendert durch, wenn keine Adresse vorliegt", () => {
    const werte = baueExport({ suchprofile: [], merkliste: [], benachrichtigungAktiv: false }, angaben, [], null);
    expect(werte.email).toBeNull();
  });

  /**
   * WOZU: der Export traegt die Textversion der
   * Staatsangehoerigkeits-Einwilligung neben dem Zeitpunkt - `baueExport`
   * reicht sie unveraendert durch (die eigentliche Zusammenstellung passiert
   * in `angabenExportSicht`, s. angaben.test.ts).
   */
  it("reicht staatsangehoerigkeitTextVersion aus der Eingabe unveraendert durch", () => {
    const angabenMitVersion = {
      angaben: { staatsangehoerigkeit: "deutsch" },
      staatsangehoerigkeitEingewilligtAm: "2026-01-01T00:00:00.000Z",
      staatsangehoerigkeitTextVersion: "staatsangehoerigkeit-v1",
    };
    const werte = baueExport({ suchprofile: [], merkliste: [], benachrichtigungAktiv: false }, angabenMitVersion, [], null);
    expect(werte.angaben.staatsangehoerigkeitTextVersion).toBe("staatsangehoerigkeit-v1");
  });

  // Ohne Ausweiskopie gibt es keinen Einwilligungsvermerk je Unterlage - das
  // Verzeichnis ist die normale Sicht.
  it("fuehrt im Unterlagen-Verzeichnis keinen Einwilligungsvermerk", () => {
    const zeugnis = {
      docId: "d2",
      art: "zeugnis" as const,
      dateiname: "z.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      hochgeladenAm: "2026-01-01T00:00:00.000Z",
    };
    const werte = baueExport({ suchprofile: [], merkliste: [], benachrichtigungAktiv: false }, angaben, [zeugnis], null);
    expect(werte.unterlagen.verzeichnis).toEqual([zeugnis]);
  });
});

/**
 * Minimaler In-Memory-Firestore, der die zwei Zugriffsmuster abdeckt, die
 * kontoHttp.ts und kontoStore.ts auf `konten/{uid}/privat/dokumente` nutzen:
 * `set({..}, {merge:true})` (Bruecke `ausstehend`), `update({"a.b": FieldValue.delete()})`
 * (Dot-Pfad-Feldloeschung) und `runTransaction` (registriereUnterlage).
 */
/**
 * Generischer, PFAD-basierter In-Memory-Firestore (wie `fakeFirestoreKonto`
 * in kontoStore.test.ts): noetig, weil `merkeAusstehendeUnterlage` in
 * DERSELBEN Transaktion sowohl das Dokument
 * `konten/{uid}/privat/dokumente` ALS AUCH das ELTERN-Dokument `konten/{uid}`
 * liest/schreibt - eine Attrappe, die nur EINEN festen Pfad kennt, reicht
 * dafuer nicht aus.
 */
function fakeFirestoreDokumente() {
  const data = new Map<string, Record<string, unknown> | undefined>();

  function deepMerge(ziel: Record<string, unknown>, quelle: Record<string, unknown>): Record<string, unknown> {
    const ergebnis: Record<string, unknown> = { ...ziel };
    for (const [k, v] of Object.entries(quelle)) {
      if (v && typeof v === "object" && !Array.isArray(v) && ziel[k] && typeof ziel[k] === "object") {
        ergebnis[k] = deepMerge(ziel[k] as Record<string, unknown>, v as Record<string, unknown>);
      } else {
        ergebnis[k] = v;
      }
    }
    return ergebnis;
  }

  function anwendenDotPatch(basis: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
    // Tiefe Kopie nur von reinen Objekten/Arrays - Klasseninstanzen wie
    // `Timestamp` bleiben erhalten (ein JSON-Klon machte daraus `{ _seconds }`,
    // was echtes Firestore nicht tut).
    const klon = (wert: unknown): unknown => {
      if (Array.isArray(wert)) return wert.map(klon);
      if (wert && typeof wert === "object" && Object.getPrototypeOf(wert) === Object.prototype) {
        return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, klon(v)]));
      }
      return wert;
    };
    const ergebnis = klon(basis) as Record<string, unknown>;
    for (const [pfad, wert] of Object.entries(patch)) {
      const teile = pfad.split(".");
      let knoten: Record<string, unknown> = ergebnis;
      for (let i = 0; i < teile.length - 1; i++) {
        const naechster = knoten[teile[i]];
        knoten[teile[i]] = naechster && typeof naechster === "object" ? naechster : {};
        knoten = knoten[teile[i]] as Record<string, unknown>;
      }
      const letzterSchluessel = teile[teile.length - 1];
      // FieldValue.delete() ist intern eine DeleteTransform-Instanz - kein
      // oeffentlich dokumentiertes Merkmal, aber fuer diesen Test-Fake reicht
      // der Konstruktorname, da hier ausschliesslich der echte
      // FieldValue-Import aus firebase-admin/firestore verwendet wird.
      if (wert && typeof wert === "object" && wert.constructor?.name === "DeleteTransform") {
        delete knoten[letzterSchluessel];
      } else {
        knoten[letzterSchluessel] = wert;
      }
    }
    return ergebnis;
  }

  function machRef(pfad: string) {
    return {
      __pfad: pfad,
      get: async () => ({ exists: data.has(pfad), data: () => data.get(pfad) }),
      set: async (wert: Record<string, unknown>, opts?: { merge?: boolean }) => {
        data.set(pfad, opts?.merge ? deepMerge((data.get(pfad) as Record<string, unknown>) ?? {}, wert) : wert);
      },
      update: async (patch: Record<string, unknown>) => {
        data.set(pfad, anwendenDotPatch((data.get(pfad) as Record<string, unknown>) ?? {}, patch));
      },
      delete: async () => {
        data.delete(pfad);
      },
      collection: (name: string) => ({ doc: (id: string) => machRef(`${pfad}/${name}/${id}`) }),
    };
  }

  // Simuliert einen fehlschlagenden Schreibvorgang
  // (z.B. registriereUnterlage) - genau EINMAL, damit der naechste Aufruf
  // (der Retry) wieder normal funktioniert.
  let erzwingeNaechstenTransactionFehler = false;

  return {
    _daten: data,
    erzwingeNaechstenTransactionFehler() {
      erzwingeNaechstenTransactionFehler = true;
    },
    collection: (name: string) => ({ doc: (id: string) => machRef(`${name}/${id}`) }),
    runTransaction: async <T>(
      fn: (tx: {
        get: (r: ReturnType<typeof machRef>) => Promise<unknown>;
        set: (r: ReturnType<typeof machRef>, v: unknown, opts?: { merge?: boolean }) => void;
      }) => Promise<T>,
    ): Promise<T> => {
      if (erzwingeNaechstenTransactionFehler) {
        erzwingeNaechstenTransactionFehler = false;
        throw new Error("simulierter Firestore-Fehler");
      }
      const tx = {
        get: async (r: ReturnType<typeof machRef>) => r.get(),
        set: (r: ReturnType<typeof machRef>, v: unknown, opts?: { merge?: boolean }) => {
          void r.set(v as Record<string, unknown>, opts);
        },
        update: (r: ReturnType<typeof machRef>, patch: Record<string, unknown>) => {
          void r.update(patch);
        },
      };
      return fn(tx);
    },
    recursiveDelete: async (ref: ReturnType<typeof machRef>) => {
      const praefix = ref.__pfad;
      for (const key of [...data.keys()]) {
        if (key === praefix || key.startsWith(`${praefix}/`)) data.delete(key);
      }
    },
  };
}

/**
 * `ersteBytes` simuliert die tatsaechlichen Magic Bytes der hochgeladenen
 * Datei (was `erkenneTyp` sieht) - unabhaengig von dem, was `save()` an
 * Puffergroesse traegt (nur die Groesse zaehlt fuer `getMetadata`). Jede
 * Datei traegt zusaetzlich `timeCreated` (wie ein echtes GCS-Objekt) - noetig
 * fuer `bestandImBucket`/`istVerwaisterUpload`, die
 * ein Eingangs-Objekt nur zaehlen, wenn es JUENGER als die Stundenfrist ist.
 *
 * Die Attrappe bildet die GCS-Semantik nach, die in
 * @google-cloud/storage 7.x tatsaechlich gilt (build/cjs/src/file.js):
 * - `bucket.file(pfad, { generation })` pinnt ein Objekt auf eine Generation.
 *   `download()` und `copy()` eines gepinnten Objekts scheitern mit 404, wenn
 *   diese Generation nicht mehr die aktuelle ist (kein Versioning im Bucket) -
 *   `copy()` schickt die Generation als `sourceGeneration`.
 * - `copy(ziel, { preconditionOpts: { ifGenerationMatch } })` landet als
 *   `ifGenerationMatch` im rewriteTo-Aufruf und bezieht sich auf das ZIEL
 *   (ein noch nicht existierendes Ziel hat Generation 0) - wer sie fuer die
 *   QUELLE haelt, laesst jede Registrierung mit 412 scheitern.
 * Jeder `copy()`-Aufruf wird in `kopien` mitgeschrieben.
 */
function fakeStorageMitZustand(ersteBytes: Buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])) {
  const dateien = new Map<string, { size: number; timeCreated: string; contentType?: string; generation: number }>();
  const kopien: { quelle: string; sourceGeneration: number | undefined; opts: Record<string, unknown> | undefined }[] = [];
  let naechsteGeneration = 1;
  // Simuliert ein weiteres PUT ueber dieselbe (noch gueltige) signierte URL
  // GENAU nach einem Pruefschritt: die Datei bekommt dann eine neue Generation.
  const ueberschreibenNach = new Map<string, "getMetadata" | "download">();
  const ueberschreibeFallsFaellig = (pfad: string, schritt: "getMetadata" | "download") => {
    if (ueberschreibenNach.get(pfad) !== schritt) return;
    ueberschreibenNach.delete(pfad);
    const echte = dateien.get(pfad);
    if (echte) echte.generation = naechsteGeneration++;
  };
  const nichtGefunden = () => Object.assign(new Error("No such object"), { code: 404 });

  const file = (pfad: string, fileOpts?: { generation?: number | string }) => {
    const gepinnt = fileOpts?.generation !== undefined ? Number(fileOpts.generation) : undefined;
    /** Quelle lesen - wie GCS mit `generation`/`sourceGeneration`: fehlt sie oder ist die Generation ueberholt -> 404. */
    const lebendeQuelle = () => {
      const echte = dateien.get(pfad);
      if (!echte || (gepinnt !== undefined && echte.generation !== gepinnt)) throw nichtGefunden();
      return echte;
    };
    return {
      name: pfad,
      generation: gepinnt,
      save: async (buf: Buffer) => {
        dateien.set(pfad, { size: buf.length, timeCreated: new Date().toISOString(), generation: naechsteGeneration++ });
      },
      getSignedUrl: async () => [`https://signed.example/${pfad}`],
      exists: async () => [dateien.has(pfad)],
      getMetadata: async () => {
        const echte = dateien.get(pfad);
        const ergebnis = [{ size: String(echte?.size ?? 0), timeCreated: echte?.timeCreated, generation: String(echte?.generation ?? 0) }];
        ueberschreibeFallsFaellig(pfad, "getMetadata");
        return ergebnis;
      },
      download: async () => {
        lebendeQuelle();
        ueberschreibeFallsFaellig(pfad, "download");
        return [ersteBytes];
      },
      delete: async () => {
        dateien.delete(pfad);
      },
      copy: async (ziel: { name: string }, opts?: { contentType?: string; preconditionOpts?: { ifGenerationMatch?: string | number } }) => {
        kopien.push({ quelle: pfad, sourceGeneration: gepinnt, opts: opts as Record<string, unknown> | undefined });
        const quelle = lebendeQuelle();
        const erwartetZiel = opts?.preconditionOpts?.ifGenerationMatch;
        const zielGeneration = dateien.get(ziel.name)?.generation ?? 0;
        if (erwartetZiel !== undefined && Number(erwartetZiel) !== zielGeneration) {
          throw Object.assign(new Error("Precondition Failed"), { code: 412 });
        }
        dateien.set(ziel.name, {
          size: quelle.size,
          timeCreated: new Date().toISOString(),
          contentType: opts?.contentType,
          generation: naechsteGeneration++,
        });
      },
    };
  };
  return {
    dateien,
    kopien,
    /** Testhilfe: simuliert ein Objekt, das vor `stundenAlt` Stunden angelegt wurde (fuer die Verwaist-Pruefung). */
    setzeAlter(pfad: string, stundenAlt: number) {
      const eintrag = dateien.get(pfad);
      if (eintrag) eintrag.timeCreated = new Date(Date.now() - stundenAlt * 60 * 60 * 1000).toISOString();
    },
    /** Testhilfe: direkt nach dem genannten Pruefschritt wird die Datei erneut hochgeladen (neue Generation). */
    ueberschreibeNach(pfad: string, schritt: "getMetadata" | "download") {
      ueberschreibenNach.set(pfad, schritt);
    },
    bucket: () => ({
      file,
      // Echte GCS-`getFiles()`-Ergebnisse sind vollstaendige `File`-Objekte
      // (mit `.delete()` etc.), keine reinen Datenobjekte - `bestandImBucket`
      // liest nur `.name`/`.metadata`, aber `raeumeEigeneEingangUploadsAuf`
      // ruft auf einem gefundenen Eintrag direkt `.delete()` auf. `{ ...file(name) }`
      // liefert dieselben Methoden wie `bucket().file(name)`.
      getFiles: async ({ prefix }: { prefix: string }) => {
        const passende = [...dateien.entries()]
          .filter(([name]) => name.startsWith(prefix))
          .map(([name, meta]) => ({
            ...file(name),
            name,
            metadata: { size: String(meta.size), timeCreated: meta.timeCreated },
          }));
        return [passende];
      },
      // Loeschen per Prefix, wie beim echten Bucket.
      deleteFiles: async ({ prefix }: { prefix: string }) => {
        for (const name of [...dateien.keys()]) {
          if (name.startsWith(prefix)) dateien.delete(name);
        }
      },
    }),
  };
}

/** Minimales Express-Request/Response-Double - wie in mappeHttp.test.ts, mit Bearer-Token (kontoEndpunkt verlangt Anmeldung). */
// Zufaellige IP je Aufruf: `drossel` (das Kontingent) ist ein modulweites
// Singleton, das ueber die gesamte Testdatei hinweg lebt - eine feste IP
// wuerde das Kontingent ueber viele Tests hinweg gemeinsam verbrauchen und
// spaetere Tests faelschlich mit 429 statt des erwarteten Status enden
// lassen. Die Drosselung selbst hat eigene, dedizierte Tests (Wertevergleich
// KONTO_UNTERLAGEN_QUOTA/KONTO_QUOTA) und wird hier nicht gebraucht.
function fakeReq(body: unknown, methode: "GET" | "POST" | "PUT" = "POST", query: Record<string, unknown> = {}) {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  return {
    body,
    headers: { authorization: "Bearer test-token", "x-forwarded-for": ip },
    method: methode,
    socket: {},
    query,
  };
}
function fakeRes() {
  const aufrufe: { status?: number; body?: unknown }[] = [];
  const kopfzeilen: Record<string, string> = {};
  let letzterStatus: number | undefined;
  const res = {
    kopfzeilen,
    status(code: number) {
      letzterStatus = code;
      return res;
    },
    set(name: string, wert: string) {
      kopfzeilen[name] = wert;
      return res;
    },
    json(body: unknown) {
      aufrufe.push({ status: letzterStatus, body });
    },
    send(body: unknown) {
      aufrufe.push({ status: letzterStatus, body });
    },
    setHeader() {
      return res;
    },
    getHeader() {
      return undefined;
    },
    end(body: unknown) {
      aufrufe.push({ status: letzterStatus, body });
    },
    on() {
      return res;
    },
  };
  return { res, aufrufe };
}

beforeEach(() => {
  getAuthMock.mockReset();
  getFirestoreMock.mockReset();
  getStorageMock.mockReset();
  getAuthMock.mockReturnValue({ verifyIdToken: async () => ({ uid: "u1", email_verified: true }) });
});

/**
 * WOZU: `kontoUnterlageRegistrieren` bekommt laut Vertrag nur `{ docId }` -
 * art/dateiname/contentType muessen serverseitig ueberleben, obwohl sie nur
 * bei `kontoUnterlageUploadUrl` genannt wurden. Das ist die Bruecke
 * (`ausstehend` im selben Firestore-Dokument), und genau dieses
 * Zusammenspiel ueber zwei Aufrufe hinweg ist der riskante Teil - eine reine
 * Funktion allein wuerde das nicht zeigen (wie bei mappeUploadUrl in
 * mappeHttp.test.ts).
 */
describe("kontoUnterlageUploadUrl -> kontoUnterlageRegistrieren (ausstehend-Bruecke, eingang -> dokumente)", () => {
  it("registriert mit den bei der Upload-URL genannten art/dateiname, obwohl der Register-Body nur docId traegt", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const { res: res1, aufrufe: aufrufe1 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "zeugnis", dateiname: "Abschlusszeugnis.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res1 as never,
    );
    expect(aufrufe1[0].status).toBe(200);
    const { docId } = aufrufe1[0].body as { docId: string; uploadUrl: string };
    expect(docId).toBeTruthy();

    // Der eigentliche Upload durch den Browser landet im EINGANG, nicht direkt
    // unter dokumente/ - ueberschreibt den Platzhalter.
    const eingangPfad = `konten/u1/eingang/${docId}`;
    await storage.bucket().file(eingangPfad).save(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0]));

    const { res: res2, aufrufe: aufrufe2 } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId }) as never, res2 as never);

    expect(aufrufe2[0].status).toBe(200);
    const sicht = aufrufe2[0].body as { art: string; dateiname: string; contentType: string };
    expect(sicht.art).toBe("zeugnis");
    expect(sicht.dateiname).toBe("Abschlusszeugnis.pdf");
    expect(sicht.contentType).toBe("application/pdf");
    // Nach der Registrierung liegt die Datei unter dokumente/, das
    // Eingangs-Objekt ist weg (kopiert + geloescht, nicht verschoben).
    expect(storage.dateien.has(`konten/u1/dokumente/${docId}`)).toBe(true);
    expect(storage.dateien.has(eingangPfad)).toBe(false);
  });

  it("lehnt die Registrierung ab, wenn keine ausstehende Unterlage zu dieser docId vorliegt", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    getStorageMock.mockReturnValue(fakeStorageMitZustand());

    const { res, aufrufe } = fakeRes();
    // Muss dem Token-Format entsprechen, sonst schlaegt
    // schon die Schemapruefung zu, nicht die ausstehend-Pruefung.
    await kontoUnterlageRegistrieren(fakeReq({ docId: "t" + "0".repeat(25) }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
  });

  /**
   * WOZU: Wir nehmen keine Ausweiskopien entgegen. Schickt ein Client
   * `art: "ausweiskopie"` (auch samt Einwilligungshaken), soll der
   * Bewerber einen verstaendlichen Satz lesen, und es darf weder ein
   * Eingangs-Objekt noch ein `ausstehend`-Eintrag entstehen.
   */
  it.each([
    { art: "ausweiskopie", dateiname: "Perso.jpg", contentType: "image/jpeg", sizeBytes: 1000 },
    {
      art: "ausweiskopie",
      dateiname: "Perso.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1000,
      ausweisEinwilligung: true,
      ausweisEinwilligungTextVersion: "ausweiskopie-konto-v1",
    },
  ])("lehnt eine Upload-URL fuer eine Ausweiskopie mit einer klaren Meldung ab (%#)", async (body) => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageUploadUrl(fakeReq(body) as never, res as never);

    expect(aufrufe).toEqual([{ status: 400, body: { fehler: KEINE_AUSWEISKOPIE } }]);
    expect([...storage.dateien.keys()]).toEqual([]);
    expect(db._daten.get("konten/u1/privat/dokumente")).toBeUndefined();
  });

  /**
   * WOZU: ein `ausstehend`-Eintrag mit der Art Ausweiskopie (hoechstens eine
   * Stunde alt) wird nicht registriert - die Datei landet nie unter
   * dokumente/.
   */
  it("registriert keinen ausstehend-Eintrag mit der Art Ausweiskopie", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const docId = "t" + "1".repeat(25);
    db._daten.set("konten/u1/privat/dokumente", {
      ausstehend: {
        [docId]: {
          art: "ausweiskopie",
          dateiname: "Perso.jpg",
          contentType: "image/jpeg",
          erstelltAm: Date.now(),
          ausweisEinwilligungTextVersion: "ausweiskopie-konto-v1",
        },
      },
    });
    await storage.bucket().file(`konten/u1/eingang/${docId}`).save(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0]));

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
    expect(storage.dateien.has(`konten/u1/dokumente/${docId}`)).toBe(false);
  });

  /**
   * WOZU: weder Groesse noch Typ werden dem Client geglaubt - liefert der
   * echte Datei-Inhalt keine erkennbaren Magic Bytes, wird das EINGANGS-
   * Objekt geloescht UND die Registrierung mit 400 abgelehnt - es darf insbesondere NIE nach dokumente/ kopiert
   * werden.
   */
  it("loescht das Eingangs-Objekt und lehnt ab, wenn die echten Bytes keinen erlaubten Dateityp ergeben", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    // Kein PDF/JPEG/PNG-Header - erkenneTyp liefert null.
    const storage = fakeStorageMitZustand(Buffer.from([0, 1, 2, 3, 4]));
    getStorageMock.mockReturnValue(storage);

    const { res: res1, aufrufe: aufrufe1 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "geheim.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res1 as never,
    );
    const { docId } = aufrufe1[0].body as { docId: string };
    await storage.bucket().file(`konten/u1/eingang/${docId}`).save(Buffer.from([0, 1, 2, 3]));

    const { res: res2, aufrufe: aufrufe2 } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId }) as never, res2 as never);

    expect(aufrufe2[0].status).toBe(400);
    expect(storage.dateien.has(`konten/u1/eingang/${docId}`)).toBe(false);
    expect(storage.dateien.has(`konten/u1/dokumente/${docId}`)).toBe(false);
  });

  /**
   * WOZU: eine docId, die nicht dem von
   * `neuerEinmalToken` erzeugten Format entspricht, wird OHNE jeden
   * Firestore-/Storage-Zugriff abgelehnt - schon die Schemapruefung greift.
   */
  it("lehnt eine docId ab, die nicht dem Token-Format entspricht - kein Firestore-/Storage-Zugriff", async () => {
    getFirestoreMock.mockImplementation(() => {
      throw new Error("Firestore darf bei einer ungueltigen docId nicht angefasst werden");
    });
    getStorageMock.mockImplementation(() => {
      throw new Error("Storage darf bei einer ungueltigen docId nicht angefasst werden");
    });

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId: "../../../etc/passwd" }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
  });
});

/**
 * WOZU: eine nie registrierte Datei darf nicht fuer immer liegen bleiben,
 * dauerhaft gegen die 15-Datei-Grenze zaehlen und unsichtbar in Liste/Export
 * bleiben. Ein Eingangs-Objekt zaehlt deshalb nur, solange es JUENGER als die Stundenfrist ist, UND jeder eigene
 * Upload-URL-Aufruf raeumt zuerst die eigenen verwaisten Objekte auf.
 */
describe("Verwaiste Eingangs-Objekte zaehlen nicht fuer immer", () => {
  it("laesst einen 16. Upload zu, wenn 15 aeltere Eingangs-Objekte laengst verwaist sind", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    // 15 Upload-URLs anfordern, aber NIE hochladen/registrieren - jedes
    // erzeugt einen Platzhalter unter eingang/ und einen ausstehend-Eintrag.
    for (let i = 0; i < 15; i++) {
      const { res } = fakeRes();
      await kontoUnterlageUploadUrl(
        fakeReq({ art: "sonstiges", dateiname: `a${i}.pdf`, contentType: "application/pdf", sizeBytes: 1000 }) as never,
        res as never,
      );
    }
    expect([...storage.dateien.keys()].filter((k) => k.includes("/eingang/"))).toHaveLength(15);

    // Alle 15 sind aelter als die Stundenfrist - "laengst abgebrochen".
    for (const pfad of [...storage.dateien.keys()]) storage.setzeAlter(pfad, 2);

    // Ein 16. Versuch muss trotzdem durchgehen, weil die verwaisten Objekte
    // weder mitgezaehlt werden noch beim Aufraeumen im Weg stehen.
    const { res, aufrufe } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "a16.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
  });

  it("raeumt die eigenen verwaisten Eingangs-Objekte bei der naechsten Upload-URL-Anfrage weg", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const { res: res1, aufrufe: aufrufe1 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "alt.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res1 as never,
    );
    const { docId: alteDocId } = aufrufe1[0].body as { docId: string };
    const altePfad = `konten/u1/eingang/${alteDocId}`;
    storage.setzeAlter(altePfad, 2);

    const { res: res2 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "neu.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res2 as never,
    );

    expect(storage.dateien.has(altePfad)).toBe(false);
    // Der ausstehend-Eintrag der alten docId ist ebenfalls weg.
    const daten = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, unknown> } | undefined;
    expect(daten?.ausstehend?.[alteDocId]).toBeUndefined();
  });

  it("laesst ein FRISCHES eigenes Eingangs-Objekt beim Aufraeumen unangetastet", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const { res: res1, aufrufe: aufrufe1 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "frisch.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res1 as never,
    );
    const { docId } = aufrufe1[0].body as { docId: string };

    const { res: res2 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "zweite.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res2 as never,
    );

    expect(storage.dateien.has(`konten/u1/eingang/${docId}`)).toBe(true);
  });
});

/**
 * WOZU: ein roher, unbegrenzt langer/Steuerzeichen-
 * behafteter Dateiname darf gar nicht erst gespeichert werden - nicht erst
 * beim Download gefiltert werden (dann laege der rohe Name zwischenzeitlich
 * in Firestore).
 */
describe("kontoUnterlageUploadUrl saeubert den Dateinamen VOR dem Speichern", () => {
  it("speichert den bereits von sichererDateiname bereinigten Namen im ausstehend-Eintrag", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "a\r\nb.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res as never,
    );
    const { docId } = aufrufe[0].body as { docId: string };

    const daten = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, { dateiname: string }> };
    expect(daten.ausstehend?.[docId].dateiname).toBe("ab.pdf");
  });

  it("lehnt einen Dateinamen ueber 255 Zeichen ab", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    getStorageMock.mockReturnValue(fakeStorageMitZustand());

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({
        art: "sonstiges",
        dateiname: "a".repeat(256) + ".pdf",
        contentType: "application/pdf",
        sizeBytes: 1000,
      }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(400);
  });
});

/**
 * WOZU: die signierte PUT-URL darf nur genau die
 * DEKLARIERTE Groesse erlauben, nicht pauschal das Dateilimit - sonst koennte
 * eine Anfrage fuer eine 500-KB-Datei am Ende bis zu 10 MB hochladen.
 */
describe("x-goog-content-length-range ist an die deklarierte Groesse gebunden", () => {
  it("bindet die Longe an sizeBytes, nicht an das pauschale Dateilimit", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    getStorageMock.mockReturnValue(fakeStorageMitZustand());

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "klein.pdf", contentType: "application/pdf", sizeBytes: 500_000 }) as never,
      res as never,
    );

    const body = aufrufe[0].body as { pflichtHeader: Record<string, string> };
    expect(body.pflichtHeader["x-goog-content-length-range"]).toBe("0,500000");
  });
});

/**
 * WOZU: kontoUnterlageLoeschen akzeptiert auch eine ausstehende docId - wer
 * eine Upload-URL geholt, sich dann aber
 * umentschieden hat, soll das Eingangs-Objekt nicht dem stuendlichen Sweep
 * ueberlassen muessen.
 */
describe("kontoUnterlageLoeschen loescht auch eine ausstehende (noch nicht registrierte) Unterlage", () => {
  it("entfernt das Eingangs-Objekt und den ausstehend-Eintrag", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const { res: res1, aufrufe: aufrufe1 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "abbruch.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res1 as never,
    );
    const { docId } = aufrufe1[0].body as { docId: string };

    const { res: res2, aufrufe: aufrufe2 } = fakeRes();
    await kontoUnterlageLoeschen(fakeReq({ docId }) as never, res2 as never);

    expect(aufrufe2[0].status).toBe(204);
    expect(storage.dateien.has(`konten/u1/eingang/${docId}`)).toBe(false);
    const daten = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, unknown> } | undefined;
    expect(daten?.ausstehend?.[docId]).toBeUndefined();
  });
});

const GUELTIGE_DOC_ID = "t" + "1".repeat(25);

/**
 * WOZU: schlaegt das Schreiben des
 * Firestore-Eintrags NACH dem Kopieren fehl (Crash/Timeout), darf die Datei
 * nicht unsichtbar in dokumente/ liegen bleiben. Ein RETRY MUSS dann entweder
 * (a) den bereits geschriebenen Eintrag direkt zurueckbekommen (falls das
 * Schreiben doch geklappt hat, nur das Aufraeumen scheiterte) oder (b) einen
 * frischen Versuch machen koennen (falls das Schreiben wirklich scheiterte).
 */
describe("kontoUnterlageRegistrieren ist idempotent bei einem Retry", () => {
  it("liefert bei einem bereits registrierten Eintrag direkt 200 zurueck und raeumt Eingang/ausstehend nach, ohne neu zu kopieren", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    // Zustand NACH einer erfolgreichen Registrierung, aber VOR dem
    // abschliessenden Aufraeumen - simuliert einen Crash/Timeout genau in
    // dieser Luecke: der Eintrag existiert bereits, Eingang UND ausstehend
    // haengen noch nach.
    const bestehenderEintrag = {
      docId: GUELTIGE_DOC_ID,
      art: "zeugnis",
      dateiname: "Abschlusszeugnis.pdf",
      contentType: "application/pdf",
      sizeBytes: 1234,
      hochgeladenAm: Timestamp.fromMillis(1_700_000_000_000),
    };
    db._daten.set("konten/u1/privat/dokumente", {
      eintraege: [bestehenderEintrag],
      ausstehend: {
        [GUELTIGE_DOC_ID]: { art: "zeugnis", dateiname: "Abschlusszeugnis.pdf", contentType: "application/pdf", erstelltAm: 1000 },
      },
    });
    await storage.bucket().file(`konten/u1/eingang/${GUELTIGE_DOC_ID}`).save(Buffer.from([1, 2, 3]));

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId: GUELTIGE_DOC_ID }) as never, res as never);

    expect(aufrufe[0].status).toBe(200);
    const sicht = aufrufe[0].body as { docId: string; dateiname: string; sizeBytes: number };
    expect(sicht.docId).toBe(GUELTIGE_DOC_ID);
    expect(sicht.dateiname).toBe("Abschlusszeugnis.pdf");
    expect(sicht.sizeBytes).toBe(1234);
    // Aufgeraeumt - aber NICHT neu kopiert (die Groesse in dokumente/ waere
    // sonst durch die 3-Byte-Eingangsdatei ueberschrieben worden).
    expect(storage.dateien.has(`konten/u1/eingang/${GUELTIGE_DOC_ID}`)).toBe(false);
    expect(storage.dateien.has(`konten/u1/dokumente/${GUELTIGE_DOC_ID}`)).toBe(false);
    const daten = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, unknown> };
    expect(daten.ausstehend?.[GUELTIGE_DOC_ID]).toBeUndefined();
  });

  it("rollt die Kopie zurueck und antwortet 500, wenn das Schreiben des Eintrags scheitert - Eingang/ausstehend bleiben fuer einen Retry stehen", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const { res: res1, aufrufe: aufrufe1 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res1 as never,
    );
    const { docId } = aufrufe1[0].body as { docId: string };
    await storage.bucket().file(`konten/u1/eingang/${docId}`).save(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0]));

    db.erzwingeNaechstenTransactionFehler();

    const { res: res2, aufrufe: aufrufe2 } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId }) as never, res2 as never);

    expect(aufrufe2[0].status).toBe(500);
    // Die Kopie wurde zurueckgerollt.
    expect(storage.dateien.has(`konten/u1/dokumente/${docId}`)).toBe(false);
    // Eingang UND ausstehend bleiben fuer einen Retry bestehen.
    expect(storage.dateien.has(`konten/u1/eingang/${docId}`)).toBe(true);
    const daten = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, unknown> };
    expect(daten.ausstehend?.[docId]).toBeDefined();

    // Ein anschliessender Retry (ohne erzwungenen Fehler) gelingt normal.
    const { res: res3, aufrufe: aufrufe3 } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId }) as never, res3 as never);
    expect(aufrufe3[0].status).toBe(200);
    expect(storage.dateien.has(`konten/u1/dokumente/${docId}`)).toBe(true);
    expect(storage.dateien.has(`konten/u1/eingang/${docId}`)).toBe(false);
  });
});

/**
 * WOZU: ohne Generation-Bindung koennte ein erneutes
 * PUT durch dieselbe, noch gueltige signierte URL zwischen der Pruefung
 * (Groesse/Magic-Bytes/Mengengrenzen) und dem Kopieren ungepruefte Bytes in
 * dokumente/ einschleusen.
 *
 * Die Bindung laeuft ueber die QUELL-Generation
 * (`bucket.file(pfad, { generation })` -> `sourceGeneration`), NICHT ueber
 * `preconditionOpts.ifGenerationMatch` - das bezieht sich beim Kopieren auf
 * das ZIEL, das es noch nicht gibt, und liesse deshalb jede Registrierung mit
 * 412 scheitern.
 */
describe("kontoUnterlageRegistrieren bindet die Kopie an die gepruefte Quell-Generation", () => {
  async function bereiteUploadVor() {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const { res: res1, aufrufe: aufrufe1 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res1 as never,
    );
    const { docId } = aufrufe1[0].body as { docId: string };
    const eingang = `konten/u1/eingang/${docId}`;
    await storage.bucket().file(eingang).save(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0]));
    return { db, storage, docId, eingang };
  }

  it("registriert normal, wenn sich die Generation NICHT geaendert hat (das Ziel existiert vorher nicht)", async () => {
    const { storage, docId } = await bereiteUploadVor();

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId }) as never, res as never);

    expect(aufrufe[0].status).toBe(200);
    expect(storage.dateien.has(`konten/u1/dokumente/${docId}`)).toBe(true);
  });

  it("kopiert von der gepruefte Quell-Generation und setzt KEINE Vorbedingung auf das Ziel", async () => {
    const { storage, docId, eingang } = await bereiteUploadVor();
    const gepruefteGeneration = storage.dateien.get(eingang)?.generation;

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId }) as never, res as never);

    expect(aufrufe[0].status).toBe(200);
    expect(storage.kopien).toHaveLength(1);
    expect(storage.kopien[0].quelle).toBe(eingang);
    expect(storage.kopien[0].sourceGeneration).toBe(gepruefteGeneration);
    expect(storage.kopien[0].opts).not.toHaveProperty("preconditionOpts");
  });

  it("lehnt ab und raeumt auf, wenn die Datei direkt nach getMetadata ueberschrieben wurde (Byte-Pruefung liest 404)", async () => {
    const { db, storage, docId, eingang } = await bereiteUploadVor();
    storage.ueberschreibeNach(eingang, "getMetadata");

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
    expect((aufrufe[0].body as { fehler: string }).fehler).toBe(
      "Die Datei hat sich während der Prüfung geändert. Bitte lade sie erneut hoch.",
    );
    expect(storage.kopien).toHaveLength(0);
    expect(storage.dateien.has(eingang)).toBe(false);
    expect(storage.dateien.has(`konten/u1/dokumente/${docId}`)).toBe(false);
    const daten = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, unknown> };
    expect(daten.ausstehend?.[docId]).toBeUndefined();
  });

  it("lehnt ab und raeumt auf, wenn die Datei zwischen Byte-Pruefung und Kopie ueberschrieben wurde (Kopie liest 404)", async () => {
    const { db, storage, docId, eingang } = await bereiteUploadVor();
    storage.ueberschreibeNach(eingang, "download");

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageRegistrieren(fakeReq({ docId }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
    expect((aufrufe[0].body as { fehler: string }).fehler).toMatch(/während der Prüfung geändert/);
    expect(storage.dateien.has(eingang)).toBe(false);
    expect(storage.dateien.has(`konten/u1/dokumente/${docId}`)).toBe(false);
    const daten = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, unknown> };
    expect(daten.ausstehend?.[docId]).toBeUndefined();
  });
});

/**
 * WOZU: ein `ausstehend`-Eintrag kann aelter als die
 * Stundenfrist sein, OHNE dass (noch) ein zugehoeriges Eingangs-Objekt
 * existiert (z.B. nach einem gescheiterten Best-Effort-Loeschversuch) - das
 * rein storage-basierte Aufraeumen (ueber `getFiles`) findet einen solchen
 * Eintrag nie.
 */
describe("kontoUnterlageUploadUrl raeumt verwaiste ausstehend-Eintraege auch ohne Storage-Objekt ab", () => {
  it("entfernt einen ausstehend-Eintrag aelter als die Frist, dessen Eingangs-Objekt bereits fehlt", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const { res: res1, aufrufe: aufrufe1 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "alt.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res1 as never,
    );
    const { docId } = aufrufe1[0].body as { docId: string };

    // Das Eingangs-Objekt ist schon weg (z.B. gescheiterter Loeschversuch),
    // der ausstehend-Eintrag aber aelter als die Stundenfrist.
    await storage.bucket().file(`konten/u1/eingang/${docId}`).delete();
    const vorher = db._daten.get("konten/u1/privat/dokumente") as { ausstehend: Record<string, { erstelltAm: number }> };
    vorher.ausstehend[docId].erstelltAm = Date.now() - 2 * 60 * 60 * 1000;

    const { res: res2 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "neu.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res2 as never,
    );

    const nachher = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, unknown> };
    expect(nachher.ausstehend?.[docId]).toBeUndefined();
  });

  it("entfernt einen ausstehend-Eintrag ohne numerisches erstelltAm (gilt als abgelaufen)", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    db._daten.set("konten/u1/privat/dokumente", {
      ausstehend: {
        ohneZeit: { art: "sonstiges", dateiname: "a.pdf", contentType: "application/pdf" },
        textZeit: { art: "sonstiges", dateiname: "b.pdf", contentType: "application/pdf", erstelltAm: "gestern" },
      },
    });

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "neu.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
    const nachher = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, unknown> };
    expect(nachher.ausstehend?.ohneZeit).toBeUndefined();
    expect(nachher.ausstehend?.textZeit).toBeUndefined();
  });

  it("lehnt eine nicht ganzzahlige sizeBytes ab", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    getStorageMock.mockReturnValue(fakeStorageMitZustand());

    const { res, aufrufe } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "a.pdf", contentType: "application/pdf", sizeBytes: 10.5 }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(400);
  });

  it("laesst einen frischen ausstehend-Eintrag ohne Storage-Objekt unangetastet", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);

    const { res: res1, aufrufe: aufrufe1 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "frisch.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res1 as never,
    );
    const { docId } = aufrufe1[0].body as { docId: string };
    await storage.bucket().file(`konten/u1/eingang/${docId}`).delete();

    const { res: res2 } = fakeRes();
    await kontoUnterlageUploadUrl(
      fakeReq({ art: "sonstiges", dateiname: "zweite.pdf", contentType: "application/pdf", sizeBytes: 1000 }) as never,
      res2 as never,
    );

    const nachher = db._daten.get("konten/u1/privat/dokumente") as { ausstehend?: Record<string, unknown> };
    expect(nachher.ausstehend?.[docId]).toBeDefined();
  });
});

// ─── Mehrere Filter je Konto ────────────────────────────────────────────────

/**
 * WOZU: die Statuscodes und Antwortformen sind der Vertrag, auf den die
 * Kontoseite und die Importseite bauen - 200 mit der neuen
 * Liste, 409 mit `frei` ueber der Obergrenze, 404 fuer eine unbekannte
 * Kennung, 400 fuer alles, was das Schema nicht kennt.
 */
describe("kontoSuchprofileAendern", () => {
  const zehnFilter = () =>
    Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      filter: { suchbegriff: `W${i}` },
      aktiv: true,
      quelle: "hand",
      erstelltAm: Timestamp.fromMillis(0),
    }));

  it("haengt Filter an, ueberspringt Dubletten und antwortet mit der neuen Liste", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    const { res, aufrufe } = fakeRes();
    await kontoSuchprofileAendern(
      fakeReq({
        aktion: "hinzufuegen",
        suchprofile: [
          { filter: { bundesland: ["Bayern"] }, quelle: "ki", name: "Bayern" },
          { filter: { bundesland: ["Bayern"], taetigkeitsbereich: "beide" } },
        ],
      }) as never,
      res as never,
    );
    expect(aufrufe[0].status).toBe(200);
    const body = aufrufe[0].body as { ergebnis: string; hinzugefuegt: string[]; uebersprungen: number; suchprofile: { id: string }[] };
    expect(body).toMatchObject({
      ergebnis: "hinzugefuegt",
      uebersprungen: 1,
      suchprofile: [{ name: "Bayern", filter: { bundesland: ["Bayern"] }, aktiv: true, quelle: "ki" }],
    });
    expect(body.hinzugefuegt).toEqual([body.suchprofile[0].id]);
  });

  it("lehnt den elften Filter mit 409, verstaendlicher Meldung und frei: 0 ab", async () => {
    const db = fakeFirestoreDokumente();
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), merkliste: [], suchprofile: zehnFilter() });
    getFirestoreMock.mockReturnValue(db);
    const { res, aufrufe } = fakeRes();
    await kontoSuchprofileAendern(
      fakeReq({ aktion: "hinzufuegen", suchprofile: [{ filter: { suchbegriff: "elf" } }] }) as never,
      res as never,
    );
    expect(aufrufe[0]).toEqual({
      status: 409,
      body: {
        fehler: "Du kannst höchstens 10 Filter speichern. Lösche erst einen, bevor du einen neuen hinzufügst.",
        frei: 0,
      },
    });
  });

  it("antwortet 404 fuer eine unbekannte Kennung und 409 fuer eine Aenderung zur Dublette", async () => {
    const db = fakeFirestoreDokumente();
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), merkliste: [], suchprofile: zehnFilter().slice(0, 2) });
    getFirestoreMock.mockReturnValue(db);

    const unbekannt = fakeRes();
    await kontoSuchprofileAendern(fakeReq({ aktion: "aendern", id: "zzz", aktiv: false }) as never, unbekannt.res as never);
    expect(unbekannt.aufrufe[0].status).toBe(404);

    const doppelt = fakeRes();
    await kontoSuchprofileAendern(
      fakeReq({ aktion: "aendern", id: "e0", filter: { suchbegriff: "W1" } }) as never,
      doppelt.res as never,
    );
    expect(doppelt.aufrufe[0]).toEqual({ status: 409, body: { fehler: "Genau diesen Filter hast du schon gespeichert." } });
  });

  it("pausiert und loescht per Kennung", async () => {
    const db = fakeFirestoreDokumente();
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), merkliste: [], suchprofile: zehnFilter().slice(0, 2) });
    getFirestoreMock.mockReturnValue(db);

    const pausiert = fakeRes();
    await kontoSuchprofileAendern(fakeReq({ aktion: "aendern", id: "e0", aktiv: false }) as never, pausiert.res as never);
    expect(pausiert.aufrufe[0]).toMatchObject({ status: 200, body: { ergebnis: "geaendert", suchprofile: [{ id: "e0", aktiv: false }, { id: "e1" }] } });

    const geloescht = fakeRes();
    await kontoSuchprofileAendern(fakeReq({ aktion: "loeschen", id: "e0" }) as never, geloescht.res as never);
    expect(geloescht.aufrufe[0]).toMatchObject({ status: 200, body: { ergebnis: "geloescht", suchprofile: [{ id: "e1" }] } });
  });

  it("lehnt eine ungueltige Anfrage und eine falsche Methode ab", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    const schlecht = fakeRes();
    await kontoSuchprofileAendern(
      fakeReq({ aktion: "hinzufuegen", suchprofile: [{ filter: { vorname: "X" } }] }) as never,
      schlecht.res as never,
    );
    expect(schlecht.aufrufe[0].status).toBe(400);

    const methode = fakeRes();
    await kontoSuchprofileAendern(fakeReq({}, "PUT") as never, methode.res as never);
    expect(methode.aufrufe[0].status).toBe(405);
  });
});

describe("kontoSuchprofilTreffer", () => {
  beforeEach(() => {
    queryJobsMock.mockReset();
  });

  it("zaehlt den gespeicherten Filter ueber queryJobs mit limit 1", async () => {
    const db = fakeFirestoreDokumente();
    db._daten.set("konten/u1", { erstelltAm: Timestamp.fromMillis(0), suchprofil: { bundesland: ["Bayern"] } });
    getFirestoreMock.mockReturnValue(db);
    queryJobsMock.mockResolvedValue({ results: [], totalCount: 42, gelesen: 1, abgeschnitten: false, sortierung: "bewerbungsschluss" });

    const { res, aufrufe } = fakeRes();
    await kontoSuchprofilTreffer(fakeReq(undefined, "GET", { id: "bisher" }) as never, res as never);

    expect(aufrufe[0]).toEqual({ status: 200, body: { anzahl: 42, mindestens: false } });
    expect(queryJobsMock.mock.calls[0][0]).toMatchObject({ limit: 1, bundesland: ["09"] });
  });

  it("antwortet 404 fuer eine fremde/unbekannte Kennung, ohne zu zaehlen", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    const { res, aufrufe } = fakeRes();
    await kontoSuchprofilTreffer(fakeReq(undefined, "GET", { id: "bisher" }) as never, res as never);
    expect(aufrufe[0].status).toBe(404);
    expect(queryJobsMock).not.toHaveBeenCalled();
  });

  it("antwortet 400 fuer eine ungueltige Kennung", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    const { res, aufrufe } = fakeRes();
    await kontoSuchprofilTreffer(fakeReq(undefined, "GET", { id: "../x" }) as never, res as never);
    expect(aufrufe[0].status).toBe(400);
  });
});

describe("kontoUnterlagen (Liste)", () => {
  it("liefert eine leere Liste, wenn noch nichts registriert ist", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    const { res, aufrufe } = fakeRes();
    await kontoUnterlagen(fakeReq({}, "GET") as never, res as never);
    expect(aufrufe[0]).toEqual({ status: 200, body: [] });
  });
});

/**
 * WOZU: Upload-URL/Registrieren bekommen ein eigenes, grosszuegigeres
 * Kontingent (Burst 40, 20/Minute) - ein Namensraum getrennt von den
 * uebrigen Kontoendpunkten (KONTO_QUOTA, Burst 30). Reiner Werte-Check statt
 * eines vollen Drosselungs-Durchlaufs (der ist bereits in mappeHttp.test.ts
 * fuer dieselbe Mechanik ausfuehrlich getestet).
 */
describe("KONTO_UNTERLAGEN_QUOTA", () => {
  it("ist grosszuegiger und von KONTO_QUOTA getrennt konfiguriert", () => {
    expect(KONTO_UNTERLAGEN_QUOTA.capacity).toBeGreaterThan(KONTO_QUOTA.capacity);
    expect(KONTO_UNTERLAGEN_QUOTA).not.toEqual(KONTO_QUOTA);
  });
});

// ─── kontoBewerbungsplan / kontoBewerbungspaketBauen ────────────────────────

function testJob(over: Record<string, unknown> = {}) {
  return {
    pinstGuid: "job1",
    refCode: "REF-1",
    title: "Testjob",
    applicationEnd: "01.06.2027",
    active: true,
    dokumente: [{ docId: "f1", attHeader: "Bewerbungsbogen_Militärisch" }],
    companyDesc: "",
    jobDesc: "",
    requireDesc: "",
    remarcDesc: "",
    contactDesc: "",
    ...over,
  };
}

function testJobDokumente() {
  return [
    {
      docId: "f1",
      attHeader: "Bewerbungsbogen_Militärisch",
      attTypeTxt: "Bewerbungsbogen",
      contentType: "application/pdf",
      sizeBytes: 500,
      storagePath: "jobDocuments/f1.pdf",
      url: "https://example.test/f1.pdf",
      quelleUrl: "https://bundeswehr.example/f1.pdf",
    },
  ];
}

function setzeAngaben(db: ReturnType<typeof fakeFirestoreDokumente>, werte: Record<string, string>) {
  db._daten.set("konten/u1/privat/angaben", {
    schemaVersion: "konto-angaben-v1",
    angaben: werte,
    einwilligungStaatsangehoerigkeit: null,
    geaendertAm: Timestamp.fromMillis(0),
  });
}

/** Eine registrierte Unterlage (`konten/u1/privat/dokumente`) - fuer Tests, die eine ECHTE Storage-Datei im Paket brauchen. */
function setzeUnterlagen(db: ReturnType<typeof fakeFirestoreDokumente>, eintraege: Record<string, unknown>[]) {
  db._daten.set("konten/u1/privat/dokumente", { schemaVersion: "konto-angaben-v1", eintraege });
}

const VOLLSTAENDIGE_ANGABEN = { nachname: "Mustermann", vorname: "Erika", geburtsdatum: "1990-01-01" };

beforeEach(() => {
  loadJobRecordMock.mockReset().mockResolvedValue(testJob());
  loadJobDocumentsMock.mockReset().mockResolvedValue(testJobDokumente());
  readStoredDocumentMock.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  fillBewerbungsbogenMock.mockReset().mockResolvedValue({
    bytes: new Uint8Array([37, 80, 68, 70]),
    filledExtraKeys: [],
    fehlendeAngaben: [],
  });
});

describe("kontoBewerbungsplan", () => {
  it("lehnt ein ungueltig geformtes pinstGuid ab, ohne loadJobRecord aufzurufen", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    const { res, aufrufe } = fakeRes();

    await kontoBewerbungsplan(fakeReq({}, "GET", { pinstGuid: "../../etc" }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
    expect(loadJobRecordMock).not.toHaveBeenCalled();
  });

  it("liefert 404 mit Satz, wenn die Stelle unbekannt ist", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    loadJobRecordMock.mockRejectedValue(new JobNotFoundError());
    const { res, aufrufe } = fakeRes();

    await kontoBewerbungsplan(fakeReq({}, "GET", { pinstGuid: "job1" }) as never, res as never);

    expect(aufrufe[0].status).toBe(404);
    expect((aufrufe[0].body as { fehler: string }).fehler.length).toBeGreaterThan(0);
  });

  it("liefert aktiv:false fuer eine inaktive Stelle, statt eines Fehlers", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    loadJobRecordMock.mockResolvedValue(testJob({ active: false }));
    const { res, aufrufe } = fakeRes();

    await kontoBewerbungsplan(fakeReq({}, "GET", { pinstGuid: "job1" }) as never, res as never);

    expect(aufrufe[0].status).toBe(200);
    expect((aufrufe[0].body as { stelle: { aktiv: boolean } }).stelle.aktiv).toBe(false);
  });

  it("nennt die fehlenden Angaben eines Formulars in Alltagssprache", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    setzeAngaben(db, { nachname: "Mustermann", vorname: "Erika" }); // Geburtsdatum fehlt

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungsplan(fakeReq({}, "GET", { pinstGuid: "job1" }) as never, res as never);

    expect(aufrufe[0].status).toBe(200);
    const plan = aufrufe[0].body as { formulare: { fehlendeAngaben: string[] }[] };
    expect(plan.formulare[0].fehlendeAngaben).toContain("Geburtsdatum");
  });

  /**
   * Der Plan muss die Konto-Auth-
   * E-Mail (aus dem geprueften ID-Token) als Rueckfall zaehlen, dieselbe
   * Quelle wie `fuellwerteAus` - sonst meldet der Plan "E-Mail fehlt" fuer
   * ein Formular, das der Paketbau anschliessend klaglos fuellt.
   */
  it("zaehlt die Konto-Auth-E-Mail als vorhanden, wenn angaben.email selbst leer ist", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getAuthMock.mockReturnValue({
      verifyIdToken: async () => ({ uid: "u1", email_verified: true, email: "bewerber@example.com" }),
    });
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN); // kein angaben.email

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungsplan(fakeReq({}, "GET", { pinstGuid: "job1" }) as never, res as never);

    expect(aufrufe[0].status).toBe(200);
    const plan = aufrufe[0].body as { formulare: { fehlendeAngaben: string[] }[] };
    expect(plan.formulare[0].fehlendeAngaben).not.toContain("E-Mail");
  });

  /**
   * Paketseite und Merkzettel duerfen sich beim Bewerbungsschluss nicht
   * widersprechen ("nicht angegeben" gegen "keiner") - der Plan traegt den
   * fertigen Wortlaut aus demselben Helfer.
   */
  it("liefert den Bewerbungsschluss in Worten aus demselben Helfer wie der Merkzettel", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    loadJobRecordMock.mockResolvedValue(
      testJob({ applicationEnd: "", companyDesc: "<p>Bewerbung und Einstellung jederzeit möglich</p>" }),
    );

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungsplan(fakeReq({}, "GET", { pinstGuid: "job1" }) as never, res as never);

    const plan = aufrufe[0].body as { stelle: { bewerbungsschluss: string; bewerbungsschlussText: string } };
    expect(plan.stelle.bewerbungsschluss).toBe("");
    expect(plan.stelle.bewerbungsschlussText).toBe("keiner, Bewerbung jederzeit möglich");
  });

  it("nennt ein vorhandenes Datum unveraendert", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungsplan(fakeReq({}, "GET", { pinstGuid: "job1" }) as never, res as never);

    const plan = aufrufe[0].body as { stelle: { bewerbungsschlussText: string } };
    expect(plan.stelle.bewerbungsschlussText).toBe("01.06.2027");
  });
});

describe("kontoBewerbungspaketBauen", () => {
  it("lehnt ein ungueltig geformtes pinstGuid ab, ohne loadJobRecord aufzurufen", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    const { res, aufrufe } = fakeRes();

    await kontoBewerbungspaketBauen(fakeReq({ pinstGuid: "../x", formulare: [], unterlagen: [] }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
    expect(loadJobRecordMock).not.toHaveBeenCalled();
  });

  it("liefert 404, wenn die Stelle unbekannt ist", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    loadJobRecordMock.mockRejectedValue(new JobNotFoundError());
    const { res, aufrufe } = fakeRes();

    await kontoBewerbungspaketBauen(fakeReq({ pinstGuid: "job1", formulare: [], unterlagen: [] }) as never, res as never);

    expect(aufrufe[0].status).toBe(404);
  });

  it("lehnt eine fremde/unbekannte Formular-docId ab (400), ohne dass fillBewerbungsbogen laeuft", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: ["fremde-docid"], unterlagen: [] }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(400);
    expect(fillBewerbungsbogenMock).not.toHaveBeenCalled();
  });

  it("lehnt eine fremde/unbekannte Unterlagen-docId ab (400)", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: [], unterlagen: ["nicht-meine-unterlage"] }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(400);
  });

  /**
   * Der reale Storage-Lesezweig von `leseDatei` (eine
   * Ablage-Unterlage, nicht In-Memory) benutzt eine Buffer-VIEW statt
   * einer Kopie (`new Uint8Array(bytes.buffer, ...)`) - dieser Test belegt,
   * dass das gebaute ZIP damit weiterhin ein gueltiges Paket ist.
   */
  it("baut ein Paket mit einer echten, aus Storage gelesenen Ablage-Unterlage (Buffer-View statt Kopie)", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);
    setzeUnterlagen(db, [
      { docId: "u1", art: "lebenslauf", dateiname: "mein-lebenslauf.pdf", contentType: "application/pdf", sizeBytes: 11 },
    ]);
    await storage.bucket().file("konten/u1/dokumente/u1").save(Buffer.from("Hallo Welt!"));

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(fakeReq({ pinstGuid: "job1", formulare: [], unterlagen: ["u1"] }) as never, res as never);

    expect(aufrufe[0].status).toBe(200);
  });

  /**
   * WOZU: Kernvorschrift - fehlen Nachname/Vorname/Geburtsdatum,
   * darf KEIN Formular gefuellt werden (kein teilweise ausgefuelltes PDF).
   */
  it("lehnt den Paketbau ab (400) mit den fehlenden Feldnamen, wenn Kern-Angaben fehlen", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeAngaben(db, { nachname: "Mustermann", vorname: "Erika" }); // Geburtsdatum fehlt

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [] }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
    expect((aufrufe[0].body as { fehler: string }).fehler).toBe(
      "Für dieses Formular fehlen noch: Geburtsdatum. Name, Vorname und Geburtsdatum brauchen wir in jedem Fall. Ergänze sie bitte in „Meine Angaben“.",
    );
    expect(fillBewerbungsbogenMock).not.toHaveBeenCalled();
  });

  it("baut ein Paket nur aus einem Anschreiben-Text und liefert url+dateiname", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: [], unterlagen: [], anschreiben: "Sehr geehrte Damen und Herren," }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
    const body = aufrufe[0].body as { url: string; dateiname: string };
    expect(body.dateiname).toBe("Bewerbung_REF-1.zip");
    expect(body.url).toContain("konten/u1/pakete/");
    expect([...storage.dateien.keys()].some((k) => k.startsWith("konten/u1/pakete/") && k.endsWith(".zip"))).toBe(true);
  });

  it("fuellt ein gewaehltes Formular ueber fillBewerbungsbogen mit den Vorlagen-Bytes und den Angaben", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);

    const { res, aufrufe } = fakeRes();
    // Der militaerische Bogen verlangt ueber die Kernfelder hinaus u.a. PLZ/
    // Strasse/Telefon (VOLLSTAENDIGE_ANGABEN traegt nur Kernfelder) -
    // `luekenAkzeptiert: true` haelt diesen Test bei seiner eigentlichen
    // Frage (wird fillBewerbungsbogen korrekt aufgerufen?), die separate
    // Luecken-Pruefung hat eigene Tests weiter unten.
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [], luekenAkzeptiert: true }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
    expect(readStoredDocumentMock).toHaveBeenCalledWith("jobDocuments/f1.pdf");
    expect(fillBewerbungsbogenMock).toHaveBeenCalledOnce();
    const [, werte, attHeader] = fillBewerbungsbogenMock.mock.calls[0];
    expect(werte).toMatchObject({ nachname: "Mustermann", vorname: "Erika" });
    expect(attHeader).toBe("Bewerbungsbogen_Militärisch");
  });

  it("loescht ein aelteres eigenes Paket, wenn ein neues gebaut wird", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);
    await storage.bucket().file("konten/u1/pakete/alt.zip").save(Buffer.from([1, 2, 3]));

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: [], unterlagen: [], lebenslauf: "Werdegang..." }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
    expect(storage.dateien.has("konten/u1/pakete/alt.zip")).toBe(false);
  });

  /**
   * Erst speichern, DANN alle ANDEREN eigenen Pakete
   * loeschen - mehrere aeltere Pakete (nicht nur eines) muessen dabei
   * verschwinden, und das NEUE muss danach als einziges uebrig bleiben.
   */
  it("loescht ALLE anderen eigenen Pakete, behaelt aber das gerade gebaute", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);
    await storage.bucket().file("konten/u1/pakete/alt1.zip").save(Buffer.from([1]));
    await storage.bucket().file("konten/u1/pakete/alt2.zip").save(Buffer.from([2]));

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: [], unterlagen: [], anschreiben: "Text" }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
    expect(storage.dateien.has("konten/u1/pakete/alt1.zip")).toBe(false);
    expect(storage.dateien.has("konten/u1/pakete/alt2.zip")).toBe(false);
    const uebrig = [...storage.dateien.keys()].filter((k) => k.startsWith("konten/u1/pakete/"));
    expect(uebrig).toHaveLength(1);
  });

  it("lehnt ein zu grosses Paket ab (400), bevor Vorlagen heruntergeladen werden", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);
    loadJobDocumentsMock.mockResolvedValue([{ ...testJobDokumente()[0], sizeBytes: 70 * 1024 * 1024 }]);
    loadJobRecordMock.mockResolvedValue(
      testJob({ dokumente: [{ docId: "f1", attHeader: "Bewerbungsbogen_Militärisch" }] }),
    );

    const { res, aufrufe } = fakeRes();
    // luekenAkzeptiert:true haelt diesen Test bei der Groessen-Vorpruefung -
    // ohne es wuerde bereits die Luecken-Pruefung (VOLLSTAENDIGE_ANGABEN
    // deckt nicht alle vom militaerischen Bogen verlangten Felder) mit 400
    // antworten, aus einem anderen Grund als hier getestet werden soll.
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [], luekenAkzeptiert: true }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(400);
    expect((aufrufe[0].body as { fehler: string }).fehler).toMatch(/höchstens/);
    expect(readStoredDocumentMock).not.toHaveBeenCalled();
  });

  // ─── Formularspezifische Luecken ueber die Kernfelder hinaus ──────────────

  it("lehnt den Paketbau ab (400), wenn ein Formular ohne luekenAkzeptiert weitere Pflichtfelder vermisst", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN); // nur Kernfelder - der militaerische Bogen braucht mehr

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [] }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
    const fehler = (aufrufe[0].body as { fehler: string }).fehler;
    expect(fehler).toContain("Bewerbungsbogen_Militärisch");
    expect(fehler).toMatch(/Postleitzahl/);
    expect(fehler).toMatch(/Meine Angaben/);
    expect(fillBewerbungsbogenMock).not.toHaveBeenCalled();
  });

  it("baut das Paket trotz fehlender Nicht-Kernfelder, wenn luekenAkzeptiert:true gesetzt ist", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [], luekenAkzeptiert: true }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
    expect(fillBewerbungsbogenMock).toHaveBeenCalledOnce();
  });

  it("lehnt trotz luekenAkzeptiert ab, wenn Kern-Angaben (Nachname/Vorname/Geburtsdatum) fehlen - die Luecken-Bestaetigung hebelt die Kernpruefung nicht aus", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeAngaben(db, { nachname: "Mustermann", vorname: "Erika" }); // Geburtsdatum fehlt

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [], luekenAkzeptiert: true }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(400);
    expect((aufrufe[0].body as { fehler: string }).fehler).toBe(
      "Für dieses Formular fehlen noch: Geburtsdatum. Name, Vorname und Geburtsdatum brauchen wir in jedem Fall. Ergänze sie bitte in „Meine Angaben“.",
    );
    expect(fillBewerbungsbogenMock).not.toHaveBeenCalled();
  });

  it("honoriert die ECHTEN Luecken aus fillBewerbungsbogen genauso wie die Plan-Vorschau", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);
    // Simuliert eine Vorlage, die (anders als der Plan angenommen hat) beim
    // tatsaechlichen Fuellen noch ein weiteres Feld vermisst.
    fillBewerbungsbogenMock.mockResolvedValue({
      bytes: new Uint8Array([37, 80, 68, 70]),
      filledExtraKeys: [],
      fehlendeAngaben: ["fuehrerschein"],
    });

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [], luekenAkzeptiert: true }) as never,
      res as never,
    );

    // luekenAkzeptiert:true deckt auch die ECHTEN Luecken ab -> Erfolg.
    expect(aufrufe[0].status).toBe(200);
  });
});

describe("KONTO_PAKET_QUOTA", () => {
  it("ist enger als KONTO_QUOTA (Paketbau ist teuer)", () => {
    expect(KONTO_PAKET_QUOTA.capacity).toBeLessThan(KONTO_QUOTA.capacity);
    expect(KONTO_PAKET_QUOTA).not.toEqual(KONTO_QUOTA);
  });
});

/**
 * WOZU: ein gebautes Paket kann die widerrufene
 * Staatsangehoerigkeit, geloeschte Angaben oder eine geloeschte Unterlage
 * enthalten. "Widerruf loescht sofort" gilt nur, wenn das Paket mit
 * verschwindet - nicht erst beim stuendlichen Sweep.
 */
describe("Widerruf/Loeschen raeumt die eigenen Bewerbungspakete sofort ab", () => {
  const endpunkte = [
    { name: "kontoStaatsangehoerigkeitWiderrufen", aufruf: () => kontoStaatsangehoerigkeitWiderrufen, body: {} },
    { name: "kontoAngabenLoeschen", aufruf: () => kontoAngabenLoeschen, body: { bestaetigung: "LOESCHEN" } },
    { name: "kontoUnterlageLoeschen", aufruf: () => kontoUnterlageLoeschen, body: { docId: GUELTIGE_DOC_ID } },
  ];

  for (const { name, aufruf, body } of endpunkte) {
    it(`${name} loescht alle Pakete unter konten/{uid}/pakete/ und antwortet 204`, async () => {
      const db = fakeFirestoreDokumente();
      getFirestoreMock.mockReturnValue(db);
      const storage = fakeStorageMitZustand();
      getStorageMock.mockReturnValue(storage);
      setzeAngaben(db, { ...VOLLSTAENDIGE_ANGABEN, staatsangehoerigkeit: "deutsch" });
      await storage.bucket().file("konten/u1/pakete/p1.zip").save(Buffer.from([1]));
      await storage.bucket().file("konten/u1/pakete/p2.zip").save(Buffer.from([2]));
      await storage.bucket().file("konten/u2/pakete/fremd.zip").save(Buffer.from([3]));

      const { res, aufrufe } = fakeRes();
      await aufruf()(fakeReq(body) as never, res as never);

      expect(aufrufe[0].status).toBe(204);
      expect([...storage.dateien.keys()].filter((k) => k.startsWith("konten/u1/pakete/"))).toEqual([]);
      expect(storage.dateien.has("konten/u2/pakete/fremd.zip")).toBe(true);
    });

    it(`${name} ist idempotent - ohne vorhandene Pakete ebenfalls 204`, async () => {
      getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
      getStorageMock.mockReturnValue(fakeStorageMitZustand());

      const { res, aufrufe } = fakeRes();
      await aufruf()(fakeReq(body) as never, res as never);
      const { res: res2, aufrufe: aufrufe2 } = fakeRes();
      await aufruf()(fakeReq(body) as never, res2 as never);

      expect(aufrufe[0].status).toBe(204);
      expect(aufrufe2[0].status).toBe(204);
    });

    it(`${name} antwortet 500, wenn ein Paket nicht geloescht werden kann - damit der Bewerber es erneut versucht`, async () => {
      getFirestoreMock.mockReturnValue(fakeFirestoreDokumente());
      const storage = fakeStorageMitZustand();
      await storage.bucket().file("konten/u1/pakete/p1.zip").save(Buffer.from([1]));
      const echterBucket = storage.bucket();
      getStorageMock.mockReturnValue({
        ...storage,
        bucket: () => ({
          ...echterBucket,
          getFiles: async ({ prefix }: { prefix: string }) => {
            const [dateien] = await echterBucket.getFiles({ prefix });
            return [
              dateien.map((datei) => ({
                ...datei,
                delete: async () => {
                  throw Object.assign(new Error("simulierter Storage-Fehler"), { name: "ApiError" });
                },
              })),
            ];
          },
        }),
      });

      const { res, aufrufe } = fakeRes();
      await aufruf()(fakeReq(body) as never, res as never);

      expect(aufrufe[0].status).toBe(500);
      expect(storage.dateien.has("konten/u1/pakete/p1.zip")).toBe(true);
    });
  }
});

// ─── Paketbau mit vollstaendigem Profil ─────────────────────────────────────

/** Alle Angaben, die der militaerische Bogen einsetzt - inklusive Staatsangehoerigkeit MIT Einwilligungsvermerk. */
function setzeKomplettesProfil(db: ReturnType<typeof fakeFirestoreDokumente>) {
  db._daten.set("konten/u1/privat/angaben", {
    schemaVersion: "konto-angaben-v1",
    angaben: {
      ...VOLLSTAENDIGE_ANGABEN,
      telefon: "0221 123456",
      email: "erika@example.com",
      geburtsort: "Köln",
      strasse: "Musterweg 1",
      plz: "50667",
      ort: "Köln",
      staatsangehoerigkeit: "deutsch",
      studienabschluss: "Bachelor",
      fuehrerschein: "B",
    },
    einwilligungStaatsangehoerigkeit: { erteiltAm: Timestamp.fromMillis(0), textVersion: "staatsangehoerigkeit-v1" },
    geaendertAm: Timestamp.fromMillis(0),
  });
}

/** Faengt die Bytes des gespeicherten Pakets ab (die Attrappe merkt sich sonst nur die Groesse). */
function mitPaketMitschnitt(storage: ReturnType<typeof fakeStorageMitZustand>) {
  const mitschnitt: { bytes?: Buffer } = {};
  const echterBucket = storage.bucket();
  getStorageMock.mockReturnValue({
    ...storage,
    bucket: () => ({
      ...echterBucket,
      file: (pfad: string, opts?: { generation?: number | string }) => {
        const datei = echterBucket.file(pfad, opts);
        if (!pfad.includes("/pakete/")) return datei;
        return {
          ...datei,
          save: async (buf: Buffer) => {
            mitschnitt.bytes = Buffer.from(buf);
            await datei.save(buf);
          },
        };
      },
    }),
  });
  return mitschnitt;
}

describe("kontoBewerbungspaketBauen - vollstaendiges Profil, inaktive Stelle, geaenderte Vorlage, ZIP-Namen, Merkzettel", () => {
  it("baut ein vollstaendiges Profil OHNE luekenAkzeptiert", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeKomplettesProfil(db);

    const { res: planRes, aufrufe: planAufrufe } = fakeRes();
    await kontoBewerbungsplan(fakeReq({}, "GET", { pinstGuid: "job1" }) as never, planRes as never);
    expect((planAufrufe[0].body as { formulare: { fehlendeAngaben: string[] }[] }).formulare[0].fehlendeAngaben).toEqual([]);

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [] }) as never, res as never);

    expect(aufrufe[0].status).toBe(200);
    expect(fillBewerbungsbogenMock).toHaveBeenCalledOnce();
  });

  it("lehnt eine nicht mehr ausgeschriebene Stelle ab (400), ohne etwas zu bauen", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    getStorageMock.mockReturnValue(storage);
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);
    loadJobRecordMock.mockResolvedValue(testJob({ active: false }));

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: [], unterlagen: [], anschreiben: "Text" }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(400);
    expect((aufrufe[0].body as { fehler: string }).fehler).toBe("Diese Stelle ist nicht mehr ausgeschrieben.");
    expect([...storage.dateien.keys()].some((k) => k.includes("/pakete/"))).toBe(false);
  });

  it("antwortet 400 mit dem Formulartitel, wenn sich die Vorlage geaendert hat", async () => {
    const { BewerbungsbogenTemplateChangedError } = await import("./fillBewerbungsbogen");
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(fakeStorageMitZustand());
    setzeKomplettesProfil(db);
    fillBewerbungsbogenMock.mockRejectedValue(new BewerbungsbogenTemplateChangedError());

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [] }) as never, res as never);

    expect(aufrufe[0].status).toBe(400);
    expect((aufrufe[0].body as { fehler: string }).fehler).toBe(
      "Den Vordruck „Bewerbungsbogen_Militärisch“ können wir gerade nicht ausfüllen. Fülle ihn bitte selbst aus und lade ihn als Unterlage hoch.",
    );
  });

  it("benennt mehrere ausgefuellte Boegen im ZIP nach ihrem Titel, nummeriert", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    const mitschnitt = mitPaketMitschnitt(storage);
    setzeKomplettesProfil(db);
    loadJobRecordMock.mockResolvedValue(
      testJob({
        dokumente: [
          { docId: "f1", attHeader: "Bewerbungsbogen_Militärisch" },
          { docId: "f2", attHeader: "Bewerbungsbogen Seiteneinstieg und ROB" },
        ],
      }),
    );
    loadJobDocumentsMock.mockResolvedValue([
      testJobDokumente()[0],
      { ...testJobDokumente()[0], docId: "f2", attHeader: "Bewerbungsbogen Seiteneinstieg und ROB", storagePath: "jobDocuments/f2.pdf" },
    ]);

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: ["f1", "f2"], unterlagen: [], luekenAkzeptiert: true }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
    const zip = await JSZip.loadAsync(mitschnitt.bytes as Buffer);
    const namen = Object.keys(zip.files).filter((n) => n.endsWith(".pdf")).sort();
    expect(namen).toHaveLength(2);
    expect(new Set(namen).size).toBe(2);
    expect(namen[0]).toMatch(/^01_.*Militärisch\.pdf$/);
    expect(namen[1]).toMatch(/^02_.*Seiteneinstieg_und_ROB\.pdf$/);
    expect(namen.join(" ")).not.toContain("REF-1");
  });

  /**
   * WOZU: Der Merkzettel des Kontopakets teilt seine Abschnitte mit dem der
   * transienten Mappe (s. mappe/merkzettel.ts). Er muss nennen: was im Bogen
   * von Hand zu ergaenzen ist (Laufbahn, Geschlecht, Staat), weitere Anhaenge
   * wie "Anlage 1 zum Bewerbungsbogen" und "jederzeit", wenn der Text das
   * statt eines Datums sagt.
   */
  it("schreibt VON HAND ERGÄNZEN, die uebrigen Anhaenge und 'jederzeit' in den Merkzettel", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    const mitschnitt = mitPaketMitschnitt(storage);
    setzeKomplettesProfil(db);
    loadJobRecordMock.mockResolvedValue(
      testJob({
        applicationEnd: "",
        laufbahngruppe: "0008",
        companyDesc: "<p>Bewerbung und Einstellung jederzeit möglich</p>",
        dokumente: [
          { docId: "f1", attHeader: "Bewerbungsbogen_Militärisch" },
          { docId: "anlage", attHeader: "Anlage 1 zum Bewerbungsbogen" },
        ],
      }),
    );

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: ["f1"], unterlagen: [], luekenAkzeptiert: true }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
    const zip = await JSZip.loadAsync(mitschnitt.bytes as Buffer);
    const zettel = (await zip.file("WAS-NOCH-ZU-TUN.txt")?.async("string")) ?? "";
    const fliesstext = zettel.split(/\s+/).join(" ");
    expect(zettel).toContain("Bewerbungsschluss: keiner, Bewerbung jederzeit möglich");
    expect(zettel).toContain("VON HAND ERGÄNZEN");
    expect(fliesstext).toContain("laut Ausschreibung: Feldwebel");
    expect(zettel).toContain("  - Anlage 1 zum Bewerbungsbogen");
    // Feldnamen, nie Feldwerte aus dem Profil.
    expect(zettel).not.toMatch(/Mustermann|Musterweg|0221|deutsch/);
  });
});

/**
 * KI-Entwuerfe tragen oft Platzhalter wie "[Adresse]" oder "[Telefon]" im
 * Briefkopf, die sonst unveraendert ins Anschreiben-PDF gingen. Die
 * Paketseite setzt sie im Browser ein; was dann noch uebrig ist, nennt der
 * Merkzettel - als Sicherheitsnetz, nur die Namen, nie Text oder Werte.
 */
describe("kontoBewerbungspaketBauen - offene Platzhalter", () => {
  it("nennt verbliebene Platzhalter aus Anschreiben und Lebenslauf im Merkzettel", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    const mitschnitt = mitPaketMitschnitt(storage);
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);

    const { res, aufrufe } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({
        pinstGuid: "job1",
        formulare: [],
        unterlagen: [],
        anschreiben: "Erika Mustermann\n[Telefon]\nKöln, [Datum]\nGeheimer Satz im Anschreiben",
        lebenslauf: "Lebenslauf\n[E-Mail]",
      }) as never,
      res as never,
    );

    expect(aufrufe[0].status).toBe(200);
    const zip = await JSZip.loadAsync(mitschnitt.bytes as Buffer);
    const zettel = (await zip.file("WAS-NOCH-ZU-TUN.txt")?.async("string")) ?? "";
    const fliesstext = zettel.replace(/\s+/g, " ");
    expect(fliesstext).toContain(
      "Im Anschreiben stehen noch Platzhalter: [Telefon], [Datum]. Ersetze sie vor dem Einreichen.",
    );
    expect(fliesstext).toContain("Im Lebenslauf stehen noch Platzhalter: [E-Mail]. Ersetze sie vor dem Einreichen.");
    expect(zettel).not.toMatch(/Mustermann|Geheimer Satz/);
  });

  it("schreibt keinen Platzhalter-Abschnitt, wenn die Texte keine Platzhalter enthalten", async () => {
    const db = fakeFirestoreDokumente();
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeStorageMitZustand();
    const mitschnitt = mitPaketMitschnitt(storage);
    setzeAngaben(db, VOLLSTAENDIGE_ANGABEN);

    const { res } = fakeRes();
    await kontoBewerbungspaketBauen(
      fakeReq({ pinstGuid: "job1", formulare: [], unterlagen: [], anschreiben: "Siehe Fußnote [1]." }) as never,
      res as never,
    );

    const zip = await JSZip.loadAsync(mitschnitt.bytes as Buffer);
    const zettel = (await zip.file("WAS-NOCH-ZU-TUN.txt")?.async("string")) ?? "";
    expect(zettel).not.toMatch(/PLATZHALTER/);
  });
});
