import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MappeRecord, MappenDokument } from "./mappe/mappeTypen";
import { MAX_DATEI_BYTES, pruefeUpload } from "./mappe/uploadRegeln";
import { KEINE_AUSWEISKOPIE } from "./mappe/ausweiskopie";

const getFirestoreMock = vi.fn();
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: (...a: unknown[]) => getFirestoreMock(...a),
}));

const getStorageMock = vi.fn();
vi.mock("firebase-admin/storage", () => ({
  getStorage: (...a: unknown[]) => getStorageMock(...a),
}));

const {
  pruefeDownloadToken,
  pruefeRegistrierung,
  registriereAtomar,
  loeseDownloadEin,
  bestandImBucket,
  mappeUploadUrl,
  mappeRegisterDocument,
  mappeDeleteDocument,
  mappeDownload,
  drosselungGreift,
  MAPPE_HTTP_QUOTA,
  MAPPE_DOWNLOAD_QUOTA,
} = await import("./mappeHttp");

const LEER_BESTAND = { anzahl: 0, summeBytes: 0 };

/** Kennungen im echten Format - die Endpunkte weisen alles andere vor jedem Zugriff ab. */
const M1 = "m" + "0".repeat(24) + "1";
const D1 = "t" + "0".repeat(24) + "1";

const JETZT = 1_800_000_000_000;
const basis = { zipGebautAm: JETZT - 1000, letzteAktivitaetAm: JETZT - 1000, heruntergeladenAm: null, einmalToken: "t1" };

/**
 * WOZU: "1x Download" ist eine Zusage an den Nutzer. Eine signierte URL kann das
 * nicht - deshalb pruefen wir selbst, und deshalb ist die Pruefung rein und
 * testbar statt in einem Request-Handler versteckt.
 */
describe("pruefeDownloadToken", () => {
  it("laesst den ersten Abruf durch", () => {
    expect(pruefeDownloadToken(basis, "t1", JETZT)).toEqual({ ok: true });
  });

  it("verweigert den zweiten Abruf", () => {
    const ergebnis = pruefeDownloadToken({ ...basis, heruntergeladenAm: JETZT - 10, einmalToken: null }, "t1", JETZT);
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).toMatch(/einmal/i);
  });

  it("verweigert einen falschen Token", () => {
    expect(pruefeDownloadToken(basis, "t2", JETZT).ok).toBe(false);
  });

  it("verweigert nach Ablauf der Stundenfrist", () => {
    expect(pruefeDownloadToken({ ...basis, zipGebautAm: JETZT - 3_700_000 }, "t1", JETZT).ok).toBe(false);
  });
});

function dokument(teil: Partial<MappenDokument> = {}): MappenDokument {
  return {
    docId: D1,
    art: "zeugnis",
    dateiname: "zeugnis.pdf",
    storagePath: `bewerbungsmappen/${M1}/${D1}`,
    contentType: "application/pdf",
    sizeBytes: 1000,
    herkunft: "upload",
    hinzugefuegtAm: JETZT,
    ...teil,
  };
}

const leereMappe = { dokumente: [] as MappenDokument[], zipGebautAm: null, letzteAktivitaetAm: JETZT - 1000 };

/**
 * WOZU: der Client behauptet Groesse und
 * Typ - diese Funktion bekommt nur das, was der Aufrufer ihr uebergibt, und
 * der Aufrufer (mappeRegisterDocument) muss die ECHTEN Storage-Metadaten
 * uebergeben, nie die Behauptung des Browsers. `bestand` kommt
 * vom Aufrufer und soll aus dem BUCKET stammen, nicht aus dem
 * Firestore-Verzeichnis - sonst bleibt eine hochgeladene, nie registrierte
 * Datei unsichtbar. Rein gehalten, damit all das ohne Storage-Mock testbar ist.
 */
describe("pruefeRegistrierung", () => {
  it("laesst eine Datei innerhalb der Grenzen durch", () => {
    const ergebnis = pruefeRegistrierung(leereMappe, dokument({ sizeBytes: 1000 }), JETZT, LEER_BESTAND);
    expect(ergebnis.ok).toBe(true);
  });

  it("lehnt ab, wenn die uebergebene (= echte) Groesse das Dateilimit sprengt", () => {
    const ergebnis = pruefeRegistrierung(leereMappe, dokument({ sizeBytes: MAX_DATEI_BYTES + 1 }), JETZT, LEER_BESTAND);
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt ab, wenn der BUCKET-Bestand die Grenze sprengt, obwohl das Firestore-Verzeichnis leer ist", () => {
    // Der Angriff: Dateien hochgeladen, nie registriert -
    // das Verzeichnis (leereMappe.dokumente) ist leer, der Bucket nicht.
    const vollerBucket = { anzahl: 10, summeBytes: 100 };
    const ergebnis = pruefeRegistrierung(leereMappe, dokument(), JETZT, vollerBucket);
    expect(ergebnis.ok).toBe(false);
  });

  it("lehnt ab, wenn die Mappe abgelaufen ist", () => {
    const abgelaufen = { ...leereMappe, zipGebautAm: JETZT - 3_700_000 };
    expect(pruefeRegistrierung(abgelaufen, dokument(), JETZT, LEER_BESTAND).ok).toBe(false);
  });

  it("ersetzt einen vorhandenen Eintrag mit derselben docId, statt die Mappe wachsen zu lassen", () => {
    const vorhanden = dokument({ dateiname: "alt.pdf", sizeBytes: 100 });
    const mappeMitEintrag = { ...leereMappe, dokumente: [vorhanden] };
    const neu = dokument({ dateiname: "neu.pdf", sizeBytes: 200 });

    const ergebnis = pruefeRegistrierung(mappeMitEintrag, neu, JETZT, LEER_BESTAND);

    expect(ergebnis.ok).toBe(true);
    if (ergebnis.ok) {
      expect(ergebnis.dokumente).toHaveLength(1);
      expect(ergebnis.dokumente[0].dateiname).toBe("neu.pdf");
    }
  });
});

