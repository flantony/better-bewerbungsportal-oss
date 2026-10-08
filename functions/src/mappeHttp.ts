import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { logger } from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { z } from "zod/v3";
import { ladeMappeRoh, entferneDokument, MappeNichtGefundenError } from "./mappe/mappeStore";
import {
  MAPPEN_COLLECTION,
  mappenPrefix,
  DOKUMENT_ARTEN,
  type MappeRecord,
  type MappenDokument,
} from "./mappe/mappeTypen";
import { pruefeUpload, erkenneTyp, MAX_DATEI_BYTES } from "./mappe/uploadRegeln";
import { EINMAL_TOKEN_REGEX, MAPPEN_ID_REGEX, neuerEinmalToken } from "./mappe/mappeId";
import { istAbgelaufen, aktivitaetsFelder } from "./mappe/ablauf";
import { PAKET_DATEINAME } from "./mappe/paket";
import { KEINE_AUSWEISKOPIE } from "./mappe/ausweiskopie";
import { clientKeyFromForwardedFor, createRateLimiter, type Quota } from "./lib/drosselung";
import { tokenPasst } from "./konto/benachrichtigung";
import { contentDispositionUnterlage, sichererDateiname } from "./konto/unterlagen";
import { paketDateiname } from "./konto/bewerbung";
import { ERLAUBTE_URSPRUENGE } from "./mcp/publicSite";

const REGION = "europe-west3";
const UPLOAD_URL_MINUTEN = 15;
/**
 * Nur die eigene Website darf diese Endpunkte aus dem Browser aufrufen
 * (kein `cors: true`). Der Download ist eine
 * Navigation und braucht kein CORS.
 */
const OPTIONEN = { region: REGION, cors: ERLAUBTE_URSPRUENGE, maxInstances: 10 };

const MAPPE_ABGELAUFEN_MELDUNG = "Diese Mappe ist abgelaufen. Mappen werden eine Stunde nach dem Paket gelöscht.";
/**
 * Fuer den BROWSER, nicht fuer die anfragende KI: derselbe Sachverhalt wie
 * `MappeNichtGefundenError`, aber ohne den Werkzeugnamen. Der Fehlertext des
 * Stores ist eine Anweisung an ein KI-Tool ("rufe
 * eroeffne_bewerbungsmappe erneut auf"); auf der Upload-Seite liest ihn ein
 * Mensch, und dort waere das Kauderwelsch.
 */
const MAPPE_UNBEKANNT_MELDUNG =
  "Diese Mappe gibt es nicht mehr - entweder ist die Stundenfrist um oder der Link stimmt nicht. " +
  "Bitte lass dir von deinem KI-Tool eine neue Mappe anlegen; du bekommst dann einen neuen Link.";
/**
 * Nach aussen NIE der rohe Fehlertext des Admin SDK - der kann einen
 * Storage-Pfad enthalten, und der Pfad traegt die mappenId. Serverseitig wird
 * nur der Fehlername geloggt, nie `.message`.
 */
const UNERWARTETER_FEHLER = "Da ist etwas schiefgelaufen. Bitte versuch es später erneut.";

// ─── Pro-IP-Drosselung ────────────────────────────────────────────────────
//
// WOZU: Diese vier Endpunkte sind oeffentlich und unauthentifiziert, und ueber
// sie laeuft der eigentliche Dateiverkehr der Mappe - Lebenslauf,
// Zeugniskopien. `mappeUploadUrl` legt bei JEDEM Aufruf ein Platzhalter-Objekt
// im Bucket an und stellt eine signierte URL aus, `mappeDownload` liest ein
// ganzes ZIP. Die Mengengrenzen (10 Dateien / 30 MB) binden pro Mappe, nicht
// pro Aufrufer - wer beliebig viele Mappen-Kennungen durchprobiert oder in
// einer Schleife URLs zieht, waere ohne Drosselung durch nichts gebremst als
// `maxInstances`. `DSFA.md` fuehrt die Drosselung als Minderung auf.
//
// Dieselbe Mechanik wie am MCP-Endpunkt (`lib/drosselung.ts`), insbesondere
// derselbe Schluessel: die IP kommt aus dem RECHTESTEN `X-Forwarded-For`-Wert,
// weil der Client links beliebige Werte anhaengen kann (s. dortiger
// Sicherheitskommentar). Gleiche Bauartgrenze wie dort: die Buckets liegen im
// Instanz-Speicher, bei `maxInstances: 10` ist das globale Limit also bis zu
// zehnmal so hoch.
const drossel = createRateLimiter();

