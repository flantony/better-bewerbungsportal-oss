import { onRequest, type HttpsOptions } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { z } from "zod/v3";
import { clientKeyFromForwardedFor, createRateLimiter, type Quota } from "./lib/drosselung";
import { anmeldungAusAnfrage, uidAusAnfrage } from "./konto/kontoAuth";
import {
  istOneClickAnfrage,
  pruefeAbbestellParameter,
  pruefeBenachrichtigungsAnfrage,
  pruefeLoeschAnfrage,
  pruefeMerklistenAnfrage,
  pruefePinstGuidAbfrage,
  pruefeSuchprofileAnfrage,
  pruefeSuchprofilIdAbfrage,
} from "./konto/kontoAnfragen";
import {
  aendereMerkliste,
  aendereSuchprofile,
  bestaetigeAbbestellung,
  entferneUnterlage,
  ladeAngaben,
  ladeAlleAusstehenden,
  ladeAusstehendeUnterlage,
  ladeOderLegeAn,
  ladeReinLesend,
  ladeSuchprofilFilter,
  ladeUnterlagen,
  loescheAngaben,
  loescheKonto,
  merkeAusstehendeUnterlage,
  registriereUnterlage,
  setzeBenachrichtigung,
  speichereAngaben,
  vergissAusstehendeUnterlage,
  widerrufeStaatsangehoerigkeit,
} from "./konto/kontoStore";
import { SUCHPROFILE_MAX, type GemerkteStelleSicht, type KontoSicht, type SuchprofilSicht } from "./konto/kontoTypen";
import { filterKennung } from "./konto/suchprofile";
import { listJobsFilterAus } from "./mcp/lib/suchfilter";
import { queryJobs } from "./mcp/lib/queryJobs";
import { angabenExportSicht, angabenSicht, type AngabenExportSicht, type AngabenRecord } from "./konto/angaben";
import {
  contentDispositionUnterlage,
  eingangPfad,
  istAusstehendAbgelaufen,
  istVerwaisterUpload,
  pruefeNeueUnterlage,
  sichererDateiname,
  unterlagenPfad,
  unterlageSicht,
  UNTERLAGEN_ARTEN,
  type UnterlageEintrag,
  type UnterlageSicht,
} from "./konto/unterlagen";
import { KEINE_AUSWEISKOPIE } from "./mappe/ausweiskopie";
import { erkenneTyp } from "./mappe/uploadRegeln";
import { EINMAL_TOKEN_REGEX, neuerEinmalToken } from "./mappe/mappeId";
import { ERLAUBTE_URSPRUENGE, PUBLIC_SITE_URL } from "./mcp/publicSite";
import { baueZip } from "./mappe/paket";
import { paketVerzeichnis } from "./mappe/paketVerzeichnis";
import { textZuPdf } from "./mappe/textZuPdf";
import { laufbahngruppenDerStelle, vonHandFuerFormulare, type VonHandFormular } from "./mappe/merkzettel";
import { bewerbungJederzeitFuerJob, bewerbungsschlussText } from "./lib/bewerbungsschluss";
import { findePlatzhalter } from "./lib/platzhalter";
import { loadJobRecord, JobNotFoundError } from "./mcp/lib/loadJobRecord";
import { getDocumentRequirements, type DocumentRequirementsResult } from "./mcp/tools/getDocumentRequirements";
import { loadJobDocuments, readStoredDocument } from "./jobDocumentStore";
import { BewerbungsbogenTemplateChangedError, fillBewerbungsbogen, type BewerbungsbogenFillValues } from "./fillBewerbungsbogen";
import {
  baueBewerbungsplan,
  baueMappenDokumente,
  feldnamenFuer,
  fuellwerteAus,
  merkzettel,
  paketDateiname,
  pruefeFormularLuecken,
  pruefePaketAnfrage,
  pruefePaketGroesse,
  type Bewerbungsplan,
  type PaketDokumentEingabe,
} from "./konto/bewerbung";
import type { JobRecord } from "./types";
import { BEWERBERDATEN_IM_KONTO } from "./lib/funktionsschalter";

const REGION = "europe-west3";
/**
 * `cors` nur fuer die eigene Website, nicht `cors: true` (also jede Seite im
 * Netz). Die Endpunkte verlangen ein ID-Token
 * im Header, eine fremde Seite haette ohne Token nichts erreicht - aber eine
 * Antwort an eine fremde Herkunft hat hier keinen Zweck.
 */
const OPTIONEN = { region: REGION, cors: ERLAUBTE_URSPRUENGE, maxInstances: 10 };

const NICHT_ANGEMELDET = "Bitte melde dich an.";
const KEINE_EINSCHRAENKUNG =
  "Lege zuerst einen aktiven Filter mit mindestens einer Einschränkung an, z. B. einem Bundesland oder einer Vertragsart.";
const UNERWARTETER_FEHLER = "Da ist etwas schiefgelaufen. Bitte versuch es später erneut.";

/**
 * Ein gemeinsames Kontingent fuer alle Kontoaufrufe. Der laengste legitime
 * Ablauf ist ein Nutzer, der auf der Merkliste zehn Stellen hintereinander
 * entfernt: das sind zehn Aufrufe in Sekunden. 30/Minute deckt das mit Luft
 * und bremst eine Schleife, die Tokens durchprobiert.
 */
export const KONTO_QUOTA: Quota = { capacity: 30, refillPerMinute: 30 };

/**
 * Eigenes, grosszuegigeres Kontingent fuer Upload-URL/Registrieren:
 * jede hochgeladene Unterlage kostet zwei Aufrufe (URL holen, dann
 * registrieren), und ein Konto nimmt bis zu 15 Dateien - macht 30 Aufrufe in
 * schneller Folge, wenn jemand seinen ganzen Stapel Zeugnisse hintereinander
 * hochlaedt. Ein eigener Namensraum (`kind: "kontoUnterlagen"`), damit dieser
 * Verkehr nicht das gemeinsame `KONTO_QUOTA` der uebrigen Kontoaufrufe
 * mitverbraucht (dieselbe Ueberlegung wie bei `MAPPE_HTTP_QUOTA`).
 */
export const KONTO_UNTERLAGEN_QUOTA: Quota = { capacity: 40, refillPerMinute: 20 };

/**
 * Eigenes Kontingent fuer die Trefferzahl je Filterkarte: "Mein Konto" fragt
 * beim Laden fuer jeden gespeicherten Filter einmal an (bis zu
 * SUCHPROFILE_MAX auf einen Schlag) - das soll nicht das gemeinsame
 * `KONTO_QUOTA` der Schreibaufrufe aufzehren.
 */
export const KONTO_TREFFER_QUOTA: Quota = { capacity: 30, refillPerMinute: 30 };

const drossel = createRateLimiter();

type Handler = (uid: string, req: Request, res: Response) => Promise<void>;
type AnmeldungHandler = (
  anmeldung: { uid: string; emailBestaetigt: boolean; email: string | null },
  req: Request,
  res: Response,
) => Promise<void>;

/**
 * Methode und Drosselung - der Teil, den `kontoEndpunkt` und
 * `kontoEndpunktMitAnmeldung` gemeinsam brauchen. `true` heisst: weitermachen.
 * `quota`/`kind` sind optional (Vorgabe: das gemeinsame `KONTO_QUOTA`) - nur
 * Upload-URL/Registrieren bekommen ihr eigenes Kontingent.
 */
function pruefeMethodeUndDrosselung(
  req: Request,
  res: Response,
  methode: "GET" | "PUT" | "POST",
  quota: Quota = KONTO_QUOTA,
  kind = "konto",
): boolean {
  if (req.method !== methode) {
    res.status(405).json({ fehler: `Nur ${methode}.` });
    return false;
  }
  const schluessel = clientKeyFromForwardedFor(req.headers["x-forwarded-for"], req.socket?.remoteAddress);
  const entscheidung = drossel.check(schluessel, quota, kind);
  if (!entscheidung.allowed) {
    res.set("Retry-After", String(entscheidung.retryAfterSeconds));
    res.status(429).json({ fehler: `Zu viele Anfragen. Bitte in ${entscheidung.retryAfterSeconds} Sekunden erneut versuchen.` });
    return false;
  }
  return true;
}

/**
 * Gemeinsamer Rahmen: Methode, Drosselung, Anmeldung, Fehlerbehandlung. Der
 * Handler sieht nur noch eine gepruefte uid. Geloggt wird nur der Fehlername
 * (Muster aus mappeHttp.ts) - nie die uid, nie ein Body.
 */
/**
 * `funktionsOptionen` braucht nur `kontoBewerbungspaketBauen`: das Paketbauen laedt
 * mehrere Dateien, fuellt PDFs und komprimiert ein ZIP - mit den restlichen,
 * schlanken Kontoendpunkten geteilte `OPTIONEN` (Standard-Speicher/-Timeout)
 * waeren dafuer zu knapp. `funktionsOptionen` ueberschreibt/ergaenzt `OPTIONEN`
 * NUR fuer die eine Function, die sie mitgibt - alle anderen Aufrufer lassen
 * den Parameter weg.
 */
function kontoEndpunkt(
  methode: "GET" | "PUT" | "POST",
  name: string,
  handler: Handler,
  quota: Quota = KONTO_QUOTA,
  kind = "konto",
  funktionsOptionen?: Partial<HttpsOptions>,
) {
  return onRequest({ ...OPTIONEN, ...funktionsOptionen }, async (req, res) => {
    if (!pruefeMethodeUndDrosselung(req, res, methode, quota, kind)) return;
    // `checkRevoked = true`: ohne das bleibt ein ID-Token bis zu eine Stunde
    // nach kontoLoeschen gueltig - ein zweiter Tab wuerde konten/{uid} fuer
    // einen geloeschten Auth-Nutzer neu anlegen, und raeumeKontenAuf (das ueber
    // listUsers laeuft) findet diesen Nutzer nie wieder. Ohne den Parameter
    // waere das Loeschversprechen (Art. 17 DSGVO) fuer bis zu einer Stunde nicht
    // eingehalten.
    const uid = await uidAusAnfrage(req.headers.authorization, (token) => getAuth().verifyIdToken(token, true));
    if (!uid) {
      res.status(401).json({ fehler: NICHT_ANGEMELDET });
      return;
    }
    try {
      await handler(uid, req, res);
    } catch (fehler) {
      logger.error(`${name} fehlgeschlagen`, { name: (fehler as Error).name });
      res.status(500).json({ fehler: UNERWARTETER_FEHLER });
    }
  });
}