/**
 * WOZU: der Bucket ist die einzige Quelle, die nicht luegen kann
 * - ein Angreifer, der `mappeUploadUrl` beliebig oft ruft und
 * `mappeRegisterDocument` nie, bleibt fuer das Firestore-Verzeichnis
 * unsichtbar. Der Storage-Zugriff wird gemockt wie in den uebrigen Tests.
 */
function fakeStorageMitDateien(dateien: { name: string; size: number }[]) {
  return {
    bucket: () => ({
      getFiles: async ({ prefix }: { prefix: string }) => {
        const passende = dateien
          .filter((datei) => datei.name.startsWith(prefix))
          .map((datei) => ({ name: datei.name, metadata: { size: String(datei.size) } }));
        return [passende];
      },
    }),
  };
}

describe("bestandImBucket", () => {
  it("zaehlt Objekte im Bucket, auch wenn das Firestore-Verzeichnis leer ist - ein leeres Verzeichnis umgeht die Mengengrenze nicht", async () => {
    const zehnDateien = Array.from({ length: 10 }, (_, i) => ({ name: `bewerbungsmappen/${M1}/d${i}`, size: 1000 }));
    getStorageMock.mockReturnValue(fakeStorageMitDateien(zehnDateien));

    const bestand = await bestandImBucket(M1);

    expect(bestand.anzahl).toBe(10);
    // Eine weitere Datei waere die elfte - ueber MAX_DATEIEN (10).
    expect(pruefeUpload({ contentType: "application/pdf", sizeBytes: 1000 }, bestand).ok).toBe(false);
  });

  it("zaehlt paket.zip nicht mit", async () => {
    getStorageMock.mockReturnValue(
      fakeStorageMitDateien([
        { name: `bewerbungsmappen/${M1}/d0`, size: 1000 },
        { name: `bewerbungsmappen/${M1}/paket.zip`, size: 5_000_000 },
      ]),
    );

    const bestand = await bestandImBucket(M1);

    expect(bestand.anzahl).toBe(1);
    expect(bestand.summeBytes).toBe(1000);
  });

  it("nimmt eine angegebene Datei (die gerade betrachtete) aus der Zaehlung heraus", async () => {
    getStorageMock.mockReturnValue(
      fakeStorageMitDateien([
        { name: `bewerbungsmappen/${M1}/d0`, size: 1000 },
        { name: `bewerbungsmappen/${M1}/${D1}`, size: 2000 },
      ]),
    );

    const bestand = await bestandImBucket(M1, `bewerbungsmappen/${M1}/${D1}`);

    expect(bestand.anzahl).toBe(1);
    expect(bestand.summeBytes).toBe(1000);
  });
});

/**
 * Simuliert eine Firestore-Transaktion: `runTransaction` liest und schreibt
 * synchron gegen denselben veraenderlichen Stand. Zwei NACHEINANDER
 * ausgefuehrte Aufrufe bilden genau das ab, was Firestore fuer zwei
 * KONKURRIERENDE Transaktionen serialisiert garantiert - die zweite sieht
 * bereits, was die erste geschrieben hat.
 */
function fakeFirestore(anfangsstand: MappeRecord) {
  let stand: MappeRecord = { ...anfangsstand, dokumente: [...anfangsstand.dokumente] };
  // Der docRef traegt eigene get()/update()-Methoden (fuer ladeMappe & Co.,
  // die ausserhalb einer Transaktion lesen/schreiben) - beide arbeiten auf
  // demselben `stand` wie die Transaktion, damit ein Test beide Zugriffsarten
  // im selben Lauf mischen kann.
  const docRef = {
    get: async () => ({ exists: true, data: () => stand }),
    update: async (patch: Record<string, unknown>) => {
      stand = { ...stand, ...patch } as MappeRecord;
    },
  };
  return {
    stand: () => stand,
    collection: () => ({ doc: () => docRef }),
    runTransaction: async <T>(
      fn: (tx: { get: (ref: unknown) => Promise<{ exists: boolean; data: () => MappeRecord }>; update: (ref: unknown, patch: Record<string, unknown>) => void }) => Promise<T>,
    ): Promise<T> => {
      const tx = {
        get: async () => ({ exists: true, data: () => stand }),
        update: (_ref: unknown, patch: Record<string, unknown>) => {
          stand = { ...stand, ...patch } as MappeRecord;
        },
      };
      return fn(tx);
    },
  };
}

function mappeRecord(teil: Partial<MappeRecord> = {}): MappeRecord {
  return {
    pinstGuid: "abc",
    refCode: "REF-1",
    titel: "Teststelle",
    erstelltAm: JETZT - 5000,
    letzteAktivitaetAm: JETZT - 1000,
    verfaelltAm: JETZT - 1000 + 3_600_000,
    zipGebautAm: JETZT - 1000,
    heruntergeladenAm: null,
    einmalToken: "t1",
    dokumente: [],
    formularstand: {},
    ...teil,
  };
}

beforeEach(() => {
  getFirestoreMock.mockReset();
  getStorageMock.mockReset();
});

/**
 * WOZU: "1x Download" ist nur eine Zusage, wenn Pruefung
 * und Vermerk atomar in derselben Transaktion laufen. Getrennt wuerden zwei
 * gleichzeitige Anfragen beide durch die Pruefung kommen, bevor eine den
 * Vermerk schreibt.
 */
describe("loeseDownloadEin", () => {
  it("laesst die erste Einloesung durch und schreibt den Vermerk", async () => {
    const db = fakeFirestore(mappeRecord());
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await loeseDownloadEin(M1, "t1", JETZT);

    expect(ergebnis.ok).toBe(true);
    expect(db.stand().heruntergeladenAm).toBe(JETZT);
    expect(db.stand().einmalToken).toBeNull();
  });

  /**
   * WOZU: ein Abruf ist keine Aktivitaet, die die
   * Aufbewahrung verlaengert - sonst haelt "eine Stunde" nicht, wenn kurz vor
   * Ablauf noch heruntergeladen wird.
   */
  it("verlaengert die Frist NICHT - letzteAktivitaetAm und verfaelltAm bleiben unveraendert", async () => {
    const ursprung = mappeRecord({ letzteAktivitaetAm: JETZT - 500_000, verfaelltAm: JETZT + 100_000 });
    const db = fakeFirestore(ursprung);
    getFirestoreMock.mockReturnValue(db);

    await loeseDownloadEin(M1, "t1", JETZT);

    expect(db.stand().letzteAktivitaetAm).toBe(ursprung.letzteAktivitaetAm);
    expect(db.stand().verfaelltAm).toBe(ursprung.verfaelltAm);
  });

  it("verweigert eine zweite Einloesung desselben Tokens, weil die erste den Vermerk schon geschrieben hat", async () => {
    const db = fakeFirestore(mappeRecord());
    getFirestoreMock.mockReturnValue(db);

    const erste = await loeseDownloadEin(M1, "t1", JETZT);
    const zweite = await loeseDownloadEin(M1, "t1", JETZT);

    expect(erste.ok).toBe(true);
    expect(zweite.ok).toBe(false);
    if (!zweite.ok) expect(zweite.grund).toMatch(/einmal/i);
  });
});