/**
 * Upload-URL ausstellen, verzeichnen, loeschen - ein gemeinsames Kontingent,
 * weil es ein gemeinsamer Vorgang ist.
 *
 * Die Zahlen kommen aus dem laengsten legitimen Ablauf, nicht aus Sparsamkeit:
 * jede Datei kostet zwei Aufrufe (URL holen, dann verzeichnen), und eine Mappe
 * nimmt bis zu zehn Dateien - das sind 20 Aufrufe in schneller Folge, wenn ein
 * Bewerber seinen Stapel Zeugnisse hintereinander auswaehlt. Dazu die
 * Korrekturen, die der Normalfall sind (falsch eingescannt: loeschen, neu
 * hochladen). Burst 60 deckt das mit reichlich Luft ab, 30/Minute traegt
 * dauerhaft 15 Dateien je Minute - mehr, als ein Mensch scannen kann, und weit
 * unter dem, was eine Schleife braeuchte, um den Bucket zu fuellen.
 */
export const MAPPE_HTTP_QUOTA: Quota = { capacity: 60, refillPerMinute: 30 };

/**
 * Der Download ist strenger, aus einem anderen Grund als die Kosten: er ist der
 * einzige dieser Endpunkte, an dem ein Angreifer etwas RATEN kann (mappenId
 * plus Einmal-Token). Beide sind 128-Bit-Zufallswerte, gegen die Raten ohnehin
 * hoffnungslos ist - aber 15 Versuche je Minute je IP machen daraus auch
 * rechnerisch keinen Weg. Fuer den echten Gebrauch reicht es dreifach: der Link
 * gilt genau einmal, und ein Browser laedt ihn einmal.
 */
export const MAPPE_DOWNLOAD_QUOTA: Quota = { capacity: 15, refillPerMinute: 15 };

/**
 * Prueft die Drosselung und antwortet im Ueberschreitungsfall selbst.
 * Rueckgabe `true` heisst: der Aufrufer ist fertig, es wurde schon geantwortet.
 *
 * VOR der Schemapruefung aufgerufen: gedrosselt werden soll die
 * Anfrage, nicht die gueltige Anfrage - sonst kaeme ein Angreifer mit
 * absichtlich kaputten Bodies unbegrenzt oft durch.
 */
export function drosselungGreift(
  req: Pick<Request, "headers" | "socket">,
  res: Response,
  quota: Quota,
  art: string,
  alsJson: boolean,
): boolean {
  const schluessel = clientKeyFromForwardedFor(req.headers["x-forwarded-for"], req.socket?.remoteAddress);
  const entscheidung = drossel.check(schluessel, quota, art);
  if (entscheidung.allowed) return false;

  // Kein Logging der Kennung und keiner IP: fuer die Entscheidung braucht es
  // sie nicht, und beides ist hier geschuetzt (s. Kopfkommentare).
  res.set("Retry-After", String(entscheidung.retryAfterSeconds));
  const meldung = `Zu viele Anfragen. Bitte in ${entscheidung.retryAfterSeconds} Sekunden erneut versuchen.`;
  if (alsJson) res.status(429).json({ fehler: meldung });
  else res.status(429).send(meldung);
  return true;
}

/**
 * Kennungen nur im Format, das dieser Server ausstellt - geprueft VOR jedem
 * Firestore-/Storage-Zugriff. Ohne das wuerde eine `docId` wie "paket.zip" zu
 * einem Storage-Pfad: das fertige Paket liesse sich als Bewerbungsunterlage
 * verzeichnen, und "../" waere ein fremdes Praefix.
 */
const mappenIdFeld = z.string().regex(MAPPEN_ID_REGEX);
const docIdFeld = z.string().regex(EINMAL_TOKEN_REGEX);
/**
 * Der Name landet im ZIP - gekuerzt und gesaeubert wird er mit demselben Filter
 * wie Unterlagen im Konto (`sichererDateiname`, 120 Zeichen). Die Grenze hier
 * haelt nur Unsinn ab, ein langer echter Name wird gekuerzt statt abgelehnt.
 */
const dateinameFeld = z.string().min(1).max(1000);