/**
 * Wie `kontoEndpunkt`, liefert dem Handler aber zusaetzlich `emailBestaetigt`
 * und `email` aus dem geprueften ID-Token (`kontoLaden` und
 * `kontoBenachrichtigungSetzen` brauchen `emailBestaetigt`, `kontoExport`
 * zusaetzlich `email` - beides ohne die Adresse selbst zu speichern).
 */
function kontoEndpunktMitAnmeldung(
  methode: "GET" | "PUT" | "POST",
  name: string,
  handler: AnmeldungHandler,
  quota: Quota = KONTO_QUOTA,
  kind = "konto",
  funktionsOptionen?: Partial<HttpsOptions>,
) {
  return onRequest({ ...OPTIONEN, ...funktionsOptionen }, async (req, res) => {
    if (!pruefeMethodeUndDrosselung(req, res, methode, quota, kind)) return;
    const anmeldung = await anmeldungAusAnfrage(req.headers.authorization, (token) => getAuth().verifyIdToken(token, true));
    if (!anmeldung) {
      res.status(401).json({ fehler: NICHT_ANGEMELDET });
      return;
    }
    try {
      await handler(anmeldung, req, res);
    } catch (fehler) {
      logger.error(`${name} fehlgeschlagen`, { name: (fehler as Error).name });
      res.status(500).json({ fehler: UNERWARTETER_FEHLER });
    }
  });
}

// ─── Funktionsschalter Bewerberdaten ────────────────────────────────────────

/**
 * Antwort der schreibenden bzw. verarbeitenden Bewerberdaten-Endpunkte, solange
 * `BEWERBERDATEN_IM_KONTO` aus ist. 404 statt 403: das Web behandelt 404 an
 * diesen Endpunkten schon als "gibt es nicht" (Bewerben-Knopf verschwindet,
 * die gefuehrte Bewerbung leitet zur Stellenseite) - auch ein offener
 * Browser-Tab, der die Funktion noch anbietet, bricht damit nicht ab.
 */
export const BEWERBERDATEN_AUS =
  "Angaben, Unterlagen und die geführte Bewerbung bieten wir im Konto derzeit nicht an. Auf der Stellenseite " +
  "findest du die Formulare und eine Checkliste, was du einreichen musst. Du kannst die Bewerbung auch mit " +
  "deiner KI vorbereiten.";

/** `true` heisst: abgelehnt, der Handler endet. */
function bewerberdatenAbgeschaltet(res: Response): boolean {
  if (BEWERBERDATEN_IM_KONTO) return false;
  res.status(404).json({ fehler: BEWERBERDATEN_AUS });
  return true;
}

/** `kontoLaden` traegt den Schalter mit, damit das Web keine zweite Kopie davon braucht. */
export interface KontoLadenAntwort extends KontoSicht {
  bewerberdatenAktiv: boolean;
}

export const kontoLaden = kontoEndpunktMitAnmeldung("GET", "kontoLaden", async ({ uid, emailBestaetigt }, _req, res) => {
  const antwort: KontoLadenAntwort = {
    ...(await ladeOderLegeAn(uid, Date.now(), emailBestaetigt)),
    bewerberdatenAktiv: BEWERBERDATEN_IM_KONTO,
  };
  res.status(200).json(antwort);
});

function zuVieleFilter(frei: number): string {
  return frei === 0
    ? `Du kannst höchstens ${SUCHPROFILE_MAX} Filter speichern. Lösche erst einen, bevor du einen neuen hinzufügst.`
    : `Du kannst höchstens ${SUCHPROFILE_MAX} Filter speichern. Es ist nur noch Platz für ${frei}.`;
}

/**
 * Mehrere Filter je Konto. Ein Endpunkt, drei
 * Aktionen (wie `kontoMerklisteAendern`):
 * - `hinzufuegen`: haengt einen oder mehrere Filter an; exakte Dubletten
 *   werden uebersprungen und gezaehlt; ueber SUCHPROFILE_MAX hinaus 409.
 * - `aendern`: Filter, Name und/oder `aktiv` eines Filters per `id`.
 * - `loeschen`: einen Filter per `id` (idempotent).
 * Die Antwort traegt immer die vollstaendige neue Liste, damit ein Aufrufer
 * (auch die Importseite) nicht noch einmal `kontoLaden` braucht.
 */
export const kontoSuchprofileAendern = kontoEndpunkt("POST", "kontoSuchprofileAendern", async (uid, req, res) => {
  const pruefung = pruefeSuchprofileAnfrage(req.body);
  if (!pruefung.ok) {
    res.status(400).json({ fehler: pruefung.fehler });
    return;
  }
  const ergebnis = await aendereSuchprofile(uid, pruefung.wert, Date.now());
  switch (ergebnis.ergebnis) {
    case "zu-viele":
      res.status(409).json({ fehler: zuVieleFilter(ergebnis.frei), frei: ergebnis.frei });
      return;
    case "unbekannt":
      res.status(404).json({ fehler: "Diesen Filter gibt es nicht (mehr). Bitte lade die Seite neu." });
      return;
    case "doppelt":
      res.status(409).json({ fehler: "Genau diesen Filter hast du schon gespeichert." });
      return;
    default:
      res.status(200).json(ergebnis);
  }
});

/**
 * Zwischenspeicher der Trefferzahlen je Instanz, Schluessel = kanonischer
 * Filter (`filterKennung`, nie geloggt). Ein Filter mit Suchbegriff, Ort oder
 * mehreren Mehrfachauswahlen geht in queryJobs ueber den Speicherweg, der sich
 * ein Abbild je Instanz teilt (`aktiveStellen` in queryJobs.ts); dieser
 * Zwischenspeicher spart zusaetzlich die Zaehl-Aggregationen des indizierten
 * Wegs. Der Bestand aendert sich einmal am
 * Tag, zehn Minuten Alter sind fuer eine Kartenzahl genug.
 */
const TREFFER_CACHE_MS = 10 * 60 * 1000;
const TREFFER_CACHE_MAX = 500;
const trefferCache = new Map<string, { anzahl: number; mindestens: boolean; bis: number }>();

/**
 * Aktuelle Trefferzahl EINES gespeicherten Filters - dieselbe Abfrage wie
 * `list_jobs` und der Nachtlauf (`queryJobs`), mit `limit: 1`. Ueber den Index
 * kostet das eine Zaehl-Aggregation plus zwei Dokumente; Filter, die
 * nachgefiltert werden muessen (Suchbegriff, Ort, mehrere Mehrfachauswahlen),
 * werten das Abbild der aktiven Stellen aus (bis zum Lese-Deckel von
 * queryJobs, 3000 Dokumente) - deshalb der
 * Zwischenspeicher oben. `mindestens: true`, wenn dieser Deckel gegriffen hat:
 * dann ist die Zahl eine Untergrenze. Die Kennung statt des Filters im Aufruf:
 * so ist der Endpunkt keine allgemeine Zaehlschnittstelle.
 */
export const kontoSuchprofilTreffer = kontoEndpunkt(
  "GET",
  "kontoSuchprofilTreffer",
  async (uid, req, res) => {
    const pruefung = pruefeSuchprofilIdAbfrage(req.query.id);
    if (!pruefung.ok) {
      res.status(400).json({ fehler: pruefung.fehler });
      return;
    }
    const filter = await ladeSuchprofilFilter(uid, pruefung.wert, Date.now());
    if (!filter) {
      res.status(404).json({ fehler: "Diesen Filter gibt es nicht (mehr). Bitte lade die Seite neu." });
      return;
    }
    const jetzt = Date.now();
    const schluessel = filterKennung(filter);
    const gemerkt = trefferCache.get(schluessel);
    if (gemerkt && gemerkt.bis > jetzt) {
      res.status(200).json({ anzahl: gemerkt.anzahl, mindestens: gemerkt.mindestens });
      return;
    }
    const ergebnis = await queryJobs({ ...listJobsFilterAus(filter), limit: 1 });
    const antwort = { anzahl: ergebnis.totalCount, mindestens: ergebnis.abgeschnitten };
    // Einfache Obergrenze statt LRU: voll -> leeren. Kostet schlimmstenfalls
    // eine Runde neuer Abfragen.
    if (trefferCache.size >= TREFFER_CACHE_MAX) trefferCache.clear();
    trefferCache.set(schluessel, { ...antwort, bis: jetzt + TREFFER_CACHE_MS });
    res.status(200).json(antwort);
  },
  KONTO_TREFFER_QUOTA,
  "kontoTreffer",
);

export const kontoMerklisteAendern = kontoEndpunkt("POST", "kontoMerklisteAendern", async (uid, req, res) => {
  const pruefung = pruefeMerklistenAnfrage(req.body);
  if (!pruefung.ok) {
    res.status(400).json({ fehler: pruefung.fehler });
    return;
  }
  const ergebnis = await aendereMerkliste(uid, pruefung.wert.pinstGuid, pruefung.wert.aktion, Date.now());
  if (ergebnis === "stelle-unbekannt") {
    res.status(404).json({ fehler: "Diese Stelle gibt es nicht (mehr)." });
    return;
  }
  res.status(200).json({ ergebnis });
});

export const kontoLoeschen = kontoEndpunkt("POST", "kontoLoeschen", async (uid, req, res) => {
  const pruefung = pruefeLoeschAnfrage(req.body);
  if (!pruefung.ok) {
    res.status(400).json({ fehler: pruefung.fehler });
    return;
  }
  await loescheKonto(uid);
  res.status(204).end();
});