/**
 * WOZU: Lesen, Grenzen pruefen und Schreiben muessen in
 * einer Transaktion liegen, sonst laesst sich dieselbe docId zweimal parallel
 * registrieren oder die 30-MB-Grenze durch zwei gleichzeitige Anfragen
 * umgehen, die beide denselben (noch alten) Bestand sehen.
 */
describe("registriereAtomar", () => {
  it("registriert eine neue Datei", async () => {
    const db = fakeFirestore(mappeRecord({ zipGebautAm: null, dokumente: [] }));
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await registriereAtomar(M1, dokument(), JETZT, LEER_BESTAND);

    expect(ergebnis.ok).toBe(true);
    expect(db.stand().dokumente).toHaveLength(1);
  });

  it("laesst eine zweite Registrierung derselben docId die Mappe nicht wachsen", async () => {
    const db = fakeFirestore(mappeRecord({ zipGebautAm: null, dokumente: [] }));
    getFirestoreMock.mockReturnValue(db);

    await registriereAtomar(M1, dokument({ sizeBytes: 100 }), JETZT, LEER_BESTAND);
    const zweitesErgebnis = await registriereAtomar(M1, dokument({ sizeBytes: 999 }), JETZT, LEER_BESTAND);

    expect(zweitesErgebnis.ok).toBe(true);
    expect(db.stand().dokumente).toHaveLength(1);
    expect(db.stand().dokumente[0].sizeBytes).toBe(999);
  });

  it("lehnt ab, wenn die Mappe abgelaufen ist", async () => {
    const db = fakeFirestore(mappeRecord({ zipGebautAm: JETZT - 3_700_000, dokumente: [] }));
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await registriereAtomar(M1, dokument(), JETZT, LEER_BESTAND);

    expect(ergebnis.ok).toBe(false);
    expect(db.stand().dokumente).toHaveLength(0);
  });

  it("lehnt ab, wenn der uebergebene BUCKET-Bestand die Grenze sprengt, obwohl das Verzeichnis leer ist", async () => {
    const db = fakeFirestore(mappeRecord({ zipGebautAm: null, dokumente: [] }));
    getFirestoreMock.mockReturnValue(db);

    const ergebnis = await registriereAtomar(M1, dokument(), JETZT, { anzahl: 10, summeBytes: 100 });

    expect(ergebnis.ok).toBe(false);
    expect(db.stand().dokumente).toHaveLength(0);
  });
});

/**
 * Ein Fake-Bucket MIT Zustand (anders als `fakeStorageMitDateien` oben, das
 * nur eine feste Momentaufnahme liefert): `save` legt Objekte tatsaechlich ab,
 * `getFiles` sieht sie sofort. Noetig, um `mappeUploadUrl` und
 * `mappeRegisterDocument` end-to-end aufzurufen und den Effekt auf den
 * Bucket-Bestand ueber mehrere Aufrufe hinweg zu beobachten.
 */
/** Eine Datei, deren erste Bytes ein PDF ausweisen - `mappeRegisterDocument` prueft den Inhalt. */
function pdf(groesse: number): Buffer {
  const inhalt = Buffer.alloc(groesse);
  inhalt.write("%PDF-1.7");
  return inhalt;
}

function fakeBucketMitZustand() {
  const dateien = new Map<string, { size: number; inhalt: Buffer }>();
  const file = (pfad: string) => ({
    save: async (buf: Buffer) => {
      dateien.set(pfad, { size: buf.length, inhalt: buf });
    },
    getSignedUrl: async () => [`https://signed.example/${pfad}`],
    exists: async () => [dateien.has(pfad)],
    getMetadata: async () => [{ size: String(dateien.get(pfad)?.size ?? 0) }],
    download: async () => [dateien.get(pfad)?.inhalt ?? Buffer.alloc(0)],
    delete: async () => {
      dateien.delete(pfad);
    },
  });
  return {
    dateien,
    bucket: () => ({
      file,
      getFiles: async ({ prefix }: { prefix: string }) => {
        const passende = [...dateien.entries()]
          .filter(([name]) => name.startsWith(prefix))
          .map(([name, meta]) => ({ name, metadata: { size: String(meta.size) } }));
        return [passende];
      },
    }),
  };
}

/**
 * Minimales Express-Request-Double. Die Handler sind mit `cors`
 * konfiguriert - die cors-Middleware liest `req.headers` und `req.method`,
 * bevor sie an den eigentlichen Handler weiterreicht.
 */
function fakeReq(body: unknown, ip?: string) {
  return {
    body,
    headers: ip ? { "x-forwarded-for": ip } : {},
    method: "POST",
    socket: {},
    query: {},
  };
}

/** Minimales Express-Response-Double: unterstuetzt Verkettung UND direkte Aufrufe. */
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
    /** Express' `res.set` - die Drosselung setzt darueber `Retry-After`. */
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
    // Die cors-Middleware (Handler ist mit `cors` konfiguriert) haengt
    // sich an "finish", um bei einem echten http.ServerResponse fruehzeitig
    // aufzuloesen. Unser Fake ist kein EventEmitter - ein No-Op reicht, der
    // eigentliche Handler loest ueber den regulaeren Rueckgabewert auf.
    on() {
      return res;
    },
  };
  return { res, aufrufe };
}