const uploadUrlSchema = z.object({
  mappenId: mappenIdFeld,
  dateiname: dateinameFeld,
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().positive(),
});

const registerSchema = z.object({
  mappenId: mappenIdFeld,
  docId: docIdFeld,
  art: z.enum(DOKUMENT_ARTEN),
  dateiname: dateinameFeld,
  contentType: z.string().min(1).max(100),
});

/**
 * Eine Registrierung mit `art: "ausweiskopie"`. Wir nehmen keine an (s.
 * `mappe/ausweiskopie.ts`); `DOKUMENT_ARTEN` kennt die Art nicht.
 */
const ausweiskopieSchema = z.object({
  mappenId: mappenIdFeld,
  docId: docIdFeld,
  art: z.literal("ausweiskopie"),
});

const deleteSchema = z.object({
  mappenId: mappenIdFeld,
  docId: docIdFeld,
});

/**
 * Loggt nur den Fehlernamen (nie `.message` - der kann einen Storage-Pfad und
 * damit die mappenId tragen) und gibt nach aussen eine feste, harmlose
 * Meldung. `alsJson` unterscheidet die JSON-Endpunkte vom Download, der reinen
 * Text sendet.
 */
function antworteUnerwartet(res: Response, funktionsname: string, fehler: unknown, alsJson: boolean): void {
  logger.error(`${funktionsname} fehlgeschlagen`, { name: (fehler as Error).name });
  if (alsJson) res.status(500).json({ fehler: UNERWARTETER_FEHLER });
  else res.status(500).send(UNERWARTETER_FEHLER);
}

/**
 * "1x Download" laesst sich mit einer signierten URL nicht bauen - die gilt bis
 * zum Ablauf, beliebig oft. Deshalb pruefen wir selbst. Rein gehalten, damit die
 * Zusage testbar ist und nicht in einem Request-Handler verschwindet.
 */
export function pruefeDownloadToken(
  mappe: { zipGebautAm: number | null; letzteAktivitaetAm: number; heruntergeladenAm: number | null; einmalToken: string | null },
  token: string,
  jetzt: number,
): { ok: true } | { ok: false; grund: string } {
  if (istAbgelaufen(mappe, jetzt)) {
    return { ok: false, grund: MAPPE_ABGELAUFEN_MELDUNG };
  }
  if (mappe.heruntergeladenAm !== null || mappe.einmalToken === null) {
    return {
      ok: false,
      grund: "Dieser Link gilt nur einmal und wurde schon benutzt. Deine KI kann ein neues Paket anfordern.",
    };
  }
  // Konstante Zeit wie beim Abmelde-Token (s. konto/benachrichtigung.ts).
  if (!tokenPasst(mappe.einmalToken, token)) {
    return { ok: false, grund: "Dieser Link stimmt nicht." };
  }
  return { ok: true };
}

/**
 * Reine Kernlogik der Registrierung: prueft Ablauf und
 * Obergrenzen und ersetzt einen etwaigen Eintrag mit derselben docId, statt
 * ihn zu verdoppeln - eine zweite Registrierung derselben Datei laesst die
 * Mappe damit nicht wachsen. `bestand` kommt vom Aufrufer: die
 * Grenze zaehlt, was im BUCKET liegt, nicht was im Firestore-Verzeichnis
 * steht - sonst bleibt eine hochgeladene, nie registrierte Datei unsichtbar
 * fuer jede Zaehlung.
 */
export function pruefeRegistrierung(
  mappe: { dokumente: MappenDokument[]; zipGebautAm: number | null; letzteAktivitaetAm: number },
  dokument: MappenDokument,
  jetzt: number,
  bestand: { anzahl: number; summeBytes: number },
): { ok: true; dokumente: MappenDokument[] } | { ok: false; status: number; grund: string } {
  if (istAbgelaufen(mappe, jetzt)) {
    return { ok: false, status: 410, grund: MAPPE_ABGELAUFEN_MELDUNG };
  }
  const erlaubt = pruefeUpload({ contentType: dokument.contentType, sizeBytes: dokument.sizeBytes }, bestand);
  if (!erlaubt.ok) return { ok: false, status: 400, grund: erlaubt.grund };
  const rest = mappe.dokumente.filter((vorhanden) => vorhanden.docId !== dokument.docId);
  return { ok: true, dokumente: [...rest, dokument] };
}