export const kontoBenachrichtigungSetzen = kontoEndpunktMitAnmeldung(
  "PUT",
  "kontoBenachrichtigungSetzen",
  async ({ uid, emailBestaetigt }, req, res) => {
    const pruefung = pruefeBenachrichtigungsAnfrage(req.body);
    if (!pruefung.ok) {
      res.status(400).json({ fehler: pruefung.fehler });
      return;
    }
    // Eine Mail an eine unbestaetigte Adresse waere ein Zustellungsversuch an
    // jemanden, der die Adresse vielleicht gar nicht besitzt.
    if (pruefung.wert.aktiv && !emailBestaetigt) {
      res.status(409).json({ fehler: "Bitte bestätige zuerst deine E-Mail-Adresse." });
      return;
    }
    const ergebnis = await setzeBenachrichtigung(uid, pruefung.wert.aktiv, Date.now());
    if (ergebnis === "kein-profil") {
      res.status(409).json({ fehler: KEINE_EINSCHRAENKUNG });
      return;
    }
    res.status(204).end();
  },
);

// ─── Gemerkte Angaben ───────────────────────────────────────────────────────

export const kontoAngabenLaden = kontoEndpunkt("GET", "kontoAngabenLaden", async (uid, _req, res) => {
  res.status(200).json(angabenSicht(await ladeAngaben(uid)));
});

// Lesen, Widerrufen und Loeschen bleiben ohne Schalter: gespeicherte Daten
// muessen einsehbar und loeschbar bleiben. Nur das Speichern haengt am Schalter.
export const kontoAngabenSpeichern = kontoEndpunkt("PUT", "kontoAngabenSpeichern", async (uid, req, res) => {
  if (bewerberdatenAbgeschaltet(res)) return;
  const ergebnis = await speichereAngaben(uid, req.body, Date.now());
  if (!ergebnis.ok) {
    res.status(400).json({ fehler: ergebnis.fehler });
    return;
  }
  res.status(204).end();
});

// ─── Befristete Bewerbungspakete mitloeschen ────────────────────────────────

const PAKET_PRAEFIX = (uid: string) => `konten/${uid}/pakete/`;

/**
 * Loescht alle eigenen Bewerbungspakete ausser `ausser`. Idempotent (ein
 * schon verschwundenes Objekt zaehlt als geloescht). Wirft bei einem
 * Fehler - die Aufrufer entscheiden, ob das die Antwort kippt.
 */
async function loescheEigenePakete(uid: string, ausser?: string): Promise<void> {
  const [vorhandene] = await getStorage().bucket().getFiles({ prefix: PAKET_PRAEFIX(uid) });
  await Promise.all(
    vorhandene.filter((datei) => datei.name !== ausser).map((datei) => datei.delete({ ignoreNotFound: true })),
  );
}

/**
 * Ein gebautes Paket kann die widerrufene Staatsangehoerigkeit, geloeschte
 * Angaben oder eine geloeschte Unterlage enthalten - es muss mit weg,
 * sonst laege der Inhalt bis zum stuendlichen Sweep weiter (bis zu zwei
 * Stunden). Scheitert das, antwortet der Endpunkt mit 500 statt 204: der
 * Bewerber soll erneut versuchen, denn "Widerruf loescht sofort" muss
 * stimmen. Die Hauptaktion davor ist idempotent, ein Retry also gefahrlos.
 */
async function loescheEigenePaketeOderMelde(uid: string, name: string, res: Response): Promise<boolean> {
  try {
    await loescheEigenePakete(uid);
    return true;
  } catch (fehler) {
    logger.error(`${name}: Bewerbungspakete konnten nicht geloescht werden`, { name: (fehler as Error).name });
    res.status(500).json({ fehler: UNERWARTETER_FEHLER });
    return false;
  }
}

export const kontoStaatsangehoerigkeitWiderrufen = kontoEndpunkt(
  "POST",
  "kontoStaatsangehoerigkeitWiderrufen",
  async (uid, _req, res) => {
    await widerrufeStaatsangehoerigkeit(uid);
    if (!(await loescheEigenePaketeOderMelde(uid, "kontoStaatsangehoerigkeitWiderrufen", res))) return;
    res.status(204).end();
  },
);

export const kontoAngabenLoeschen = kontoEndpunkt("POST", "kontoAngabenLoeschen", async (uid, req, res) => {
  const pruefung = pruefeLoeschAnfrage(req.body);
  if (!pruefung.ok) {
    res.status(400).json({ fehler: pruefung.fehler });
    return;
  }
  await loescheAngaben(uid);
  if (!(await loescheEigenePaketeOderMelde(uid, "kontoAngabenLoeschen", res))) return;
  res.status(204).end();
});

// ─── Unterlagen ─────────────────────────────────────────────────────────────
//
// Folgt dem Upload-Ablauf aus mappeHttp.ts (signierte PUT-URL,
// Bucket-Bestand statt Firestore-Verzeichnis fuer die Mengengrenzen, echte
// Storage-Metadaten statt der Behauptung des Clients). Drei Unterschiede:
//
// (1) Eine signierte PUT-URL bleibt 15 Minuten gueltig und
// ueberlebt damit die Registrierung. Zeigte sie direkt auf den endgueltigen
// Pfad, koennte ein spaeteres PUT eine bereits registrierte Datei unbemerkt
// ersetzen, und ein nie registriertes Objekt bliebe fuer immer unsichtbar in
// Liste/Export, aber zaehlte weiter gegen die Mengengrenze. Deshalb landet
// ein Upload IMMER erst unter `eingangPfad` (Storage), niemals direkt unter
// `unterlagenPfad`; `kontoUnterlageRegistrieren` liest die echten Bytes von
// dort, kopiert sie NACH erfolgreicher Pruefung nach `unterlagenPfad` und
// loescht das Eingangs-Objekt. Ein nie registriertes Eingangs-Objekt gilt
// nach einer Stunde als verwaist (`istVerwaisterUpload`) und wird sowohl
// beim NAECHSTEN eigenen Upload-URL-Aufruf als auch stuendlich
// (`raeumeUploadsAuf.ts`) abgeraeumt - bis dahin zaehlt es gegen die
// Mengengrenze, damit es diese nicht durch endloses Abbrechen umgehen kann.
//
// (2) `art`/`dateiname`/`contentType` kommen schon bei der Upload-URL-Anfrage
// und werden unter `ausstehend.<docId>` im Dokumente-Dokument gemerkt (s.
// kontoStore.ts), weil `kontoUnterlageRegistrieren` nur `docId` bekommt.
//
// (3) keine Ausweiskopie: wir nehmen keine entgegen (s. mappe/ausweiskopie.ts).
// Eine Upload-URL-Anfrage mit `art: "ausweiskopie"` bekommt eine
// verstaendliche Ablehnung; ein `ausstehend`-Eintrag mit dieser Art faellt
// beim Lesen weg (`normalisiereDokumente`) und wird nie registriert.

const UPLOAD_URL_MINUTEN = 15;
const DOWNLOAD_URL_MINUTEN = 5;

/**
 * Zaehlt, was gegen die Mengengrenzen bindet: alle
 * REGISTRIERTEN Unterlagen (`dokumente/`, unbefristet) PLUS die noch nicht
 * abgelaufenen EINGANGS-Objekte (`eingang/`, s. Kopfkommentar oben) - ein
 * abgelaufenes Eingangs-Objekt zaehlt NICHT mit, sonst wuerde
 * ein liegen gebliebenes (aber schon zum Abraeumen faelliges) Objekt einen
 * Slot dauerhaft blockieren, bis der Sweep tatsaechlich gelaufen ist.
 */
async function bestandImBucket(uid: string, jetzt: number, ausgenommenPfad?: string): Promise<{ anzahl: number; bytes: number }> {
  const [dokDateien] = await getStorage().bucket().getFiles({ prefix: unterlagenPfad(uid, "") });
  const [eingangDateien] = await getStorage().bucket().getFiles({ prefix: eingangPfad(uid, "") });

  const relevanteDok = dokDateien.filter((datei) => datei.name !== ausgenommenPfad);
  const relevanterEingang = eingangDateien.filter((datei) => {
    if (datei.name === ausgenommenPfad) return false;
    const erstelltMs = Date.parse((datei.metadata as { timeCreated?: string }).timeCreated ?? "");
    return !Number.isNaN(erstelltMs) && !istVerwaisterUpload(erstelltMs, jetzt);
  });

  const alle = [...relevanteDok, ...relevanterEingang];
  return {
    anzahl: alle.length,
    bytes: alle.reduce((summe, datei) => summe + Number(datei.metadata.size ?? 0), 0),
  };
}

async function loescheStillschweigendUnterlage(datei: ReturnType<ReturnType<ReturnType<typeof getStorage>["bucket"]>["file"]>) {
  try {
    await datei.delete({ ignoreNotFound: true });
  } catch (fehler) {
    logger.error("kontoUnterlageRegistrieren: verwaiste Datei konnte nicht geloescht werden", {
      name: (fehler as Error).name,
    });
  }
}

/**
 * Rollt einen fehlgeschlagenen Registrierungsversuch zurueck: Eingangs-Objekt
 * loeschen UND den `ausstehend`-Eintrag entfernen, beides Best-Effort (ein
 * abgelehnter Versuch soll trotzdem "aufgeraeumt" enden, nicht als weiterer
 * Rest liegen bleiben - der naechste Versuch mit derselben docId waere sonst
 * ohnehin unmoeglich, weil `ladeAusstehendeUnterlage` den alten Eintrag noch
 * saehe).
 */
async function verwerfeEingangUndAusstehend(
  uid: string,
  docId: string,
  datei: ReturnType<ReturnType<ReturnType<typeof getStorage>["bucket"]>["file"]>,
): Promise<void> {
  await loescheStillschweigendUnterlage(datei);
  try {
    await vergissAusstehendeUnterlage(uid, docId);
  } catch (fehler) {
    logger.error("kontoUnterlageRegistrieren: ausstehender Eintrag konnte nicht entfernt werden", {
      name: (fehler as Error).name,
    });
  }
}