/**
 * WOZU: `mappeUploadUrl` prueft den Bestand beim Ausstellen, aber
 * ohne Reservierung saehen zehn nacheinander geholte URLs denselben Bucket -
 * jede bekaeme eine gueltige URL, und danach waeren alle zehn einloesbar. Die
 * Funktion legt beim Ausstellen ein leeres Platzhalter-Objekt an, das SOFORT
 * mitzaehlt. End-to-end getestet (echter Handler-Aufruf, echter
 * Fake-Bucket-Zustand), weil genau das Zusammenspiel ueber zwei Aufrufe
 * hinweg der Kern ist - eine reine Funktion allein wuerde das nicht
 * zeigen.
 */
describe("mappeUploadUrl - Platzhalter-Reservierung", () => {
  it("erhoeht den Bucket-Bestand bei zwei aufeinanderfolgenden Aufrufen um zwei, ohne dass etwas hochgeladen wurde", async () => {
    const db = fakeFirestore(mappeRecord({ zipGebautAm: null, dokumente: [] }));
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeBucketMitZustand();
    getStorageMock.mockReturnValue(storage);

    const eingabe = { mappenId: M1, dateiname: "a.pdf", contentType: "application/pdf", sizeBytes: 1000 };

    const { res: res1 } = fakeRes();
    // @ts-expect-error - Fake-Request/Response statt echtem Express-Objekt.
    await mappeUploadUrl(fakeReq(eingabe), res1);
    const bestandNachEins = await bestandImBucket(M1);
    expect(bestandNachEins.anzahl).toBe(1);

    const { res: res2 } = fakeRes();
    // @ts-expect-error - Fake-Request/Response statt echtem Express-Objekt.
    await mappeUploadUrl(fakeReq({ ...eingabe, dateiname: "b.pdf" }), res2);
    const bestandNachZwei = await bestandImBucket(M1);
    expect(bestandNachZwei.anzahl).toBe(2);

    // Beide Platzhalter sind 0 Byte - noch nichts hochgeladen.
    expect(bestandNachZwei.summeBytes).toBe(0);
  });
});

/** Wie `fakeFirestore`, aber die Mappe gibt es nicht (mehr) - `tx.get` meldet `exists: false`. */
function fakeFirestoreOhneMappe() {
  const docRef = {
    get: async () => ({ exists: false, data: () => undefined }),
    update: async () => {},
  };
  return {
    collection: () => ({ doc: () => docRef }),
    runTransaction: async <T>(
      fn: (tx: {
        get: (ref: unknown) => Promise<{ exists: boolean; data: () => undefined }>;
        update: (ref: unknown, patch: Record<string, unknown>) => void;
      }) => Promise<T>,
    ): Promise<T> => fn({ get: async () => ({ exists: false, data: () => undefined }), update: () => {} }),
  };
}

/**
 * WOZU: Die signierte Upload-URL gilt 15 Minuten und ueberlebt damit den Ablauf
 * der Mappe. Laeuft die Mappe zwischen Upload und Registrierung ab und wird
 * aufgeraeumt, liegt eine echte Bewerbungsdatei unter einem Praefix ohne
 * Firestore-Dokument. `raeumeMappenAuf` iteriert ueber Firestore-Treffer und
 * sieht sie nie wieder. Darum loescht auch dieser Fehlerweg, nicht nur der
 * geordnete Fehlschlag.
 */
describe("mappeRegisterDocument - verwaiste Datei", () => {
  it("loescht die hochgeladene Datei auch, wenn die Mappe zwischen Upload und Registrierung verschwunden ist", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreOhneMappe());
    const storage = fakeBucketMitZustand();
    const pfad = `bewerbungsmappen/${M1}/${D1}`;
    await storage.bucket().file(pfad).save(pdf(1234));
    getStorageMock.mockReturnValue(storage);

    const eingabe = { mappenId: M1, docId: D1, art: "zeugnis", dateiname: "Zeugnis.jpg", contentType: "image/jpeg" };
    const { res, aufrufe } = fakeRes();
    // @ts-expect-error - Fake-Request/Response statt echtem Express-Objekt.
    await mappeRegisterDocument(fakeReq(eingabe), res);

    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].status).toBe(404);
    expect(storage.dateien.has(pfad)).toBe(false);
  });
});

/**
 * WOZU: Wir nehmen keine Ausweiskopien entgegen. Kommt trotzdem
 * `art: "ausweiskopie"`, soll der Bewerber einen
 * verstaendlichen Satz lesen, und die schon hochgeladene Datei darf nicht
 * liegen bleiben.
 */
describe("mappeRegisterDocument - keine Ausweiskopie", () => {
  it("lehnt eine Ausweiskopie mit einer klaren Meldung ab und loescht die hochgeladene Datei", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestore(mappeRecord()));
    const storage = fakeBucketMitZustand();
    const pfad = `bewerbungsmappen/${M1}/${D1}`;
    await storage.bucket().file(pfad).save(pdf(1234));
    getStorageMock.mockReturnValue(storage);

    const eingabe = { mappenId: M1, docId: D1, art: "ausweiskopie", dateiname: "Perso.jpg", contentType: "image/jpeg" };
    const { res, aufrufe } = fakeRes();
    // @ts-expect-error - Fake-Request/Response statt echtem Express-Objekt.
    await mappeRegisterDocument(fakeReq(eingabe), res);

    expect(aufrufe).toEqual([{ status: 400, body: { fehler: KEINE_AUSWEISKOPIE } }]);
    expect(storage.dateien.has(pfad)).toBe(false);
  });
});

/**
 * WOZU: Diese vier Endpunkte sind oeffentlich und unauthentifiziert, und ueber
 * sie laeuft der eigentliche Dateiverkehr der Mappe. `mappeUploadUrl` legt bei JEDEM Aufruf ein Objekt im Bucket
 * an, und die Mengengrenzen binden pro Mappe, nicht pro Aufrufer.
 */