/**
 * Zaehlt, was im Bucket LIEGT - nicht, was im Verzeichnis steht.
 *
 * WOZU: Wer `mappeRegisterDocument` nicht aufruft, bleibt im Verzeichnis
 * unsichtbar, seine Datei liegt aber im Bucket. Gegen `mappe.dokumente`
 * gerechnet greift dann keine Grenze, und `mappeUploadUrl` ist eine
 * gewoehnliche Cloud Function ohne die Drosselung des MCP-Endpunkts - ein
 * anonymer Aufrufer koennte sonst in beliebig vielen Anfragen beliebig viel
 * ablegen. Bei hoechstens zehn Dateien je Mappe ist der Listenaufruf billig.
 *
 * Das fertige Paket (`paket.zip`) liegt unter demselben Prefix und zaehlt
 * NICHT mit - sonst ginge es gegen die Grenze des Bewerbers. `ausgenommenPfad`
 * nimmt zusaetzlich die gerade betrachtete Datei selbst heraus (s.
 * `mappeRegisterDocument`: die liegt zu diesem Zeitpunkt schon im Bucket und
 * wird separat mit ihrer echten Groesse gegengerechnet).
 */
export async function bestandImBucket(
  mappenId: string,
  ausgenommenPfad?: string,
): Promise<{ anzahl: number; summeBytes: number }> {
  const paketPfad = `${mappenPrefix(mappenId)}${PAKET_DATEINAME}`;
  const [dateien] = await getStorage().bucket().getFiles({ prefix: mappenPrefix(mappenId) });
  const relevante = dateien.filter((datei) => datei.name !== paketPfad && datei.name !== ausgenommenPfad);
  return {
    anzahl: relevante.length,
    summeBytes: relevante.reduce((summe, datei) => summe + Number(datei.metadata.size ?? 0), 0),
  };
}

/**
 * Loescht eine hochgeladene, aber nicht verzeichnete Datei - und verschluckt
 * dabei niemals die Fehlerantwort, um derentwillen geloescht wird.
 *
 * WOZU: Die signierte Upload-URL gilt 15 Minuten und ueberlebt damit den Ablauf
 * der Mappe. Scheitert die Registrierung - geordnet (Grenze, Ablauf) ODER durch
 * einen geworfenen Fehler (Mappe inzwischen aufgeraeumt) -, liegt die Datei
 * unter einem Praefix, zu dem es kein Firestore-Dokument mehr gibt.
 * `raeumeMappenAuf` laeuft ueber Firestore-Treffer und findet sie nie wieder;
 * ohne diese Loeschung bliebe eine echte Bewerbungsdatei liegen.
 */
async function loescheStillschweigend(datei: ReturnType<ReturnType<ReturnType<typeof getStorage>["bucket"]>["file"]>) {
  try {
    await datei.delete({ ignoreNotFound: true });
  } catch (fehler) {
    // Nur der Fehlername, nie die Meldung (die traegt den Pfad und damit die mappenId).
    logger.error("mappeRegisterDocument: verwaiste Datei konnte nicht geloescht werden", {
      name: (fehler as Error).name,
    });
  }
}

function mappeDocRef(mappenId: string) {
  return getFirestore().collection(MAPPEN_COLLECTION).doc(mappenId);
}

/**
 * Liest, prueft und schreibt in EINER Transaktion. Ohne
 * das liesse sich dieselbe docId zweimal parallel registrieren, oder eine
 * knapp an der Obergrenze liegende Mappe durch zwei gleichzeitige Anfragen
 * ueber die 30-MB-Grenze bringen - beide laesen denselben (noch alten)
 * Bestand, bevor eine von ihnen schreibt.
 */
export async function registriereAtomar(
  mappenId: string,
  dokument: MappenDokument,
  jetzt: number,
  bestand: { anzahl: number; summeBytes: number },
): Promise<{ ok: true } | { ok: false; status: number; grund: string }> {
  const ref = mappeDocRef(mappenId);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new MappeNichtGefundenError();
    const mappe = snap.data() as MappeRecord;
    const ergebnis = pruefeRegistrierung(mappe, dokument, jetzt, bestand);
    if (!ergebnis.ok) return ergebnis;
    // zipGebautAm aus demselben Read - diese Registrierung aendert es nicht,
    // also ist der gelesene Wert weiterhin aktuell (ohne ihn wuerde
    // aktivitaetsFelder blind verlaengern).
    tx.update(ref, { dokumente: ergebnis.dokumente, ...aktivitaetsFelder(jetzt, mappe.zipGebautAm) });
    return { ok: true };
  });
}