/**
 * Raeumt die EIGENEN verwaisten Eingangs-Objekte des anfragenden Kontos ab,
 * VOR jeder neuen Upload-URL - ergaenzt (nicht
 * ersetzt) den stuendlichen globalen Sweep in `raeumeUploadsAuf.ts`: wer
 * gerade wieder da ist und eine neue Datei hochlaedt, soll nicht erst eine
 * Stunde auf den naechsten globalen Lauf warten, um wieder Platz unter der
 * 15-Datei-Grenze zu haben.
 *
 * Zwei Durchgaenge: erst STORAGE-seitig (Eingangs-
 * Objekte, die es tatsaechlich noch gibt), dann FIRESTORE-seitig (alle
 * `ausstehend`-Eintraege des Kontos) - ein Eintrag kann aelter als die
 * Stundenfrist sein, OHNE dass (noch) ein zugehoeriges Storage-Objekt
 * existiert (z.B. nach einem gescheiterten Best-Effort-Loeschversuch); der
 * rein storage-basierte erste Durchgang wuerde einen solchen Eintrag nie
 * finden.
 */
async function raeumeEigeneEingangUploadsAuf(uid: string, jetzt: number): Promise<void> {
  const praefix = eingangPfad(uid, "");
  const [dateien] = await getStorage().bucket().getFiles({ prefix: praefix });
  const bereitsAufgeraeumt = new Set<string>();
  for (const datei of dateien) {
    const erstelltMs = Date.parse((datei.metadata as { timeCreated?: string }).timeCreated ?? "");
    if (Number.isNaN(erstelltMs) || !istVerwaisterUpload(erstelltMs, jetzt)) continue;
    const docId = datei.name.slice(praefix.length);
    await verwerfeEingangUndAusstehend(uid, docId, datei as never);
    bereitsAufgeraeumt.add(docId);
  }

  const alleAusstehenden = await ladeAlleAusstehenden(uid);
  for (const [docId, eintrag] of Object.entries(alleAusstehenden)) {
    if (bereitsAufgeraeumt.has(docId)) continue;
    if (!istAusstehendAbgelaufen(eintrag.erstelltAm, jetzt)) continue;
    try {
      await vergissAusstehendeUnterlage(uid, docId);
    } catch (fehler) {
      logger.error("kontoUnterlageUploadUrl: verwaister ausstehend-Eintrag konnte nicht entfernt werden", {
        name: (fehler as Error).name,
      });
    }
  }
}

const unterlageUploadUrlSchema = z
  .object({
    art: z.enum(UNTERLAGEN_ARTEN),
    dateiname: z.string().min(1).max(255),
    contentType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export const kontoUnterlageUploadUrl = kontoEndpunkt(
  "POST",
  "kontoUnterlageUploadUrl",
  async (uid, req, res) => {
    if (bewerberdatenAbgeschaltet(res)) return;
    // Vor der Schemapruefung: `art: "ausweiskopie"` kennt das Schema nicht,
    // und "art ... sind nötig" waere fuer den Bewerber unverstaendlich.
    if ((req.body as { art?: unknown } | undefined)?.art === "ausweiskopie") {
      res.status(400).json({ fehler: KEINE_AUSWEISKOPIE });
      return;
    }
    const eingabe = unterlageUploadUrlSchema.safeParse(req.body ?? {});
    if (!eingabe.success) {
      res.status(400).json({ fehler: "art, dateiname, contentType und sizeBytes sind nötig." });
      return;
    }
    const { art, contentType, sizeBytes } = eingabe.data;
    // Nie einen rohen, unbegrenzt langen Dateinamen speichern:
    // `sichererDateiname` VOR dem Speichern anwenden, nicht erst beim Download
    // - so liegt nie ein ungefilterter Name im Dokument, egal was spaeter
    // einmal daraus liest.
    const dateiname = sichererDateiname(eingabe.data.dateiname);
    const jetzt = Date.now();

    // Erst das EIGENE Aufraeumen, dann die Pruefung -
    // sonst zaehlt ein laengst abgelaufenes eigenes Eingangs-Objekt faelschlich
    // weiter gegen die Mengengrenze.
    await raeumeEigeneEingangUploadsAuf(uid, jetzt);

    const bestand = await bestandImBucket(uid, jetzt);
    const erlaubt = pruefeNeueUnterlage({ art, contentType, sizeBytes }, bestand);
    if (!erlaubt.ok) {
      res.status(400).json({ fehler: erlaubt.fehler });
      return;
    }

    const docId = neuerEinmalToken();
    const storagePath = eingangPfad(uid, docId);

    // Platz sofort belegen (wie mappeUploadUrl) - sonst sehen mehrere schnell
    // hintereinander geholte URLs denselben (noch leeren) Bucket-Bestand.
    await getStorage().bucket().file(storagePath).save(Buffer.alloc(0), { resumable: false });
    await merkeAusstehendeUnterlage(uid, docId, { art, dateiname, contentType }, jetzt);

    // An die DEKLARIERTE Groesse gebunden, nicht an das
    // pauschale Dateilimit - eine Anfrage fuer eine 500-KB-Datei darf keine
    // 10-MB-PUT-Signatur bekommen.
    const contentLengthRange = `0,${sizeBytes}`;
    const [uploadUrl] = await getStorage()
      .bucket()
      .file(storagePath)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires: jetzt + UPLOAD_URL_MINUTEN * 60_000,
        contentType,
        extensionHeaders: { "x-goog-content-length-range": contentLengthRange },
      });

    // Kein Dateiname, keine docId/uid im Log.
    logger.info("kontoUnterlageUploadUrl ausgestellt", { art, sizeBytes, contentType });
    res.status(200).json({ docId, uploadUrl, pflichtHeader: { "x-goog-content-length-range": contentLengthRange } });
  },
  KONTO_UNTERLAGEN_QUOTA,
  "kontoUnterlagen",
);

// Nur EXAKT das Format, das `neuerEinmalToken` erzeugt -
// alles andere ist per Definition kein von diesem Server ausgestelltes Token
// und wird OHNE jeden Firestore-/Storage-Zugriff abgelehnt.
const unterlageDocIdSchema = z.object({ docId: z.string().regex(EINMAL_TOKEN_REGEX) }).strict();

/**
 * Die gepruefte Quell-Generation gibt es nicht mehr - GCS meldet
 * das fuer ein auf eine Generation gepinntes Objekt (`download` mit
 * `generation`, `copy` mit `sourceGeneration`) als 404. 412 bleibt als
 * Sicherheitsnetz im selben Zweig.
 */
function istQuelleUeberholt(fehler: unknown): boolean {
  const code = (fehler as { code?: number } | null)?.code;
  return code === 404 || code === 412;
}

const DATEI_GEAENDERT = "Die Datei hat sich während der Prüfung geändert. Bitte lade sie erneut hoch.";