describe("Pro-IP-Drosselung der Mappe-Endpunkte", () => {
  /** Verbraucht das Kontingent einer IP restlos, damit der naechste Aufruf abgewiesen wird. */
  function erschoepfe(ip: string, quota: { capacity: number }, art: string): void {
    for (let i = 0; i < quota.capacity; i++) {
      const { res } = fakeRes();
      const erlaubt = drosselungGreift(
        { headers: { "x-forwarded-for": ip }, socket: {} } as never,
        res as never,
        quota as never,
        art,
        true,
      );
      expect(erlaubt).toBe(false);
    }
  }

  it("weist nach der Kapazitaet mit 429 und Retry-After ab", () => {
    const ip = "203.0.113.10";
    erschoepfe(ip, MAPPE_HTTP_QUOTA, "mappeHttp");

    const { res, aufrufe } = fakeRes();
    const gedrosselt = drosselungGreift(
      { headers: { "x-forwarded-for": ip }, socket: {} } as never,
      res as never,
      MAPPE_HTTP_QUOTA as never,
      "mappeHttp",
      true,
    );

    expect(gedrosselt).toBe(true);
    expect(aufrufe[0].status).toBe(429);
    expect(Number(res.kopfzeilen["Retry-After"])).toBeGreaterThan(0);
  });

  /**
   * WOZU: `X-Forwarded-For`
   * wird von Proxys ANGEHAENGT, der Client kann den Header vorbelegen. Wer den
   * linkesten Wert nimmt, drosselt eine Fantasie-IP - ein Angreifer schickt pro
   * Anfrage eine andere und ist frei. Nur der rechteste Wert stammt von der
   * vorgelagerten Google-Infrastruktur.
   */
  it("laesst sich nicht durch wechselnde Fake-IPs links im Header umgehen", () => {
    const echt = "203.0.113.11";
    for (let i = 0; i < MAPPE_HTTP_QUOTA.capacity; i++) {
      const { res } = fakeRes();
      // Jede Anfrage behauptet links eine ANDERE IP - gezaehlt wird trotzdem `echt`.
      drosselungGreift(
        { headers: { "x-forwarded-for": `10.0.0.${i}, ${echt}` }, socket: {} } as never,
        res as never,
        MAPPE_HTTP_QUOTA as never,
        "mappeHttp",
        true,
      );
    }

    const { res, aufrufe } = fakeRes();
    const gedrosselt = drosselungGreift(
      { headers: { "x-forwarded-for": `10.0.0.99, ${echt}` }, socket: {} } as never,
      res as never,
      MAPPE_HTTP_QUOTA as never,
      "mappeHttp",
      true,
    );

    expect(gedrosselt).toBe(true);
    expect(aufrufe[0].status).toBe(429);
  });

  it("haelt die Kontingente je IP getrennt - ein Angreifer sperrt keinen Bewerber aus", () => {
    erschoepfe("203.0.113.12", MAPPE_HTTP_QUOTA, "mappeHttp");
    const { res } = fakeRes();
    expect(
      drosselungGreift(
        { headers: { "x-forwarded-for": "203.0.113.13" }, socket: {} } as never,
        res as never,
        MAPPE_HTTP_QUOTA as never,
        "mappeHttp",
        true,
      ),
    ).toBe(false);
  });

  /**
   * WOZU getrennte Kontingente: der Download ist der einzige Endpunkt, an dem
   * geraten werden kann (mappenId + Einmal-Token) und darum strenger. Ein
   * ausgeschoepfter Upload-Zaehler darf den Abruf des fertigen Pakets nicht
   * mitreissen.
   */
  it("zaehlt Upload-Wege und Download getrennt", () => {
    const ip = "203.0.113.14";
    erschoepfe(ip, MAPPE_HTTP_QUOTA, "mappeHttp");
    const { res } = fakeRes();
    expect(
      drosselungGreift(
        { headers: { "x-forwarded-for": ip }, socket: {} } as never,
        res as never,
        MAPPE_DOWNLOAD_QUOTA as never,
        "mappeDownload",
        false,
      ),
    ).toBe(false);
  });

  /**
   * Der Bewerber-Normalfall, der durchgehen MUSS: fuenf Dateien in schneller
   * Folge sind zehn Aufrufe (URL holen + verzeichnen je Datei), dazu zwei
   * Korrekturen. Es geht um Missbrauch, nicht um Sparsamkeit.
   */
  it("laesst fuenf Uploads samt Korrekturen in schneller Folge durch", () => {
    const ip = "203.0.113.15";
    for (let i = 0; i < 14; i++) {
      const { res } = fakeRes();
      expect(
        drosselungGreift(
          { headers: { "x-forwarded-for": ip }, socket: {} } as never,
          res as never,
          MAPPE_HTTP_QUOTA as never,
          "mappeHttp",
          true,
        ),
      ).toBe(false);
    }
  });

  /**
   * Die Verdrahtung, einmal je Endpunkt: die Drosselung muss VOR der
   * Schemapruefung und vor jedem Storage-/Firestore-Zugriff greifen - sonst
   * kaeme ein Angreifer mit absichtlich kaputten Bodies unbegrenzt oft durch,
   * und `mappeUploadUrl` haette schon ein Objekt angelegt.
   */
  it("greift in allen vier Endpunkten, ohne Firestore oder Storage anzufassen", async () => {
    const ip = "203.0.113.16";
    erschoepfe(ip, MAPPE_HTTP_QUOTA, "mappeHttp");
    erschoepfe(ip, MAPPE_DOWNLOAD_QUOTA, "mappeDownload");
    // Absichtlich KEINE Attrappen gesetzt: ein Zugriff auf Firestore oder
    // Storage wuerde hier scheitern und den Test rot machen.
    getFirestoreMock.mockImplementation(() => {
      throw new Error("Firestore darf bei einer gedrosselten Anfrage nicht angefasst werden");
    });
    getStorageMock.mockImplementation(() => {
      throw new Error("Storage darf bei einer gedrosselten Anfrage nicht angefasst werden");
    });

    const handler: [string, (req: never, res: never) => unknown][] = [
      ["mappeUploadUrl", mappeUploadUrl],
      ["mappeRegisterDocument", mappeRegisterDocument],
      ["mappeDeleteDocument", mappeDeleteDocument],
      ["mappeDownload", mappeDownload],
    ];

    for (const [name, aufruf] of handler) {
      const { res, aufrufe } = fakeRes();
      await aufruf(fakeReq({}, ip) as never, res as never);
      expect(aufrufe, name).toHaveLength(1);
      expect(aufrufe[0].status, name).toBe(429);
    }
  });
});