/**
 * Prueft den Token UND verbraucht ihn in EINER Transaktion. Getrennt liefen
 * zwei gleichzeitige Anfragen mit demselben Token beide
 * durch die Pruefung, bevor eine den Vermerk schreibt - beide baekaemen das
 * Paket. Das ZIP selbst wird erst NACH dem Commit gelesen und gestreamt.
 *
 * Schreibt NUR heruntergeladenAm/einmalToken, NICHT
 * letzteAktivitaetAm/verfaelltAm: ein Download ist keine
 * Verlaengerung der Aufbewahrung. Sonst wuerde ein Abruf kurz vor der Frist
 * die Mappe erneut um eine Stunde verlaengern - "einmal abrufbar", nicht
 * "abrufen haelt frisch".
 */
export async function loeseDownloadEin(
  mappenId: string,
  token: string,
  jetzt: number,
): Promise<{ ok: true; mappe: MappeRecord } | { ok: false; status: number; grund: string }> {
  const ref = mappeDocRef(mappenId);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new MappeNichtGefundenError();
    const mappe = snap.data() as MappeRecord;
    const erlaubt = pruefeDownloadToken(mappe, token, jetzt);
    if (!erlaubt.ok) return { ok: false, status: 410, grund: erlaubt.grund };
    tx.update(ref, { heruntergeladenAm: jetzt, einmalToken: null });
    return { ok: true, mappe };
  });
}

/** Stellt eine signierte PUT-URL aus. Keine Datei laeuft durch diese Function. */
export const mappeUploadUrl = onRequest(OPTIONEN, async (req, res) => {
  if (drosselungGreift(req, res, MAPPE_HTTP_QUOTA, "mappeHttp", true)) return;
  const eingabe = uploadUrlSchema.safeParse(req.body ?? {});
  if (!eingabe.success) {
    res.status(400).json({ fehler: "mappenId, dateiname, contentType und sizeBytes sind nötig." });
    return;
  }
  const { mappenId, contentType, sizeBytes } = eingabe.data;

  try {
    const mappe = await ladeMappeRoh(mappenId);
    if (istAbgelaufen(mappe, Date.now())) {
      res.status(410).json({ fehler: MAPPE_ABGELAUFEN_MELDUNG });
      return;
    }
    // Gegen den BUCKET gerechnet, nicht gegen das Firestore-Verzeichnis:
    // sonst bleibt eine hochgeladene, nie registrierte Datei bei
    // jeder weiteren Zaehlung unsichtbar, und die Grenze greift nie. Die
    // Groesse dieser einen Anfrage ist noch die behauptete - verbindlich
    // durchgesetzt wird sie erst vom Header unten bzw. beim Registrieren
    // gegen die ECHTE Groesse.
    const bestand = await bestandImBucket(mappenId);
    const erlaubt = pruefeUpload({ contentType, sizeBytes }, bestand);
    if (!erlaubt.ok) {
      res.status(400).json({ fehler: erlaubt.grund });
      return;
    }

    const docId = neuerEinmalToken();
    const storagePath = `${mappenPrefix(mappenId)}${docId}`;

    // Platz belegen, nicht nur pruefen: sonst sehen zehn
    // gleichzeitig geholte URLs alle denselben (noch leeren) Bucket-Bestand
    // und sind danach alle einloesbar - Pruefen und Handeln liefen auseinander.
    // Das leere Objekt zaehlt SOFORT als eine Datei in bestandImBucket, damit
    // bindet die ANZAHL-Grenze schon beim Ausstellen der URL. Es zaehlt
    // mit NULL Byte in die Groessen-Summe - eine Reservierung soll
    // nicht den Platz fuer zehn andere kleine Dateien blockieren, nur den
    // einen Slot. Die echte Groesse kommt erst mit dem Upload (Storage
    // ueberschreibt das Objekt) bzw. wird bei der Registrierung nachgerechnet.
    await getStorage().bucket().file(storagePath).save(Buffer.alloc(0), { resumable: false });

    // Google selbst soll die Groesse durchsetzen: ohne diesen Header liesse sich
    // beliebig viel in den Bucket schreiben, egal was sizeBytes behauptet.
    // Der Browser MUSS ihn beim PUT mitsenden, sonst
    // scheitert die Signaturpruefung - deshalb geht er als pflichtHeader mit
    // in die Antwort, damit die Upload-Seite ihn setzen kann.
    const contentLengthRange = `0,${MAX_DATEI_BYTES}`;
    const [uploadUrl] = await getStorage()
      .bucket()
      .file(storagePath)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + UPLOAD_URL_MINUTEN * 60_000,
        contentType,
        extensionHeaders: { "x-goog-content-length-range": contentLengthRange },
      });

    // Kein Dateiname, keine mappenId im Log - beides ist geschuetzt.
    logger.info("mappeUploadUrl ausgestellt", { sizeBytes, contentType });
    res.json({
      docId,
      uploadUrl,
      storagePath,
      pflichtHeader: { "x-goog-content-length-range": contentLengthRange },
    });
  } catch (fehler) {
    if (fehler instanceof MappeNichtGefundenError) {
      res.status(404).json({ fehler: MAPPE_UNBEKANNT_MELDUNG });
      return;
    }
    antworteUnerwartet(res, "mappeUploadUrl", fehler, true);
  }
});