export const kontoUnterlageRegistrieren = kontoEndpunkt(
  "POST",
  "kontoUnterlageRegistrieren",
  async (uid, req, res) => {
    // Ein schon hochgeladenes, aber nicht registriertes Eingangs-Objekt raeumt
    // `raeumeUploadsAuf` nach spaetestens zwei Stunden ab.
    if (bewerberdatenAbgeschaltet(res)) return;
    const eingabe = unterlageDocIdSchema.safeParse(req.body ?? {});
    if (!eingabe.success) {
      res.status(400).json({ fehler: "docId ist nötig." });
      return;
    }
    const { docId } = eingabe.data;
    const eingangStoragePath = eingangPfad(uid, docId);
    const datei = getStorage().bucket().file(eingangStoragePath);

    // Idempotenter Retry - ein FRUEHERER Versuch kann
    // die Datei bereits erfolgreich kopiert UND den Eintrag geschrieben haben,
    // aber beim anschliessenden Aufraeumen (Eingangs-Objekt loeschen,
    // ausstehend vergessen) gescheitert oder abgebrochen sein (Crash/Timeout).
    // Statt alles von vorn zu pruefen (das Eingangs-Objekt kann dann bereits
    // fehlen), wird der BESTEHENDE Eintrag einfach zurueckgegeben und das
    // Aufraeumen best-effort nachgeholt - kein erneutes Kopieren/Registrieren.
    const bestehenderEintrag = (await ladeUnterlagen(uid)).find((e) => e.docId === docId);
    if (bestehenderEintrag) {
      await loescheStillschweigendUnterlage(datei);
      try {
        await vergissAusstehendeUnterlage(uid, docId);
      } catch (fehler) {
        logger.error("kontoUnterlageRegistrieren: ausstehender Eintrag konnte nicht entfernt werden", {
          name: (fehler as Error).name,
        });
      }
      res.status(200).json(unterlageSicht(bestehenderEintrag));
      return;
    }

    const ausstehend = await ladeAusstehendeUnterlage(uid, docId);
    if (!ausstehend) {
      res.status(400).json({
        fehler: "Zu dieser docId liegt keine angeforderte Unterlage vor - bitte fordere zuerst eine Upload-URL an.",
      });
      return;
    }

    const [existiert] = await datei.exists();
    if (!existiert) {
      // Kein Objekt zum Loeschen - nur den ausstehend-Eintrag entfernen.
      try {
        await vergissAusstehendeUnterlage(uid, docId);
      } catch (fehler) {
        logger.error("kontoUnterlageRegistrieren: ausstehender Eintrag konnte nicht entfernt werden", {
          name: (fehler as Error).name,
        });
      }
      res.status(400).json({ fehler: "Zu dieser docId liegt keine Datei - lade sie zuerst hoch." });
      return;
    }

    // Weder Groesse noch Typ werden dem Client geglaubt - die ECHTEN
    // Storage-Metadaten zaehlen (wie mappeRegisterDocument). Die GENERATION
    // wird mitgenommen: sie bindet Byte-Pruefung UND
    // spaetere Kopie an GENAU dieses gepruefte Objekt.
    const [metadata] = await datei.getMetadata();
    const echteSizeBytes = Number(metadata.size ?? 0);
    const gepruefteGeneration = (metadata as { generation?: string | number }).generation;
    if (echteSizeBytes === 0) {
      await verwerfeEingangUndAusstehend(uid, docId, datei);
      res.status(400).json({ fehler: "Zu dieser docId liegt keine hochgeladene Datei - nur ein leerer Platzhalter." });
      return;
    }
    if (gepruefteGeneration === undefined || gepruefteGeneration === null || gepruefteGeneration === "") {
      // GCS liefert die Generation immer mit - fehlt sie, laesst sich die
      // Kopie nicht an das gepruefte Objekt binden. Nicht raten: 500,
      // Eingang/ausstehend bleiben fuer einen Retry stehen.
      throw new Error("Storage-Metadaten ohne Generation");
    }

    // Auf die gepruefte Generation GEPINNTES Objekt fuer Byte-
    // Pruefung UND Kopie. @google-cloud/storage 7.x (file.js, `copy`) schickt
    // `this.generation` als `sourceGeneration` an rewriteTo; `download` liest
    // mit `generation`. Wurde die Datei inzwischen erneut hochgeladen (neue
    // Generation, die alte ist ohne Versioning weg), scheitern beide mit 404.
    // NICHT `preconditionOpts.ifGenerationMatch` beim Kopieren: das bezieht
    // sich auf das ZIEL (`dokumente/{docId}`, existiert noch nicht) und liesse
    // jede Registrierung mit 412 scheitern.
    const gepruefteDatei = getStorage().bucket().file(eingangStoragePath, { generation: gepruefteGeneration });

    let head: Buffer;
    try {
      [head] = await gepruefteDatei.download({ start: 0, end: 15 });
    } catch (fehler) {
      if (istQuelleUeberholt(fehler)) {
        await verwerfeEingangUndAusstehend(uid, docId, datei);
        res.status(400).json({ fehler: DATEI_GEAENDERT });
        return;
      }
      throw fehler;
    }
    const erkannterTyp = erkenneTyp(new Uint8Array(head));
    if (!erkannterTyp) {
      await verwerfeEingangUndAusstehend(uid, docId, datei);
      res.status(400).json({ fehler: "Erlaubt sind PDF, JPEG und PNG." });
      return;
    }

    const jetzt = Date.now();
    const bestand = await bestandImBucket(uid, jetzt, eingangStoragePath);
    const erlaubt = pruefeNeueUnterlage({ art: ausstehend.art, contentType: erkannterTyp, sizeBytes: echteSizeBytes }, bestand);
    if (!erlaubt.ok) {
      await verwerfeEingangUndAusstehend(uid, docId, datei);
      res.status(400).json({ fehler: erlaubt.fehler });
      return;
    }

    // Erst JETZT (nach vollstaendiger Pruefung) an den
    // endgueltigen Pfad kopieren - der erkannte Typ (aus den echten Bytes)
    // ueberschreibt dabei das vom Client deklarierte Content-Type-Metadatum.
    // Kopiert wird vom GEPINNTEN Objekt (`sourceGeneration`, s. oben) - ein
    // erneutes PUT durch dieselbe (noch gueltige) signierte URL zwischen
    // Pruefung und Kopie laesst die Kopie mit 404 scheitern, statt ungepruefte
    // Bytes durchzulassen.
    const zielDatei = getStorage().bucket().file(unterlagenPfad(uid, docId));
    try {
      await gepruefteDatei.copy(zielDatei, { contentType: erkannterTyp });
    } catch (fehler) {
      if (istQuelleUeberholt(fehler)) {
        await verwerfeEingangUndAusstehend(uid, docId, datei);
        res.status(400).json({ fehler: DATEI_GEAENDERT });
        return;
      }
      throw fehler;
    }

    const eintrag: UnterlageEintrag = {
      docId,
      art: ausstehend.art,
      dateiname: ausstehend.dateiname,
      contentType: erkannterTyp,
      sizeBytes: echteSizeBytes,
      hochgeladenAm: Timestamp.fromMillis(jetzt),
    };
    // ERST den Eintrag schreiben, DANN das Eingangs-Objekt loeschen -
    // schlaegt das Schreiben fehl, bleibt sonst eine kopierte, aber nirgends
    // verzeichnete Datei liegen.
    // Schlaegt registriereUnterlage fehl, wird die Kopie best-effort
    // zurueckgerollt und Eingang/ausstehend bleiben bestehen, damit ein
    // Retry moeglich ist (s. Idempotenz-Pruefung oben) - der Fehler wird
    // weitergereicht, `kontoEndpunkt` antwortet dann mit 500.
    try {
      await registriereUnterlage(uid, eintrag);
    } catch (fehler) {
      await loescheStillschweigendUnterlage(zielDatei);
      throw fehler;
    }

    await loescheStillschweigendUnterlage(datei);
    try {
      await vergissAusstehendeUnterlage(uid, docId);
    } catch (fehler) {
      // Die Registrierung selbst ist bereits geschrieben - ein liegen
      // gebliebener ausstehend-Eintrag ist harmlos (s. kontoStore.ts).
      logger.error("kontoUnterlageRegistrieren: ausstehender Eintrag konnte nicht entfernt werden", {
        name: (fehler as Error).name,
      });
    }

    res.status(200).json(unterlageSicht(eintrag));
  },
  KONTO_UNTERLAGEN_QUOTA,
  "kontoUnterlagen",
);

export const kontoUnterlagen = kontoEndpunkt("GET", "kontoUnterlagen", async (uid, _req, res) => {
  const unterlagen = await ladeUnterlagen(uid);
  res.status(200).json(unterlagen.map(unterlageSicht));
});

export const kontoUnterlageDownloadUrl = kontoEndpunkt("POST", "kontoUnterlageDownloadUrl", async (uid, req, res) => {
  const eingabe = unterlageDocIdSchema.safeParse(req.body ?? {});
  if (!eingabe.success) {
    res.status(400).json({ fehler: "docId ist nötig." });
    return;
  }
  const unterlagen = await ladeUnterlagen(uid);
  const eintrag = unterlagen.find((u) => u.docId === eingabe.data.docId);
  if (!eintrag) {
    res.status(404).json({ fehler: "Diese Unterlage gibt es nicht (mehr)." });
    return;
  }

  const [url] = await getStorage()
    .bucket()
    .file(unterlagenPfad(uid, eintrag.docId))
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + DOWNLOAD_URL_MINUTEN * 60_000,
      responseDisposition: contentDispositionUnterlage(eintrag.dateiname),
    });
  res.status(200).json({ url });
});

/**
 * Loescht sowohl eine REGISTRIERTE Unterlage als auch eine erst ANGEFORDERTE,
 * noch nicht registrierte - ein Bewerber, der eine
 * Upload-URL geholt, sich dann aber umentschieden hat, soll das Eingangs-
 * Objekt nicht dem stuendlichen Sweep ueberlassen muessen.
 */
export const kontoUnterlageLoeschen = kontoEndpunkt("POST", "kontoUnterlageLoeschen", async (uid, req, res) => {
  const eingabe = unterlageDocIdSchema.safeParse(req.body ?? {});
  if (!eingabe.success) {
    res.status(400).json({ fehler: "docId ist nötig." });
    return;
  }
  const { docId } = eingabe.data;

  await entferneUnterlage(uid, docId);

  const ausstehend = await ladeAusstehendeUnterlage(uid, docId);
  if (ausstehend) {
    const datei = getStorage().bucket().file(eingangPfad(uid, docId));
    await verwerfeEingangUndAusstehend(uid, docId, datei);
  }

  if (!(await loescheEigenePaketeOderMelde(uid, "kontoUnterlageLoeschen", res))) return;
  res.status(204).end();
});

// ─── Gefuehrte Bewerbung und Bewerbungspaket ────────────────────────────────
//
// Der Browser schickt der gefuehrten Bewerbung NIE Bewerberangaben - nur
// `pinstGuid`, gewaehlte Formular-/Ablage-`docId`s und die
// beiden Texte. Der Server liest `privat/angaben` selbst UND berechnet den
// Plan bei JEDER Anfrage neu (`kontoBewerbungsplan` UND vor jedem Paketbau) -
// nie dem Client geglaubt, der Plan koennte veraltet sein (z.B. eine seit dem
// letzten Laden geloeschte Unterlage).

/** Eigenes, deutlich engeres Kontingent als `KONTO_QUOTA` - Paketbau ist teuer (mehrere Downloads, PDF-Fuellung, ZIP). */
export const KONTO_PAKET_QUOTA: Quota = { capacity: 10, refillPerMinute: 5 };

/** 5 Minuten wie der Unterlagen-Download (`DOWNLOAD_URL_MINUTEN`) - dieselbe Ueberlegung, derselbe Wert. */
const PAKET_DOWNLOAD_URL_MINUTEN = DOWNLOAD_URL_MINUTEN;

interface GeladenerPlan {
  job: JobRecord;
  plan: Bewerbungsplan;
  /** Nur fuer den Paketbau noetig: liefert `sizeBytes` je Formular-Vorlage fuer die Groessen-Vorpruefung. */
  anforderungen: DocumentRequirementsResult;
  /** Einmal geladen, vom Paketbau wiederverwendet statt erneut gelesen. */
  angaben: AngabenRecord | null;
  /** dito - `ladeUnterlagen`s Ergebnis ist sowohl `plan.ablage` (Sicht) als auch die vollen Eintraege fuer den Paketbau. */
  ablage: UnterlageEintrag[];
}

/**
 * `email`: dieselbe Konto-Auth-E-Mail wie `fuellwerteAus` -
 * ohne sie wuerde `kontoBewerbungsplan` ein Formular als "E-Mail fehlt"
 * melden, obwohl der Paketbau die Auth-Mail anschliessend einsetzt.
 */