/**
 * WOZU: Der Fehlertext von `MappeNichtGefundenError` ist eine Anweisung an ein
 * fremdes KI-Tool ("rufe eroeffne_bewerbungsmappe erneut auf"). Auf der
 * Upload-Seite liest ihn ein Mensch - dort waere der Werkzeugname Kauderwelsch.
 */
describe("404 der Mappe-Endpunkte", () => {
  it("antwortet dem Browser ohne Werkzeugnamen", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreOhneMappe());
    const { res, aufrufe } = fakeRes();

    // @ts-expect-error - Fake-Request/Response statt echtem Express-Objekt.
    await mappeDeleteDocument(fakeReq({ mappenId: M1, docId: D1 }, "203.0.113.20"), res);

    expect(aufrufe[0].status).toBe(404);
    const meldung = (aufrufe[0].body as { fehler: string }).fehler;
    expect(meldung).not.toMatch(/eroeffne_bewerbungsmappe/);
    expect(meldung).toMatch(/KI-Tool/);
  });
});

/**
 * WOZU: der Platzhalter zaehlt mit 0 Byte in die
 * Groessen-Summe. Wird er NIE durch den echten Upload ueberschrieben, darf
 * `mappeRegisterDocument` ihn trotzdem nicht als Datei verzeichnen - eine
 * leere Datei im Paket waere schlimmer als gar keine.
 */
describe("mappeRegisterDocument - lehnt einen nie ueberschriebenen Platzhalter ab", () => {
  it("registriert keine 0-Byte-Datei", async () => {
    const db = fakeFirestore(mappeRecord({ zipGebautAm: null, dokumente: [] }));
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeBucketMitZustand();
    await storage.bucket().file(`bewerbungsmappen/${M1}/${D1}`).save(Buffer.alloc(0));
    getStorageMock.mockReturnValue(storage);

    const eingabe = { mappenId: M1, docId: D1, art: "zeugnis", dateiname: "zeugnis.pdf", contentType: "application/pdf" };
    const { res, aufrufe } = fakeRes();
    // @ts-expect-error - Fake-Request/Response statt echtem Express-Objekt.
    await mappeRegisterDocument(fakeReq(eingabe), res);

    expect(db.stand().dokumente).toHaveLength(0);
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].status).toBe(400);
  });
});

describe("mappeRegisterDocument - keine Ausweiskopie, aber kein fremdes Loeschen", () => {
  /**
   * Wer mappenId und die docId einer schon REGISTRIERTEN Datei kennt, darf
   * sie ueber diesen Zweig nicht loeschen koennen - das Verzeichnis zeigte
   * sonst ins Leere. Geloescht wird nur, was nicht
   * verzeichnet ist.
   */
  it("loescht eine bereits verzeichnete Datei nicht", async () => {
    const verzeichnet: MappenDokument = {
      docId: D1,
      art: "zeugnis",
      dateiname: "z.pdf",
      storagePath: `bewerbungsmappen/${M1}/${D1}`,
      contentType: "application/pdf",
      sizeBytes: 1234,
      herkunft: "upload",
      hinzugefuegtAm: 1,
    };
    getFirestoreMock.mockReturnValue(fakeFirestore(mappeRecord({ dokumente: [verzeichnet] })));
    const storage = fakeBucketMitZustand();
    const pfad = `bewerbungsmappen/${M1}/${D1}`;
    await storage.bucket().file(pfad).save(pdf(1234));
    getStorageMock.mockReturnValue(storage);

    const eingabe = { mappenId: M1, docId: D1, art: "ausweiskopie", dateiname: "Perso.jpg", contentType: "image/jpeg" };
    const { res, aufrufe } = fakeRes();
    // @ts-expect-error - Fake-Request/Response statt echtem Express-Objekt.
    await mappeRegisterDocument(fakeReq(eingabe), res);

    expect(aufrufe).toEqual([{ status: 400, body: { fehler: KEINE_AUSWEISKOPIE } }]);
    expect(storage.dateien.has(pfad)).toBe(true);
  });

  it("loescht die Datei auch, wenn es die Mappe gar nicht mehr gibt", async () => {
    getFirestoreMock.mockReturnValue(fakeFirestoreOhneMappe());
    const storage = fakeBucketMitZustand();
    const pfad = `bewerbungsmappen/${M1}/${D1}`;
    await storage.bucket().file(pfad).save(pdf(1234));
    getStorageMock.mockReturnValue(storage);

    const eingabe = { mappenId: M1, docId: D1, art: "ausweiskopie", dateiname: "Perso.jpg", contentType: "image/jpeg" };
    const { res, aufrufe } = fakeRes();
    // @ts-expect-error - Fake-Request/Response statt echtem Express-Objekt.
    await mappeRegisterDocument(fakeReq(eingabe), res);

    expect(aufrufe[0].status).toBe(400);
    expect(storage.dateien.has(pfad)).toBe(false);
  });
});

/** Firestore und Storage, die bei jedem Zugriff laut scheitern. */
function verbieteZugriffe(): void {
  getFirestoreMock.mockImplementation(() => {
    throw new Error("Firestore darf hier nicht angefasst werden");
  });
  getStorageMock.mockImplementation(() => {
    throw new Error("Storage darf hier nicht angefasst werden");
  });
}

/**
 * WOZU: `mappenId` und `docId` werden zu Firestore- und Storage-Pfaden. Ohne
 * Formatpruefung liesse sich mit `docId: "paket.zip"` das fertige Paket als
 * Unterlage verzeichnen, mit "../" ein fremdes Praefix ansprechen.
 */