/** Verzeichnet eine Datei, nachdem der Browser sie selbst hochgeladen hat. */
export const mappeRegisterDocument = onRequest(OPTIONEN, async (req, res) => {
  if (drosselungGreift(req, res, MAPPE_HTTP_QUOTA, "mappeHttp", true)) return;
  const ausweiskopie = ausweiskopieSchema.safeParse(req.body ?? {});
  if (ausweiskopie.success) {
    // Die Datei liegt schon im Bucket (der Upload lief vorher) - sie soll
    // nicht bis zur Lifecycle-Regel dort bleiben. Geloescht wird aber nur, was
    // NICHT verzeichnet ist: sonst liesse sich ueber diesen Zweig eine schon
    // registrierte Datei wegnehmen, und das Verzeichnis zeigte ins Leere.
    const { mappenId, docId } = ausweiskopie.data;
    try {
      let verzeichnet = false;
      try {
        verzeichnet = (await ladeMappeRoh(mappenId)).dokumente.some((dokument) => dokument.docId === docId);
      } catch (fehler) {
        if (!(fehler instanceof MappeNichtGefundenError)) throw fehler;
      }
      if (!verzeichnet) await loescheStillschweigend(getStorage().bucket().file(`${mappenPrefix(mappenId)}${docId}`));
    } catch (fehler) {
      antworteUnerwartet(res, "mappeRegisterDocument", fehler, true);
      return;
    }
    res.status(400).json({ fehler: KEINE_AUSWEISKOPIE });
    return;
  }
  const eingabe = registerSchema.safeParse(req.body ?? {});
  if (!eingabe.success) {
    res.status(400).json({ fehler: "mappenId, docId, eine gültige art, dateiname und contentType sind nötig." });
    return;
  }
  // `contentType` (die Angabe des Browsers) bleibt Pflichtfeld, zaehlt aber
  // nicht: den Typ bestimmen die ersten Bytes der Datei (s. unten).
  const { mappenId, docId, art } = eingabe.data;
  const dateiname = sichererDateiname(eingabe.data.dateiname);
  const storagePath = `${mappenPrefix(mappenId)}${docId}`;
  const datei = getStorage().bucket().file(storagePath);
  let verzeichnet = false;

  try {
    const [existiert] = await datei.exists();
    if (!existiert) {
      res.status(400).json({ fehler: "Zu dieser docId liegt keine Datei - lade sie zuerst hoch." });
      return;
    }

    // Weder Groesse noch Typ werden dem Client geglaubt:
    // die ECHTEN Storage-Metadaten zaehlen, und der Inhaltstyp kommt aus den
    // ersten Bytes. Kein Rueckfall auf den gemeldeten Typ: ist
    // er nicht erkennbar, wird abgelehnt - wie beim Konto-Upload.
    const [metadata] = await datei.getMetadata();
    const echteSizeBytes = Number(metadata.size ?? 0);
    // mappeUploadUrl legt beim Ausstellen der URL einen leeren Platzhalter an,
    // damit die Anzahl-Grenze sofort greift. Wurde er nie durch
    // den echten Upload ueberschrieben, liegt hier 0 Byte - eine leere Datei im
    // Paket waere schlimmer als gar keine, also wird sie abgelehnt statt
    // registriert.
    if (echteSizeBytes === 0) {
      res.status(400).json({ fehler: "Zu dieser docId liegt keine hochgeladene Datei - nur ein leerer Platzhalter." });
      return;
    }
    const [head] = await datei.download({ start: 0, end: 15 });
    const tatsaechlicherTyp = erkenneTyp(new Uint8Array(head));
    if (!tatsaechlicherTyp) {
      // Wie ein geordneter Fehlschlag unten: die Datei ist nicht verzeichnet
      // und gehoert niemandem - weg damit.
      await loescheStillschweigend(datei);
      res.status(400).json({ fehler: "Erlaubt sind PDF, JPEG und PNG." });
      return;
    }

    const neuesDokument: MappenDokument = {
      docId,
      art,
      dateiname,
      storagePath,
      contentType: tatsaechlicherTyp,
      sizeBytes: echteSizeBytes,
      herkunft: "upload",
      hinzugefuegtAm: Date.now(),
    };

    // Bucket-Bestand statt Firestore-Verzeichnis - derselbe Massstab
    // wie in mappeUploadUrl, damit beide Pfade dasselbe zaehlen. Die eigene
    // Datei liegt zu diesem Zeitpunkt schon im Bucket und wird darum
    // ausgenommen: ihre echte Groesse geht als `sizeBytes` der Anfrage separat
    // in pruefeUpload ein, nicht doppelt in den Bestand.
    const bestand = await bestandImBucket(mappenId, storagePath);
    const ergebnis = await registriereAtomar(mappenId, neuesDokument, Date.now(), bestand);
    if (!ergebnis.ok) {
      await loescheStillschweigend(datei);
      res.status(ergebnis.status).json({ fehler: ergebnis.grund });
      return;
    }
    verzeichnet = true;
    res.json({ ok: true });
  } catch (fehler) {
    // Auch hier loeschen, nicht nur im geordneten Fehlschlag oben: der haeufigste
    // Weg in diesen Zweig ist eine Mappe, die zwischen Upload und Registrierung
    // abgelaufen und aufgeraeumt wurde - die Datei ist dann echt und gehoert
    // niemandem mehr (s. loescheStillschweigend). Nur wenn die Transaktion NICHT
    // durchgelaufen ist: eine bereits verzeichnete Datei zu loeschen hiesse, dem
    // Bewerber ein Paket mit einer Luecke zu bauen.
    if (!verzeichnet) await loescheStillschweigend(datei);
    if (fehler instanceof MappeNichtGefundenError) {
      res.status(404).json({ fehler: MAPPE_UNBEKANNT_MELDUNG });
      return;
    }
    antworteUnerwartet(res, "mappeRegisterDocument", fehler, true);
  }
});