async function ladePlan(uid: string, pinstGuid: string, email: string | undefined): Promise<GeladenerPlan | "unbekannt"> {
  let job: JobRecord;
  try {
    job = await loadJobRecord(pinstGuid);
  } catch (fehler) {
    if (fehler instanceof JobNotFoundError) return "unbekannt";
    throw fehler;
  }
  const [anforderungen, angaben, unterlagen] = await Promise.all([
    getDocumentRequirements({ pinstGuid }, job),
    ladeAngaben(uid),
    ladeUnterlagen(uid),
  ]);
  const stelle = {
    pinstGuid: job.pinstGuid,
    refCode: job.refCode,
    titel: job.title,
    bewerbungsschluss: job.applicationEnd,
    bewerbungsschlussText: bewerbungsschlussText(job.applicationEnd, bewerbungJederzeitFuerJob(job)),
    aktiv: job.active,
  };
  return {
    job,
    anforderungen,
    angaben,
    ablage: unterlagen,
    plan: baueBewerbungsplan(anforderungen, stelle, angaben, unterlagen, email),
  };
}

const STELLE_UNBEKANNT_FEHLER = "Diese Stelle gibt es nicht (mehr).";
const STELLE_INAKTIV_FEHLER = "Diese Stelle ist nicht mehr ausgeschrieben.";

/**
 * Dieselbe Formulierung wie im Web (features/bewerben/lib/formular-luecken.ts):
 * ohne diese drei Angaben fuellt der Server kein Formular, auch nicht mit
 * `luekenAkzeptiert` - der Bewerber muss sie ergaenzen, nicht von Hand eintragen.
 */
const KERN_LUECKEN_SATZ = "Name, Vorname und Geburtsdatum brauchen wir in jedem Fall. Ergänze sie bitte in „Meine Angaben“.";

// `kontoEndpunktMitAnmeldung` statt `kontoEndpunkt` - die
// Konto-Auth-E-Mail muss in den Plan einfliessen (s. `ladePlan`), sonst
// meldet der Plan ein E-Mail-Feld als fehlend, das der Paketbau anschliessend
// klaglos aus derselben Quelle fuellt.
export const kontoBewerbungsplan = kontoEndpunktMitAnmeldung("GET", "kontoBewerbungsplan", async ({ uid, email }, req, res) => {
  if (bewerberdatenAbgeschaltet(res)) return;
  const pruefung = pruefePinstGuidAbfrage(req.query.pinstGuid);
  if (!pruefung.ok) {
    res.status(400).json({ fehler: pruefung.fehler });
    return;
  }
  const geladen = await ladePlan(uid, pruefung.wert, email ?? undefined);
  if (geladen === "unbekannt") {
    res.status(404).json({ fehler: STELLE_UNBEKANNT_FEHLER });
    return;
  }
  res.status(200).json(geladen.plan);
});