describe("Kennungen im falschen Format", () => {
  const ip = "203.0.113.40";

  it.each([
    ["docId paket.zip", { mappenId: M1, docId: "paket.zip" }],
    ["docId mit Pfad", { mappenId: M1, docId: "../m0000000000000000000000002/t0000000000000000000000001" }],
    ["mappenId mit Pfad", { mappenId: "../konten/x", docId: D1 }],
    ["mappenId zu kurz", { mappenId: "m1", docId: D1 }],
  ])("weist %s beim Verzeichnen ab, ohne Firestore oder Storage anzufassen", async (_name, ids) => {
    verbieteZugriffe();
    const { res, aufrufe } = fakeRes();
    const eingabe = { ...ids, art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf" };
    await mappeRegisterDocument(fakeReq(eingabe, ip) as never, res as never);
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].status).toBe(400);
  });

  it("weist dasselbe beim Loeschen und beim Upload-Link ab", async () => {
    verbieteZugriffe();
    const loeschen = fakeRes();
    await mappeDeleteDocument(fakeReq({ mappenId: M1, docId: "paket.zip" }, ip) as never, loeschen.res as never);
    expect(loeschen.aufrufe[0].status).toBe(400);

    const link = fakeRes();
    await mappeUploadUrl(
      fakeReq({ mappenId: "../x", dateiname: "a.pdf", contentType: "application/pdf", sizeBytes: 10 }, ip) as never,
      link.res as never,
    );
    expect(link.aufrufe[0].status).toBe(400);
  });

  it("weist einen Download-Link mit falschem Format ab, ohne nachzuschlagen", async () => {
    verbieteZugriffe();
    const { res, aufrufe } = fakeRes();
    const req = { ...fakeReq({}, ip), method: "GET", query: { mappe: "../x", token: D1 } };
    await mappeDownload(req as never, res as never);
    expect(aufrufe[0].status).toBe(400);
  });
});

/**
 * WOZU: ein unbekannter Inhalt darf nicht auf den Typ zurueckfallen, den der
 * Browser behauptet - wie beim Konto-Upload.
 */
describe("mappeRegisterDocument - unbekannter Inhalt", () => {
  it("lehnt eine Datei ab, deren erste Bytes weder PDF, JPEG noch PNG sind, und loescht sie", async () => {
    const db = fakeFirestore(mappeRecord({ zipGebautAm: null, dokumente: [] }));
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeBucketMitZustand();
    const pfad = `bewerbungsmappen/${M1}/${D1}`;
    await storage.bucket().file(pfad).save(Buffer.from("<html><script>alert(1)</script></html>"));
    getStorageMock.mockReturnValue(storage);

    const eingabe = { mappenId: M1, docId: D1, art: "zeugnis", dateiname: "z.pdf", contentType: "application/pdf" };
    const { res, aufrufe } = fakeRes();
    await mappeRegisterDocument(fakeReq(eingabe, "203.0.113.41") as never, res as never);

    expect(aufrufe).toEqual([{ status: 400, body: { fehler: "Erlaubt sind PDF, JPEG und PNG." } }]);
    expect(db.stand().dokumente).toHaveLength(0);
    expect(storage.dateien.has(pfad)).toBe(false);
  });

  it("verzeichnet eine echte PDF-Datei mit dem erkannten Typ und gesaeubertem Namen", async () => {
    const db = fakeFirestore(mappeRecord({ zipGebautAm: null, dokumente: [] }));
    getFirestoreMock.mockReturnValue(db);
    const storage = fakeBucketMitZustand();
    await storage.bucket().file(`bewerbungsmappen/${M1}/${D1}`).save(pdf(2000));
    getStorageMock.mockReturnValue(storage);

    const eingabe = { mappenId: M1, docId: D1, art: "zeugnis", dateiname: 'Zeug"nis\r\n.pdf', contentType: "image/png" };
    const { res, aufrufe } = fakeRes();
    await mappeRegisterDocument(fakeReq(eingabe, "203.0.113.42") as never, res as never);

    expect(aufrufe[0].body).toEqual({ ok: true });
    expect(db.stand().dokumente[0]).toMatchObject({ contentType: "application/pdf", dateiname: "Zeugnis.pdf" });
  });
});

/**
 * Antwort-Attrappe, die die REIHENFOLGE festhaelt: wann Kopfzeilen gesetzt,
 * wann gesendet wurde - und die "finish" erst nach dem Senden feuert.
 */
function protokollRes(protokoll: string[], abbruch = false) {
  const kopf: Record<string, string> = {};
  const beiFinish: (() => void)[] = [];
  const beiClose: (() => void)[] = [];
  let status = 200;
  let body: unknown;
  const res = {
    kopf,
    status(code: number) {
      status = code;
      return res;
    },
    set(name: string, wert: string) {
      kopf[name] = wert;
      return res;
    },
    setHeader(name: string, wert: string) {
      protokoll.push(`kopf:${name}`);
      kopf[name] = wert;
      return res;
    },
    headersSent: false,
    removeHeader(name: string) {
      protokoll.push(`kopf-weg:${name}`);
      delete kopf[name];
    },
    send(inhalt: unknown) {
      body = inhalt;
      protokoll.push(`gesendet:${status}`);
    },
    end(inhalt: unknown) {
      body = inhalt;
      protokoll.push(`gesendet:${status}`);
      // Abbruch: die Verbindung schliesst, bevor alles hinaus ist - kein "finish".
      for (const f of abbruch ? beiClose : beiFinish) f();
    },
    on(ereignis: string, f: () => void) {
      if (ereignis === "finish") beiFinish.push(f);
      if (ereignis === "close") beiClose.push(f);
      return res;
    },
    once(ereignis: string, f: () => void) {
      return res.on(ereignis, f);
    },
    ergebnis: () => ({ status, body }),
  };
  return res;
}

function protokollStorage(protokoll: string[], downloadScheitert = false) {
  return {
    bucket: () => ({
      file: (pfad: string) => ({
        download: async () => {
          protokoll.push("zip-geladen");
          if (downloadScheitert) throw new Error(`No such object: ${pfad}`);
          return [Buffer.from("PK-zip")];
        },
        delete: async () => {
          protokoll.push("zip-geloescht");
        },
      }),
    }),
  };
}

function protokollFirestore(protokoll: string[], anfang: MappeRecord) {
  const db = fakeFirestore(anfang);
  return {
    ...db,
    runTransaction: async <T>(fn: Parameters<typeof db.runTransaction<T>>[0]): Promise<T> => {
      const ergebnis = await db.runTransaction(fn);
      protokoll.push("token-verbraucht");
      return ergebnis;
    },
  };
}