/** Nimmt eine Datei wieder aus der Mappe - falsch eingescannt ist der Normalfall. */
export const mappeDeleteDocument = onRequest(OPTIONEN, async (req, res) => {
  if (drosselungGreift(req, res, MAPPE_HTTP_QUOTA, "mappeHttp", true)) return;
  const eingabe = deleteSchema.safeParse(req.body ?? {});
  if (!eingabe.success) {
    res.status(400).json({ fehler: "mappenId und docId sind nötig." });
    return;
  }
  const { mappenId, docId } = eingabe.data;

  try {
    const mappe = await ladeMappeRoh(mappenId);
    if (istAbgelaufen(mappe, Date.now())) {
      res.status(410).json({ fehler: MAPPE_ABGELAUFEN_MELDUNG });
      return;
    }
    await entferneDokument(mappenId, docId);
    res.json({ ok: true });
  } catch (fehler) {
    if (fehler instanceof MappeNichtGefundenError) {
      res.status(404).json({ fehler: MAPPE_UNBEKANNT_MELDUNG });
      return;
    }
    antworteUnerwartet(res, "mappeDeleteDocument", fehler, true);
  }
});

/**
 * Einmal-Download des Pakets.
 *
 * REIHENFOLGE: Token verbrauchen und ZIP loeschen erst, wenn die Kopfzeilen
 * stehen. Andersherum wirft ein Zeichen, das Node in einer Kopfzeile ablehnt
 * (etwa aus dem `refCode`), erst danach, und der Bewerber haette weder Paket
 * noch Link. Ablauf:
 *  1. Kennung und Token im Format pruefen, Mappe lesen, Token vorab pruefen
 *     (ohne zu verbrauchen) - ein falscher Link kostet keinen Storage-Download.
 *  2. ZIP aus Storage laden. Scheitert das, ist noch nichts verbraucht; der
 *     Bewerber kann denselben Link erneut oeffnen.
 *  3. Kopfzeilen setzen - gefiltert wie beim Konto-Paket (`paketDateiname`,
 *     `contentDispositionUnterlage`), also ohne Ausnahme.
 *  4. Token in der Transaktion verbrauchen (`loeseDownloadEin`) - erst das
 *     entscheidet bei zwei gleichzeitigen Abrufen, wer das Paket bekommt.
 *  5. Senden; das ZIP wird erst geloescht, wenn die Antwort vollstaendig
 *     hinausging ("finish"). Bricht die Verbindung ab, bleibt es bis zum Ablauf
 *     der Mappe liegen - der Token ist dann verbraucht, ein neues Paket baut die
 *     KI mit schliesse_bewerbungsmappe.
 */