export const kontoBewerbungspaketBauen = kontoEndpunktMitAnmeldung(
  "POST",
  "kontoBewerbungspaketBauen",
  async ({ uid, email }, req, res) => {
    if (bewerberdatenAbgeschaltet(res)) return;
    const koerper = (req.body ?? {}) as Record<string, unknown>;
    const pinstPruefung = pruefePinstGuidAbfrage(koerper.pinstGuid);
    if (!pinstPruefung.ok) {
      res.status(400).json({ fehler: pinstPruefung.fehler });
      return;
    }

    const geladen = await ladePlan(uid, pinstPruefung.wert, email ?? undefined);
    if (geladen === "unbekannt") {
      res.status(404).json({ fehler: STELLE_UNBEKANNT_FEHLER });
      return;
    }
    // `angaben`/`ablage` kommen aus demselben Laden wie der Plan - kein
    // zweiter `ladeAngaben`/`ladeUnterlagen`-Aufruf.
    const { job, plan, anforderungen, angaben, ablage: eigeneUnterlagen } = geladen;
    if (!plan.stelle.aktiv) {
      res.status(400).json({ fehler: STELLE_INAKTIV_FEHLER });
      return;
    }

    // `pinstGuid` gehoert nicht zum strikten Schema von `pruefePaketAnfrage` -
    // sie wird hier separat gebraucht (fuer `ladePlan`) und deshalb VOR der
    // Pruefung aus dem restlichen Koerper entfernt.
    const { pinstGuid: _pinstGuid, ...restKoerper } = koerper;
    const pruefung = pruefePaketAnfrage(restKoerper, plan);
    if (!pruefung.ok) {
      res.status(400).json({ fehler: pruefung.fehler });
      return;
    }
    const { formulare, unterlagen: unterlagenDocIds, anschreiben, lebenslauf, luekenAkzeptiert } = pruefung.wert;

    let werte: BewerbungsbogenFillValues | undefined;
    if (formulare.length > 0) {
      const fuellErgebnis = fuellwerteAus(angaben, plan.stelle, email ?? undefined);
      if ("fehlend" in fuellErgebnis) {
        res.status(400).json({ fehler: `Für dieses Formular fehlen noch: ${fuellErgebnis.fehlend.join(", ")}. ${KERN_LUECKEN_SATZ}` });
        return;
      }
      werte = fuellErgebnis.werte;

      // Die Kernfelder oben reichen NICHT - ein Formular kann weitere
      // Pflichtfelder verlangen (PLZ, Straße, mit Einwilligung
      // Staatsangehoerigkeit). Vorab-Pruefung mit der PLAN-Vorschau, VOR jedem
      // Download - schnell scheitern statt ein Formular mit leeren
      // Pflichtfeldern zu fuellen und mit 200 auszuliefern; ein solcher stiller
      // Fehlschlag faellt dem Bewerber sonst nicht auf.
      const planLuecken = formulare.map((docId) => {
        const eintrag = plan.formulare.find((f) => f.docId === docId);
        return { titel: eintrag?.titel ?? docId, fehlendeAngaben: eintrag?.fehlendeAngaben ?? [] };
      });
      const planLuekenFehler = pruefeFormularLuecken(planLuecken, luekenAkzeptiert === true);
      if (planLuekenFehler) {
        res.status(400).json({ fehler: planLuekenFehler });
        return;
      }
    }

    // Groessen-VORPRUEFUNG mit bereits bekannten/geschaetzten Werten, VOR
    // jedem Download - eine grob zu grosse Anfrage soll nicht erst nach dem
    // Herunterladen mehrerer Megabyte scheitern. Vorlagen-Groessen stehen
    // schon in `anforderungen.bewerbungsboegen` (kein Zusatz-Read), Ablage-
    // Groessen kommen aus den geladenen Unterlagen; Text-Zeichenlaenge als
    // grobe Byte-Schaetzung (die echte PDF-Groesse steht erst nach dem
    // Rendern fest, ist aber bei <= 20.000 Zeichen immer klein).
    const vorabGroessen = [
      ...formulare.map((docId) => anforderungen.bewerbungsboegen.find((b) => b.docId === docId)?.sizeBytes ?? 0),
      ...unterlagenDocIds.map((docId) => eigeneUnterlagen.find((u) => u.docId === docId)?.sizeBytes ?? 0),
      ...(anschreiben ? [anschreiben.length] : []),
      ...(lebenslauf ? [lebenslauf.length] : []),
    ];
    const vorabPruefung = pruefePaketGroesse(vorabGroessen);
    if (!vorabPruefung.ok) {
      res.status(400).json({ fehler: vorabPruefung.fehler });
      return;
    }

    // Vorlagen mit Storage-Pfad nur laden, wenn tatsaechlich ein Formular
    // ausgefuellt werden soll (`getDocumentRequirements` liefert keinen
    // Storage-Pfad - der ist fuer den Client irrelevant, hier aber noetig).
    const gespeicherteDokumente = formulare.length > 0 ? await loadJobDocuments(job.dokumente ?? []) : [];

    // In-Memory-Bytes fuer alles, was gerade erst entsteht (gefuelltes
    // Formular, Anschreiben-/Lebenslauf-PDF) - `baueZip`s `leseDatei` schaut
    // zuerst hier nach, bevor sie echten Storage-Zugriff versucht (s. unten).
    // Ablage-Unterlagen liegen dagegen bereits in Storage und werden dort
    // gelesen, nicht hier zwischengespeichert.
    const speicher = new Map<string, Uint8Array>();
    const eintraege: PaketDokumentEingabe[] = [];
    // Die ECHTEN, nach dem Fuellen gemeldeten Luecken
    // (`fillBewerbungsbogen`s `fehlendeAngaben`) statt nur der Plan-Vorschau -
    // die Vorlage kann in seltenen Faellen von der Plan-Annahme abweichen.
    // Werden genauso behandelt (400 ohne `luekenAkzeptiert`); im Merkzettel
    // stehen sie, wenn akzeptiert, ueber `vonHand` (unten).
    const echteLuecken: { titel: string; fehlendeAngaben: string[] }[] = [];
    // Fuer den Merkzettel: je Bogen, was der Bewerber von Hand ergaenzt - die
    // Felder, die wir nie fuellen, plus dieselben echten Luecken (s.
    // mappe/merkzettel.ts). Nur Feldnamen.
    const vonHand: VonHandFormular[] = [];
    const laufbahngruppen = laufbahngruppenDerStelle(job);

    for (const docId of formulare) {
      const vorlage = gespeicherteDokumente.find((d) => d.docId === docId);
      if (!vorlage) {
        // Kann nur passieren, wenn sich die Ausschreibung zwischen Plan- und
        // Paket-Aufruf veraendert hat - `pruefePaketAnfrage` hat den docId
        // gerade erst gegen den FRISCH berechneten Plan geprueft.
        throw new Error("Formular-Vorlage nicht gefunden, obwohl der Plan sie soeben als ausfüllbar auswies");
      }
      const titel = plan.formulare.find((f) => f.docId === docId)?.titel ?? vorlage.attHeader;
      let ergebnis: Awaited<ReturnType<typeof fillBewerbungsbogen>>;
      try {
        ergebnis = await fillBewerbungsbogen(
          await readStoredDocument(vorlage.storagePath),
          werte as BewerbungsbogenFillValues,
          vorlage.attHeader,
        );
      } catch (fehler) {
        if (!(fehler instanceof BewerbungsbogenTemplateChangedError)) throw fehler;
        res.status(400).json({
          fehler: `Den Vordruck „${titel}“ können wir gerade nicht ausfüllen. Fülle ihn bitte selbst aus und lade ihn als Unterlage hoch.`,
        });
        return;
      }
      const labels = feldnamenFuer(ergebnis.fehlendeAngaben);
      if (labels.length > 0) echteLuecken.push({ titel, fehlendeAngaben: labels });
      for (const eintrag of vonHandFuerFormulare(
        [{ attHeader: vorlage.attHeader, fehlendeAngaben: ergebnis.fehlendeAngaben }],
        laufbahngruppen,
      )) {
        vonHand.push({ ...eintrag, formular: titel });
      }

      const speicherPfad = `speicher:formular:${docId}`;
      speicher.set(speicherPfad, ergebnis.bytes);
      eintraege.push({
        docId,
        art: "formular",
        // Aus dem Formulartitel statt fuer jeden Bogen gleich - bei mehreren
        // Boegen haengt paketVerzeichnis den Namen an die Nummer an.
        dateiname: sichererDateiname(`${titel}.pdf`),
        storagePath: speicherPfad,
        contentType: "application/pdf",
        sizeBytes: ergebnis.bytes.byteLength,
        herkunft: "formular",
      });
    }

    // Dieselbe Pruefung wie oben, jetzt mit den ECHTEN Luecken - faengt den
    // Fall ab, dass die Vorlage von der Plan-Vorschau abweicht.
    const echtLuekenFehler = pruefeFormularLuecken(echteLuecken, luekenAkzeptiert === true);
    if (echtLuekenFehler) {
      res.status(400).json({ fehler: echtLuekenFehler });
      return;
    }

    for (const docId of unterlagenDocIds) {
      const eintrag = eigeneUnterlagen.find((u) => u.docId === docId);
      if (!eintrag) {
        throw new Error("Unterlage nicht gefunden, obwohl der Plan sie soeben noch auswies");
      }
      eintraege.push({
        docId: eintrag.docId,
        art: eintrag.art,
        dateiname: eintrag.dateiname,
        storagePath: unterlagenPfad(uid, eintrag.docId),
        contentType: eintrag.contentType,
        sizeBytes: eintrag.sizeBytes,
        herkunft: "upload",
      });
    }

    const texteImPaket: string[] = [];
    if (anschreiben) {
      const bytes = await textZuPdf("Anschreiben", anschreiben);
      const speicherPfad = "speicher:text:anschreiben";
      speicher.set(speicherPfad, bytes);
      eintraege.push({
        docId: neuerEinmalToken(),
        art: "anschreiben",
        dateiname: "Anschreiben.pdf",
        storagePath: speicherPfad,
        contentType: "application/pdf",
        sizeBytes: bytes.byteLength,
        herkunft: "client",
      });
      texteImPaket.push("anschreiben");
    }
    if (lebenslauf) {
      const bytes = await textZuPdf("Lebenslauf", lebenslauf);
      const speicherPfad = "speicher:text:lebenslauf";
      speicher.set(speicherPfad, bytes);
      eintraege.push({
        docId: neuerEinmalToken(),
        art: "lebenslauf",
        dateiname: "Lebenslauf.pdf",
        storagePath: speicherPfad,
        contentType: "application/pdf",
        sizeBytes: bytes.byteLength,
        herkunft: "client",
      });
      texteImPaket.push("lebenslauf");
    }

    // Zweite, jetzt EXAKTE Groessenpruefung als Sicherheitsnetz - die
    // Vorpruefung oben arbeitete mit Vorlagen-/Schaetzgroessen, die tatsaechlich
    // erzeugten Bytes koennen (leicht) abweichen.
    const echtePruefung = pruefePaketGroesse(eintraege.map((e) => e.sizeBytes));
    if (!echtePruefung.ok) {
      res.status(400).json({ fehler: echtePruefung.fehler });
      return;
    }

    // Sicherheitsnetz: die Paketseite setzt bekannte Platzhalter schon im
    // Browser ein - was danach noch in Klammern steht, nennt der Merkzettel.
    // Nur die Namen, nie der Text (s. lib/platzhalter.ts).
    const platzhalter = [
      { ort: "Im Anschreiben", platzhalter: findePlatzhalter(anschreiben ?? "") },
      { ort: "Im Lebenslauf", platzhalter: findePlatzhalter(lebenslauf ?? "") },
    ];
    // Der Zettel nennt die Vordrucke unter ihrem Namen im ZIP ("03_Bewerbungsbogen.pdf") -
    // dieselbe Benennung, die `baueZip` gleich verwendet.
    const paketDokumente = baueMappenDokumente(eintraege);
    const zipNamen = Object.fromEntries(paketVerzeichnis(paketDokumente).map((e) => [e.docId, e.nameImZip]));
    // Links auf unsere Kopien, fuer Vordrucke wie "Anlage 1 zum Bewerbungsbogen".
    const linkJeAnhang = new Map(anforderungen.documents.map((d) => [d.docId, d.downloadUrl]));
    const merkzettelText = merkzettel(
      plan,
      { formulare, unterlagen: unterlagenDocIds, texte: texteImPaket, vonHand, platzhalter, zipNamen },
      "die in der Ausschreibung genannte Ansprechperson",
      {
        anhaenge: (job.dokumente ?? []).map((anhang) => {
          const downloadUrl = linkJeAnhang.get(anhang.docId);
          return { docId: anhang.docId, attHeader: anhang.attHeader, ...(downloadUrl ? { downloadUrl } : {}) };
        }),
        bewerbungJederzeit: bewerbungJederzeitFuerJob(job),
      },
    );

    // `new Uint8Array(bytes)` mit einem Buffer als Argument
    // KOPIERT die Bytes (die Uint8Array-Konstruktor-Ueberladung fuer ein
    // ArrayBufferView kopiert Element fuer Element) - eine reine VIEW auf
    // denselben ArrayBuffer (`buffer`/`byteOffset`/`byteLength`) spart diese
    // Kopie bei potenziell mehreren Megabyte grossen Ablage-Dateien.
    const leseDatei = async (storagePath: string): Promise<Uint8Array> => {
      const ausSpeicher = speicher.get(storagePath);
      if (ausSpeicher) return ausSpeicher;
      const [bytes] = await getStorage().bucket().file(storagePath).download();
      return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    };

    const zipBytes = await baueZip(paketDokumente, merkzettelText, leseDatei);

    // ERST das neue Paket speichern, DANN alle ANDEREN
    // eigenen Pakete loeschen - ein `deleteFiles({prefix})` VOR dem Speichern
    // haette bei zwei parallelen Baueintraegen desselben Kontos die Datei des
    // jeweils ANDEREN, gerade fertig gewordenen Laufs mit geloescht (Race).
    // Mit dieser Reihenfolge kann hoechstens ein "zu junges" Paket eines
    // parallelen Laufs kurzzeitig liegen bleiben - beim naechsten Bau wird es
    // ohnehin erfasst, und der stuendliche Sweep raeumt es spaetestens ab.
    const paketId = neuerEinmalToken();
    const paketPfad = `${PAKET_PRAEFIX(uid)}${paketId}.zip`;
    // `Buffer.from(zipBytes)` (Uint8Array-Argument) kopiert
    // ebenfalls - `zipBytes.buffer/byteOffset/byteLength` liefert stattdessen
    // eine Buffer-VIEW auf denselben Speicher.
    await getStorage()
      .bucket()
      .file(paketPfad)
      .save(Buffer.from(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength), {
        contentType: "application/zip",
        resumable: false,
      });

    await loescheEigenePakete(uid, paketPfad);

    const dateiname = paketDateiname(plan.stelle.refCode);
    const [url] = await getStorage()
      .bucket()
      .file(paketPfad)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + PAKET_DOWNLOAD_URL_MINUTEN * 60_000,
        responseDisposition: contentDispositionUnterlage(dateiname),
      });

    res.status(200).json({ url, dateiname });
  },
  KONTO_PAKET_QUOTA,
  "kontoPaket",
  { memory: "1GiB", timeoutSeconds: 120 },
);

// ─── Export (Art. 15/20 DSGVO) ──────────────────────────────────────────────

const UNTERLAGEN_EXPORT_HINWEIS =
  "Die Dateien selbst sind hier nicht enthalten. Lade sie einzeln auf 'Mein Konto' herunter.";

export interface KontoExport {
  konto: {
    suchprofile: SuchprofilSicht[];
    merkliste: GemerkteStelleSicht[];
    benachrichtigung: { aktiv: boolean };
  };
  angaben: AngabenExportSicht;
  unterlagen: { hinweis: string; verzeichnis: UnterlageSicht[] };
  email: string | null;
}

/**
 * Reine Zusammenstellung des Exports - kein Firestore-/Storage-Zugriff,
 * direkt testbar. Nimmt NICHT die volle `KontoSicht` (die traegt
 * `optionen`, die statische Auswahlliste des Formulars, nichts
 * Nutzerbezogenes) und baut `benachrichtigung` schlank auf `{ aktiv }`
 * zurueck - `emailBestaetigt` ist hier nicht noetig, weil `email` bereits als
 * eigenes Top-Level-Feld steht (aus dem geprueften ID-Token, nie aus
 * Firestore, s. `kontoAuth.anmeldungAusAnfrage`). Weder `abmeldeToken` noch
 * `gemeldet` tauchen ueberhaupt erst auf: die liefert `ladeReinLesend`
 * gar nicht erst mit (s. `kontoStore.sicht`). `angaben` ist die
 * EXPORT-Sicht (`angabenExportSicht`) - traegt
 * zusaetzlich die Textversion der Staatsangehoerigkeits-Einwilligung neben
 * dem Zeitpunkt.
 */