/**
 * WOZU: Token verbrauchen und ZIP loeschen erst, wenn die Kopfzeilen (mit dem
 * gefilterten `refCode`) stehen. Wirft `setHeader` vorher, hat der Bewerber
 * sonst weder Paket noch Link.
 */
describe("mappeDownload - Reihenfolge", () => {
  const TOKEN = "t" + "0".repeat(24) + "9";

  function downloadReq(ip: string) {
    return { ...fakeReq({}, ip), method: "GET", query: { mappe: M1, token: TOKEN } };
  }

  it("laedt, setzt Kopfzeilen, verbraucht dann den Token, sendet - und loescht das ZIP erst danach", async () => {
    const protokoll: string[] = [];
    const db = protokollFirestore(protokoll, mappeRecord({ einmalToken: TOKEN, zipGebautAm: Date.now() - 1000 }));
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(protokollStorage(protokoll));
    const res = protokollRes(protokoll);

    await mappeDownload(downloadReq("203.0.113.50") as never, res as never);

    expect(res.ergebnis().status).toBe(200);
    expect(protokoll).toEqual([
      "zip-geladen",
      "kopf:Content-Type",
      "kopf:Content-Disposition",
      "kopf:Cache-Control",
      "token-verbraucht",
      "gesendet:200",
      "zip-geloescht",
    ]);
    expect(db.stand().einmalToken).toBeNull();
  });

  it("verbraucht den Token nicht, wenn das ZIP nicht geladen werden kann", async () => {
    const protokoll: string[] = [];
    const db = protokollFirestore(protokoll, mappeRecord({ einmalToken: TOKEN, zipGebautAm: Date.now() - 1000 }));
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(protokollStorage(protokoll, true));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = protokollRes(protokoll);

    await mappeDownload(downloadReq("203.0.113.51") as never, res as never);

    expect(res.ergebnis().status).toBe(500);
    expect(protokoll).not.toContain("token-verbraucht");
    expect(protokoll).not.toContain("zip-geloescht");
    expect(db.stand().einmalToken).toBe(TOKEN);
  });

  it("filtert den refCode in Content-Disposition", async () => {
    const protokoll: string[] = [];
    const boeserRefCode = 'REF"1\r\nSet-Cookie: x=1ü';
    getFirestoreMock.mockReturnValue(
      protokollFirestore(protokoll, mappeRecord({ refCode: boeserRefCode, einmalToken: TOKEN, zipGebautAm: Date.now() - 1000 })),
    );
    getStorageMock.mockReturnValue(protokollStorage(protokoll));
    const res = protokollRes(protokoll);

    await mappeDownload(downloadReq("203.0.113.52") as never, res as never);

    const kopf = res.kopf["Content-Disposition"];
    expect(kopf).toMatch(/^attachment; filename="Bewerbung_/);
    expect(kopf).not.toMatch(/[\r\n]/);
    expect(kopf.match(/"/g)).toHaveLength(2);
    expect(/^[\x20-\x7e]*$/.test(kopf)).toBe(true);
  });

  it("weist einen falschen Token ab, ohne das ZIP zu laden", async () => {
    const protokoll: string[] = [];
    getFirestoreMock.mockReturnValue(
      protokollFirestore(protokoll, mappeRecord({ einmalToken: "t" + "1".repeat(25), zipGebautAm: Date.now() - 1000 })),
    );
    getStorageMock.mockReturnValue(protokollStorage(protokoll));
    const res = protokollRes(protokoll);

    await mappeDownload(downloadReq("203.0.113.53") as never, res as never);

    expect(res.ergebnis().status).toBe(410);
    expect(protokoll).toEqual(["gesendet:410"]);
  });

  it("loescht das ZIP nicht, wenn die Verbindung vor dem Ende abbricht", async () => {
    const protokoll: string[] = [];
    getFirestoreMock.mockReturnValue(
      protokollFirestore(protokoll, mappeRecord({ einmalToken: TOKEN, zipGebautAm: Date.now() - 1000 })),
    );
    getStorageMock.mockReturnValue(protokollStorage(protokoll));
    const res = protokollRes(protokoll, true);

    await mappeDownload(downloadReq("203.0.113.54") as never, res as never);

    expect(protokoll).toContain("gesendet:200");
    expect(protokoll).not.toContain("zip-geloescht");
  });

  it("antwortet dem Verlierer zweier gleichzeitiger Abrufe ohne ZIP-Kopfzeilen", async () => {
    const protokoll: string[] = [];
    const db = protokollFirestore(protokoll, mappeRecord({ einmalToken: TOKEN, zipGebautAm: Date.now() - 1000 }));
    // Der andere Abruf verbraucht den Token zwischen Vorabpruefung und Transaktion.
    const transaktion = db.runTransaction;
    db.runTransaction = async (fn) => {
      await db.collection().doc().update({ heruntergeladenAm: Date.now(), einmalToken: null });
      return transaktion(fn);
    };
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(protokollStorage(protokoll));
    const res = protokollRes(protokoll);

    await mappeDownload(downloadReq("203.0.113.55") as never, res as never);

    expect(res.ergebnis().status).toBe(410);
    expect(res.kopf["Content-Disposition"]).toBeUndefined();
    expect(res.kopf["Content-Type"]).toBeUndefined();
    expect(protokoll).not.toContain("zip-geloescht");
  });

  it("nimmt die ZIP-Kopfzeilen zurueck, wenn die Transaktion scheitert", async () => {
    const protokoll: string[] = [];
    const db = protokollFirestore(protokoll, mappeRecord({ einmalToken: TOKEN, zipGebautAm: Date.now() - 1000 }));
    db.runTransaction = async () => {
      throw new Error("ABORTED: too much contention");
    };
    getFirestoreMock.mockReturnValue(db);
    getStorageMock.mockReturnValue(protokollStorage(protokoll));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = protokollRes(protokoll);

    await mappeDownload(downloadReq("203.0.113.56") as never, res as never);

    expect(res.ergebnis().status).toBe(500);
    expect(res.kopf["Content-Disposition"]).toBeUndefined();
    expect(res.ergebnis().body).not.toMatch(/ABORTED/);
  });
});