export const mappeDownload = onRequest({ region: REGION, maxInstances: 10 }, async (req, res) => {
  if (drosselungGreift(req, res, MAPPE_DOWNLOAD_QUOTA, "mappeDownload", false)) return;
  const token = String(req.query.token ?? "");
  const mappenId = String(req.query.mappe ?? "");
  if (!token || !mappenId) {
    res.status(400).send("Dieser Link ist unvollständig.");
    return;
  }
  if (!MAPPEN_ID_REGEX.test(mappenId) || !EINMAL_TOKEN_REGEX.test(token)) {
    res.status(400).send("Dieser Link ist unvollständig oder beim Kopieren beschädigt worden.");
    return;
  }

  try {
    const mappe = await ladeMappeRoh(mappenId);
    const vorab = pruefeDownloadToken(mappe, token, Date.now());
    if (!vorab.ok) {
      res.status(410).send(vorab.grund);
      return;
    }

    const paket = getStorage().bucket().file(`${mappenPrefix(mappenId)}${PAKET_DATEINAME}`);
    const [bytes] = await paket.download();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", contentDispositionUnterlage(paketDateiname(mappe.refCode)));
    res.setHeader("Cache-Control", "no-store");

    const eingeloest = await loeseDownloadEin(mappenId, token, Date.now());
    if (!eingeloest.ok) {
      // Ein gleichzeitiger Abruf war schneller. Die ZIP-Kopfzeilen passen
      // nicht zu dieser Antwort.
      res.removeHeader("Content-Type");
      res.removeHeader("Content-Disposition");
      res.status(eingeloest.status).send(eingeloest.grund);
      return;
    }

    // Das ZIP hat seinen Zweck erfuellt; die Quelldateien bleiben bis zum Ablauf,
    // damit ein neues Paket gebaut werden kann. Geloescht wird erst, wenn die
    // Antwort vollstaendig hinaus ist. Das ist nur Best-Effort: Cloud Functions
    // (Cloud Run) sagt nach dem Ende der Antwort keine Rechenzeit mehr zu, das
    // Loeschen kann sich verzoegern oder ausfallen. Bleibt das ZIP liegen, ist es unerreichbar (Token
    // verbraucht; ein neuer Token entsteht nur mit einem neuen Paket, das die
    // Datei ueberschreibt) und faellt mit der Mappe.
    const gesendet = new Promise<boolean>((fertig) => {
      res.once("finish", () => fertig(true));
      res.once("close", () => fertig(false));
    });
    res.status(200).end(bytes);
    if (await gesendet) {
      await paket.delete({ ignoreNotFound: true }).catch((fehler: unknown) => {
        logger.error("mappeDownload: Paket konnte nicht geloescht werden", { name: (fehler as Error).name });
      });
    }
  } catch (fehler) {
    // Die ZIP-Kopfzeilen koennen schon gesetzt sein (Fehler in der Transaktion) -
    // sonst speicherte der Browser die Fehlermeldung als "Bewerbung_….zip".
    if (!res.headersSent) {
      res.removeHeader("Content-Type");
      res.removeHeader("Content-Disposition");
    }
    if (fehler instanceof MappeNichtGefundenError) {
      res.status(404).send(MAPPE_UNBEKANNT_MELDUNG);
      return;
    }
    antworteUnerwartet(res, "mappeDownload", fehler, false);
  }
});