export function baueExport(
  konto: {
    suchprofile: SuchprofilSicht[];
    merkliste: GemerkteStelleSicht[];
    benachrichtigungAktiv: boolean;
  },
  angaben: AngabenExportSicht,
  unterlagen: UnterlageSicht[],
  email: string | null,
): KontoExport {
  return {
    konto: {
      suchprofile: konto.suchprofile,
      merkliste: konto.merkliste,
      benachrichtigung: { aktiv: konto.benachrichtigungAktiv },
    },
    angaben,
    unterlagen: { hinweis: UNTERLAGEN_EXPORT_HINWEIS, verzeichnis: unterlagen },
    email,
  };
}

export const kontoExport = kontoEndpunktMitAnmeldung("GET", "kontoExport", async ({ uid, emailBestaetigt, email }, _req, res) => {
  const jetzt = Date.now();
  // `ladeReinLesend` statt `ladeOderLegeAn` - ein reiner
  // Lesevorgang (Art. 15 DSGVO) darf kein Konto anlegen, das vorher nicht da
  // war.
  const [kontoSicht, angabenRecord, unterlagen] = await Promise.all([
    ladeReinLesend(uid, jetzt, emailBestaetigt),
    ladeAngaben(uid),
    ladeUnterlagen(uid),
  ]);
  const werte = baueExport(
    {
      suchprofile: kontoSicht.suchprofile,
      merkliste: kontoSicht.merkliste,
      benachrichtigungAktiv: kontoSicht.benachrichtigung.aktiv,
    },
    angabenExportSicht(angabenRecord),
    unterlagen.map(unterlageSicht),
    email,
  );
  res.setHeader("Content-Disposition", 'attachment; filename="meine-daten.json"');
  res.status(200).json(werte);
});

// ─── Abbestellen (ohne Anmeldung) ───────────────────────────────────────────
//
// WOZU EIN EIGENES KONTINGENT: dieser Endpunkt ist der einzige Konto-Endpunkt,
// an dem ein Angreifer etwas RATEN kann (uid + 128-Bit-Token, s.
// mappe/mappeId.ts). Gegen Raten hilft die Drosselung rechnerisch nichts, aber
// 15 Versuche/Minute je IP machen es auch nicht schlimmer als das Raten selbst -
// dieselbe Ueberlegung wie bei MAPPE_DOWNLOAD_QUOTA in mappeHttp.ts. Derselbe
// `drossel`, aber ein eigener `kind`-Namensraum, damit dieser Endpunkt nicht
// das Kontingent der angemeldeten Konto-Endpunkte teilt (oder umgekehrt).
export const KONTO_ABBESTELLEN_QUOTA: Quota = { capacity: 15, refillPerMinute: 15 };

/**
 * Escaped fuer den Gebrauch in einem HTML-Attribut -
 * verteidigt sich selbst dann, wenn `pruefeAbbestellParameter` seine
 * Zeichenbeschraenkung je verlieren sollte.
 */
function escapeAttribut(wert: string): string {
  return wert.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Schlichte, deutsche HTML-Seite ohne externe Ressourcen - `noindex`, damit
 * kein Crawler diesen Link jemals von irgendwo aufsammelt und aufruft.
 * Dieselbe neutrale Seite fuer "unbekanntes Konto", "falsches Token" und "nie
 * eingeschaltet" (s. bestaetigeAbbestellung) - kein Unterschied, aus dem sich
 * auf die Existenz eines Kontos schliessen liesse.
 */
const ABBESTELL_SEITEN: Record<"abgemeldet" | "ungueltig" | "fehler", { titel: string; text: string }> = {
  abgemeldet: { titel: "Abgemeldet", text: "Du bekommst keine Benachrichtigungen mehr." },
  ungueltig: { titel: "Link ungültig", text: "Dieser Link ist nicht mehr gültig." },
  fehler: { titel: "Nicht abgemeldet", text: UNERWARTETER_FEHLER },
};

function abbestellSeite(ergebnis: "abgemeldet" | "ungueltig" | "fehler"): string {
  const { titel, text } = ABBESTELL_SEITEN[ergebnis];
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${titel} – Better Bewerbungsportal</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 64px auto; padding: 0 16px; color: #1a1a1a; }
  a { color: #0a3d62; }
</style>
</head>
<body>
<h1>${titel}</h1>
<p>${text}</p>
<p><a href="${PUBLIC_SITE_URL}/dashboard/konto">Mein Konto</a></p>
</body>
</html>
`;
}

/**
 * GET zeigt nur DIESE Bestaetigungsseite, keine Aktion: Mail-Sicherheitsscanner (Microsoft Safe Links, Mimecast,
 * Proofpoint, Virenscanner) rufen jeden Link in einer eingehenden Mail vorab
 * ab. Wuerde GET selbst abbestellen, waere schon die erste Benachrichtigungs-
 * mail lautlos die letzte. Das Formular postet auf dieselbe URL zurueck (k/t
 * bleiben in der Action-Query) - erst DAS loest tatsaechlich ab.
 * `uid` und `token` kommen bereits aus `pruefeAbbestellParameter` (nur
 * `[A-Za-z0-9_-]`), werden hier trotzdem escaped - Verteidigung in der Tiefe,
 * nicht Vertrauen in die Regex an dieser zweiten Stelle.
 */
function abbestellBestaetigungsSeite(uid: string, token: string): string {
  const aktionUrl = `?k=${escapeAttribut(uid)}&t=${escapeAttribut(token)}`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Benachrichtigungen abbestellen – Better Bewerbungsportal</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 64px auto; padding: 0 16px; color: #1a1a1a; }
  button { font: inherit; padding: 10px 20px; background: #0a3d62; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; }
</style>
</head>
<body>
<h1>Benachrichtigungen abbestellen</h1>
<p>Klicke auf den Knopf, um keine Mails mehr über neue passende Stellen zu bekommen.</p>
<form method="post" action="${aktionUrl}">
<button type="submit">Benachrichtigungen abbestellen</button>
</form>
</body>
</html>
`;
}

/** Erster (moeglicherweise einziger) Header-Wert - `content-type` kommt praktisch nie als Array. */
function ersterHeaderWert(wert: string | string[] | undefined): string | undefined {
  return Array.isArray(wert) ? wert[0] : wert;
}

/**
 * Abbestellen ohne Anmeldung - NICHT hinter `kontoEndpunkt`/
 * `kontoEndpunktMitAnmeldung` (die verlangen ein ID-Token).
 *
 * GET liest und schreibt NICHTS (s. `abbestellBestaetigungsSeite`) - nur
 * Formpruefung von `k`/`t`, kein Firestore-Zugriff. POST fuehrt das
 * eigentliche Abbestellen aus: der RFC-8058-One-Click-POST eines
 * Mail-Anbieters (`istOneClickAnfrage`) bekommt 200 mit leerem Koerper, ein
 * Browser-Formular-POST bekommt die Ergebnisseite. Scheitert das Schreiben
 * selbst, antworten beide mit 500 - der Browser mit der neutralen Fehlerseite. `k`/`t` kommen in BEIDEN
 * Faellen aus der Query (das Formular traegt sie in der Action-URL, nicht als
 * eigene Felder).
 */
export const kontoAbbestellen = onRequest(OPTIONEN, async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).send("Nur GET oder POST.");
    return;
  }
  const istPost = req.method === "POST";
  const schluessel = clientKeyFromForwardedFor(req.headers["x-forwarded-for"], req.socket?.remoteAddress);
  const entscheidung = drossel.check(schluessel, KONTO_ABBESTELLEN_QUOTA, "kontoAbbestellen");
  if (!entscheidung.allowed) {
    res.set("Retry-After", String(entscheidung.retryAfterSeconds));
    const meldung = `Zu viele Anfragen. Bitte in ${entscheidung.retryAfterSeconds} Sekunden erneut versuchen.`;
    // Ein gedrosseltes POST darf NICHT stillschweigend
    // als "erledigt" durchgehen - ein echtes One-Click-Abbestellen von einer
    // geteilten Provider-IP ginge sonst unbemerkt verloren. 429 statt
    // 200/leer, mit Retry-After (der Mail-Client wiederholt dann selbst).
    res.status(429).send(meldung);
    return;
  }

  const pruefung = pruefeAbbestellParameter(req.query.k, req.query.t);

  if (!istPost) {
    res
      .status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(pruefung.ok ? abbestellBestaetigungsSeite(pruefung.wert.uid, pruefung.wert.token) : abbestellSeite("ungueltig"));
    return;
  }

  const einKlick = istOneClickAnfrage(ersterHeaderWert(req.headers["content-type"]), req.body);

  if (!pruefung.ok) {
    if (einKlick) {
      res.status(200).end();
      return;
    }
    res.status(200).set("Content-Type", "text/html; charset=utf-8").send(abbestellSeite("ungueltig"));
    return;
  }

  try {
    const ergebnis = await bestaetigeAbbestellung(pruefung.wert.uid, pruefung.wert.token, Date.now());
    if (einKlick) {
      res.status(200).end();
      return;
    }
    res.status(200).set("Content-Type", "text/html; charset=utf-8").send(abbestellSeite(ergebnis));
  } catch (fehler) {
    logger.error("kontoAbbestellen fehlgeschlagen", { name: (fehler as Error).name });
    // Ist das Schreiben selbst fehlgeschlagen, ist NICHT
    // abbestellt - ein 200 liesse den Mail-Anbieter glauben, es sei erledigt,
    // und er wiederholt nie. 500 in beiden Faellen, damit er es erneut versucht
    // bzw. der Bewerber sieht, dass es nicht geklappt hat.
    if (einKlick) {
      res.status(500).end();
      return;
    }
    res.status(500).set("Content-Type", "text/html; charset=utf-8").send(abbestellSeite("fehler"));
  }
});
