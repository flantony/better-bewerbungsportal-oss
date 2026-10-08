/**
 * Naechtliche Treffer-Benachrichtigung.
 *
 * `plane()` ist der reine Kern: welche Stellen gehen in die Mail, welche
 * werden nur als "und N weitere" gezaehlt, und welchen `gemeldet`-Stand
 * schreibt der Aufrufer nach einem erfolgreichen Versand fest. Alles I/O
 * (Firestore, Auth, Resend) liegt in `benachrichtigeKonten` und wird bewusst
 * NICHT unit-getestet - dieselbe Aufteilung wie raeumeKontenAuf.ts. Ausnahme:
 * `sammleKandidaten` bekommt `queryJobs` injiziert und ist so testbar.
 *
 * Die gemeldeten Stellen kommen nach dem Versand auf die Merkliste (`schreibeNachVersand` in kontoStore.ts,
 * dieselbe Transaktion wie `gemeldet`), die Mail verlinkt je Stelle den
 * Kurzlink `/k/{id}` fuer die eigene KI des Bewerbers, und derselbe naechtliche
 * Trigger nimmt vorher geschlossene Stellen von allen Merklisten
 * (konto/merklisteAufraeumen.ts).
 */
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { resendApiKey, resendDomain, syncManualSecret } from "./lib/secrets";
import { sendeMail } from "./lib/resend";
import { KONTEN_COLLECTION, type KontoRecord } from "./konto/kontoTypen";
import { gemerkteStellen, normalisiere, schreibeNachVersand } from "./konto/kontoStore";
import { ohnePlatzAufMerkliste } from "./konto/merkliste";
import { raeumeMerklistenAuf, type MerklistenAufraeumung } from "./konto/merklisteAufraeumen";
import {
  fortschreiben,
  neueTreffer,
  tokenPasst,
  MAX_STELLEN_JE_MAIL,
  NEU_FENSTER_TAGE,
  type Kandidat,
} from "./konto/benachrichtigung";
import { aktiveSuchfilter } from "./konto/suchprofile";
import { trefferMail, type MailStelle } from "./konto/trefferMail";
import { listJobsFilterAus } from "./mcp/lib/suchfilter";
import { queryJobs, type JobQueryFilter, type JobQueryResult } from "./mcp/lib/queryJobs";
import { PUBLIC_SITE_URL, FUNCTIONS_BASE_URL } from "./mcp/publicSite";

const REGION = "europe-west3";
// getAuth().getUsers() erlaubt hoechstens 100 Identifier je Aufruf.
const GETUSERS_BLOCK = 100;
const TAG_MS = 86_400_000;
/** Hoechstens so viele Seiten a `SEITE` Treffer je Filter und Nacht (s. sammleKandidaten). */
export const MAX_SEITEN = 10;
export const SEITE = 50;
/**
 * Hoechstens eine Mail je Konto in diesem Abstand. 20 statt 24
 * Stunden: der Lauf startet jede Nacht um 04:00 Berlin, die Sommer-/Winterzeit-
 * umstellung verschiebt den Abstand auf 23 bzw. 25 Stunden, und ein langer Lauf
 * schreibt `letzteAm` erst spaet im Lauf - 20 h liegt sicher darunter.
 */
export const MIN_ABSTAND_STUNDEN = 20;

// ─── Reiner Kern ────────────────────────────────────────────────────────────

/** Ein Kandidat mit den Feldern, die `MailStelle` fuer die Mail braucht. */
export interface StellenKandidat extends Kandidat {
  titel: string;
  ort: string;
  bewerbungsschluss: string;
}

/**
 * Der Teil von `BenachrichtigungRecord`, den `plane()` braucht - in
 * Millisekunden statt Timestamp. Bewusst OHNE `letzteAm`: das Feld wird nach
 * jedem Versand geschrieben, ist fuer die Planung aber nur Information, keine
 * Filtergrenze (s. `plane()`).
 */
export interface KontoBenachrichtigungsStand {
  seitMs: number;
  gemeldet: string[];
}

export interface Planung {
  senden: MailStelle[];
  weitere: number;
  /**
   * ALLE neuen Stellen dieser Mail, neueste zuerst - auch die, die nur als
   * "und N weitere" mitgezaehlt sind. Sie kommen nach dem Versand auf die
   * Merkliste: dort findet der Bewerber genau
   * die, die die Mail nicht einzeln nennt.
   */
  neu: string[];
  /** Der VOLLSTAENDIGE neue `gemeldet`-Stand - erst nach erfolgreichem Versand schreiben. */
  neueGemeldet: string[];
}

/**
 * Reine Planung: welche neuen Stellen gibt es, wie viele davon gehen in die
 * Mail (`MAX_STELLEN_JE_MAIL`), der Rest zaehlt nur noch als `weitere`.
 * `null`, wenn es nichts Neues gibt - dann bleibt der Konto-Zustand
 * unangetastet (Aufrufer zaehlt `ohneTreffer`).
 *
 * Die Grenze ist `max(seit, jetzt - NEU_FENSTER_TAGE)`, bewusst NICHT
 * `max(seit, letzteAm)`: `letzteAm` als zweite, mit jeder Nacht vorrueckende
 * Untergrenze wuerde genau die Stellen verschlucken, die - z.B. wegen eines
 * Fetch-Limits oder eines waehrend des Laufs gestarteten manuellen Syncs -
 * erst eine Nacht spaeter als Kandidat auftauchen: sie laegen dann bereits vor
 * der inzwischen vorgerueckten `letzteAm`-Grenze und wuerden NIE gemeldet. Die
 * Fenstergrenze haengt dagegen NUR an `jetzt`, nicht am Verlauf frueherer Laeufe - eine Stelle
 * bleibt "neu", solange sie juenger als `NEU_FENSTER_TAGE` ist UND noch nicht
 * gemeldet wurde, ganz gleich, wann genau sie zuerst als Kandidat auftauchte.
 *
 * `neueTreffer` (konto/benachrichtigung.ts) kennt nur `pinstGuid`/`firstSeenAtMs`
 * (`Kandidat`) - die zusaetzlichen Mail-Felder eines `StellenKandidat`
 * ueberleben Filterung und Sortierung als dieselben Objektreferenzen, der Cast
 * zurueck ist deshalb sicher.
 */
export function plane(
  konto: KontoBenachrichtigungsStand,
  kandidaten: StellenKandidat[],
  jetzt: number,
): Planung | null {
  const fensterGrenze = jetzt - NEU_FENSTER_TAGE * TAG_MS;
  const grenze = Math.max(konto.seitMs, fensterGrenze);
  const neu = neueTreffer(kandidaten, grenze, konto.gemeldet) as StellenKandidat[];
  if (neu.length === 0) return null;

  const senden: MailStelle[] = neu.slice(0, MAX_STELLEN_JE_MAIL).map((k) => ({
    pinstGuid: k.pinstGuid,
    titel: k.titel,
    ort: k.ort,
    bewerbungsschluss: k.bewerbungsschluss,
  }));

  const neuIds = neu.map((k) => k.pinstGuid);
  return {
    senden,
    weitere: neu.length - senden.length,
    neu: neuIds,
    neueGemeldet: fortschreiben(konto.gemeldet, neuIds),
  };
}

/**
 * Wurde dieses Konto vor weniger als `MIN_ABSTAND_STUNDEN` benachrichtigt?
 * Dann gibt es keine zweite Mail - ausser der manuelle Trigger verlangt es
 * ausdruecklich (`?erzwingen=1`).
 */
export function kuerzlichBenachrichtigt(letzteAmMs: number | null, jetzt: number, erzwingen: boolean): boolean {
  if (erzwingen || letzteAmMs === null) return false;
  return jetzt - letzteAmMs < MIN_ABSTAND_STUNDEN * 3_600_000;
}

/**
 * Dieselbe Liste, aber mit einem taeglich wandernden Startpunkt (Tag seit
 * Epoch modulo Laenge): laeuft ein Lauf in den Timeout, trifft das nicht jede
 * Nacht dieselben Konten am Ende der Liste.
 */
export function rotiert<T>(liste: readonly T[], jetzt: number): T[] {
  if (liste.length === 0) return [];
  const start = Math.floor(jetzt / TAG_MS) % liste.length;
  return [...liste.slice(start), ...liste.slice(0, start)];
}

/**
 * Stabiler Schluessel fuer einen Abfragefilter (Schluessel sortiert,
 * `undefined` weggelassen) - zwei Konten mit gleichem Profil teilen sich so
 * innerhalb eines Laufs EINE Kandidatensuche.
 */
export function filterSchluessel(filter: JobQueryFilter): string {
  const eintraege = Object.entries(filter)
    .filter(([, wert]) => wert !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(eintraege);
}

/**
 * Fuehrt die Kandidaten mehrerer Filter eines Kontos zusammen (ein Treffer
 * auf irgendeinen aktiven Filter zaehlt). Eine
 * Stelle, die zu mehreren Filtern passt, steht nur EINMAL drin - sonst
 * zaehlte `plane()` sie doppelt in "und N weitere". `abgeschnitten` und
 * `seitenDeckel` gelten fuer das Konto, sobald ein einziger Filter betroffen
 * ist. Die Reihenfolge ist egal: `plane()` sortiert selbst.
 */
export function vereinigeSammlungen(sammlungen: readonly Sammlung[]): Sammlung {
  const nachId = new Map<string, StellenKandidat>();
  for (const sammlung of sammlungen) {
    for (const kandidat of sammlung.kandidaten) {
      if (!nachId.has(kandidat.pinstGuid)) nachId.set(kandidat.pinstGuid, kandidat);
    }
  }
  return {
    kandidaten: [...nachId.values()],
    abgeschnitten: sammlungen.some((s) => s.abgeschnitten),
    seitenDeckel: sammlungen.some((s) => s.seitenDeckel),
  };
}

/**
 * Passen nicht alle neuen Stellen auf die Merkliste? Nur fuer den Satz in der
 * Mail. Eine unlesbare Merkliste zaehlt als "passt" - sie darf die Mail nicht
 * aufhalten, und `schreibeNachVersand` faengt denselben Fall selbst ab.
 */
export function merklisteZuKlein(record: KontoRecord | undefined, neu: readonly string[]): boolean {
  if (!record) return false;
  try {
    return ohnePlatzAufMerkliste(gemerkteStellen(record), neu) > 0;
  } catch {
    return false;
  }
}

// ─── I/O ────────────────────────────────────────────────────────────────────

export interface BenachrichtigeZusammenfassung {
  konten: number;
  mails: number;
  ohneTreffer: number;
  unbestaetigt: number;
  fehlgeschlagen: number;
  /** `queryJobs` mit `abgeschnitten: true` - Treffer koennten fehlen (s. queryJobs.ts). */
  abgeschnitten: number;
  /** `sammleKandidaten` hat MAX_SEITEN erreicht, bevor das 7-Tage-Fenster erreicht war. */
  seitenDeckel: number;
  /** Aktiv, aber ohne aktiven, einschraenkenden Filter - keine Mail. */
  ohneProfil: number;
  /** Innerhalb der letzten MIN_ABSTAND_STUNDEN schon benachrichtigt. */
  kuerzlichBenachrichtigt: number;
  /**
   * Zwischen Laufbeginn und Versand abbestellt/geloescht - keine Mail
   * verschickt bzw. `gemeldet` nicht mehr geschrieben, aber kein Fehler.
   */
  zwischenzeitlichAbgemeldet: number;
  /** So viele Stellen kamen nach dem Versand neu auf Merklisten. */
  aufMerkliste: number;
  /** So viele Stellen passten nicht mehr auf eine volle Merkliste - die Mail ging trotzdem raus. */
  merklisteOhnePlatz: number;
  /** Konten, deren Merkliste sich nicht fortschreiben liess - der Mail-Zustand ist trotzdem geschrieben. */
  merklisteFehler: number;
}

/** Ein Treffer aus `queryJobs`, uebersetzt in die Mail-Kandidatenform. */
function zuStellenKandidat(job: {
  pinstGuid: string;
  firstSeenAt: Timestamp;
  title: string;
  besOrt: string;
  applicationEnd: string;
}): StellenKandidat {
  return {
    pinstGuid: job.pinstGuid,
    firstSeenAtMs: job.firstSeenAt.toMillis(),
    titel: job.title,
    ort: job.besOrt,
    bewerbungsschluss: job.applicationEnd,
  };
}

export interface Sammlung {
  kandidaten: StellenKandidat[];
  abgeschnitten: boolean;
  seitenDeckel: boolean;
}

/**
 * Sammelt Kandidaten fuer EIN Suchprofil mit hoechstens ZWEI
 * `queryJobs`-Aufrufen statt einem je Seite.
 *
 * 1. Seite 1 mit `limit: SEITE`. Reicht sie (kein Cursor, oder ihr letzter
 *    Treffer liegt schon vor dem `NEU_FENSTER_TAGE`-Fenster - `sortierung:
 *    "neueste"`, alles danach ist noch aelter), ist Schluss.
 * 2. Sonst der Rest in EINEM Aufruf ab dem Cursor mit
 *    `limit: (MAX_SEITEN - 1) * SEITE`. Liegt auch dessen letzter Treffer noch
 *    im Fenster und gibt es einen weiteren Cursor, ist der Deckel erreicht
 *    (`seitenDeckel`).
 *
 * `abgeschnitten` einer Seite bricht nicht ab: `gemeldet` verhindert spaeter
 * Duplikate, ein zu frueher Abbruch wuerde dagegen Kandidaten kosten.
 * `abfragen` ist fuer Tests injizierbar.
 */
export async function sammleKandidaten(
  filter: JobQueryFilter,
  jetzt: number,
  abfragen: (filter: JobQueryFilter) => Promise<JobQueryResult> = queryJobs,
): Promise<Sammlung> {
  const fensterGrenze = jetzt - NEU_FENSTER_TAGE * TAG_MS;
  const imFenster = (ergebnis: JobQueryResult) => {
    const letzter = ergebnis.results.at(-1);
    return letzter !== undefined && letzter.firstSeenAt.toMillis() >= fensterGrenze;
  };

  const erste = await abfragen({ ...filter, sortierung: "neueste", limit: SEITE, cursor: undefined });
  const kandidaten = erste.results.map(zuStellenKandidat);
  let abgeschnitten = erste.abgeschnitten;
  let seitenDeckel = false;

  if (imFenster(erste) && erste.naechsterCursor) {
    const rest = await abfragen({
      ...filter,
      sortierung: "neueste",
      limit: (MAX_SEITEN - 1) * SEITE,
      cursor: erste.naechsterCursor,
    });
    if (rest.abgeschnitten) abgeschnitten = true;
    kandidaten.push(...rest.results.map(zuStellenKandidat));
    seitenDeckel = imFenster(rest) && rest.naechsterCursor !== undefined;
  }

  return { kandidaten, abgeschnitten, seitenDeckel };
}

/**
 * Der naechtliche Lauf. Liest alle Konten mit `benachrichtigung.aktiv == true`,
 * je Konto: passende Stellen suchen, planen, Mail verschicken, `letzteAm`/
 * `gemeldet` ERST NACH erfolgreichem Versand fortschreiben - ein fehlgeschlagener
 * Versand wird in der naechsten Nacht wiederholt, statt verloren zu gehen.
 *
 * Geloggt werden nur Zahlen: nie E-Mail-Adressen, nie uids,
 * nie Resend-Antworttexte.
 */
export async function benachrichtigeKonten(params: {
  jetzt: number;
  trockenlauf: boolean;
  /** Nur der manuelle Trigger (`?erzwingen=1`): ignoriert MIN_ABSTAND_STUNDEN. */
  erzwingen?: boolean;
}): Promise<BenachrichtigeZusammenfassung> {
  const { jetzt, trockenlauf, erzwingen = false } = params;
  const db = getFirestore();
  const snap = await db.collection(KONTEN_COLLECTION).where("benachrichtigung.aktiv", "==", true).get();

  const zusammenfassung: BenachrichtigeZusammenfassung = {
    konten: snap.size,
    mails: 0,
    ohneTreffer: 0,
    unbestaetigt: 0,
    fehlgeschlagen: 0,
    abgeschnitten: 0,
    seitenDeckel: 0,
    ohneProfil: 0,
    kuerzlichBenachrichtigt: 0,
    zwischenzeitlichAbgemeldet: 0,
    aufMerkliste: 0,
    merklisteOhnePlatz: 0,
    merklisteFehler: 0,
  };

  if (snap.empty) {
    logger.info("benachrichtigeKonten abgeschlossen", zusammenfassung);
    return zusammenfassung;
  }

  const dokIds = snap.docs.map((d) => d.id);
  const nutzerByUid = new Map<string, UserRecord>();
  for (let i = 0; i < dokIds.length; i += GETUSERS_BLOCK) {
    const block = dokIds.slice(i, i + GETUSERS_BLOCK);
    try {
      const { users } = await getAuth().getUsers(block.map((uid) => ({ uid })));
      users.forEach((u) => nutzerByUid.set(u.uid, u));
    } catch (fehler) {
      // Nur der Fehlername, nie die uids.
      logger.error("benachrichtigeKonten: getUsers fehlgeschlagen", { name: (fehler as Error).name });
      zusammenfassung.fehlgeschlagen += block.length;
    }
  }

  // Je Lauf EINE Kandidatensuche je Filter - auch ueber Konten
  // hinweg. Gemerkt wird die Promise, nicht das Ergebnis - ein Fehlschlag
  // trifft dann alle Konten mit diesem Filter, die Abfrage waere fuer sie aber
  // genauso gescheitert.
  const sammlungen = new Map<string, Promise<Sammlung>>();
  const sammle = (filter: JobQueryFilter) => {
    const schluessel = filterSchluessel(filter);
    let sammlung = sammlungen.get(schluessel);
    if (!sammlung) {
      sammlung = sammleKandidaten(filter, jetzt);
      sammlungen.set(schluessel, sammlung);
    }
    return sammlung;
  };

  for (const doc of rotiert(snap.docs, jetzt)) {
    const uid = doc.id;
    const nutzer = nutzerByUid.get(uid);
    // Kein Auth-Konto (mehr) gefunden - verwaistes Kontodokument, das raeumt
    // raeumeKontenAuf ab. Kein Fehler, keine Zaehlung.
    if (!nutzer || !nutzer.email) continue;
    if (nutzer.emailVerified !== true) {
      zusammenfassung.unbestaetigt++;
      continue;
    }

    try {
      const record = normalisiere(doc.data() as Partial<KontoRecord>, jetzt);
      const stand = record.benachrichtigung;
      // Die Query hat oben schon aktiv==true gefiltert - ein fehlender/
      // inzwischen deaktivierter Zustand ist ein seltenes Zeitfenster-Race,
      // kein Fehler.
      if (!stand || !stand.aktiv) continue;

      // Pausierte Filter zaehlen nicht, und ein Filter ohne
      // Einschraenkung (leer oder nur neutrale Werte wie "beide") hiesse
      // "alle Stellen" - bleibt keiner uebrig, keine Mail.
      const filter = aktiveSuchfilter(record.suchprofile);
      if (filter.length === 0) {
        zusammenfassung.ohneProfil++;
        continue;
      }
      // Hoechstens eine Mail je MIN_ABSTAND_STUNDEN.
      if (kuerzlichBenachrichtigt(stand.letzteAm?.toMillis() ?? null, jetzt, erzwingen)) {
        zusammenfassung.kuerzlichBenachrichtigt++;
        continue;
      }

      // Hoechstens SUCHPROFILE_MAX Filter je Konto, jeder hoechstens zwei
      // queryJobs-Aufrufe (s. sammleKandidaten) - und gleiche Filter teilen
      // sich ueber `sammle` eine Suche. Scheitert ein Filter, faellt bewusst
      // das ganze Konto in dieser Nacht aus (catch unten): mit einer halben
      // Treffermenge wuerde `gemeldet` fortgeschrieben, die fehlenden Stellen
      // kaemen nie.
      const { kandidaten, abgeschnitten, seitenDeckel } = vereinigeSammlungen(
        await Promise.all(filter.map((f) => sammle(listJobsFilterAus(f)))),
      );
      if (abgeschnitten) zusammenfassung.abgeschnitten++;
      if (seitenDeckel) zusammenfassung.seitenDeckel++;

      const planung = plane({ seitMs: stand.seit.toMillis(), gemeldet: stand.gemeldet }, kandidaten, jetzt);

      if (!planung) {
        zusammenfassung.ohneTreffer++;
        continue;
      }

      if (trockenlauf) {
        zusammenfassung.mails++;
        continue;
      }

      // Race zwischen Laufbeginn und Versand: direkt
      // vor dem Versand nochmal lesen. Nur wenn das Konto noch existiert,
      // weiterhin aktiv ist UND dasselbe Abbestell-Token traegt, wird
      // versendet - sonst ginge eine Mail an jemanden raus, der sich gerade
      // erst abgemeldet (oder geloescht) hat.
      const frischeSnap = await db.collection(KONTEN_COLLECTION).doc(uid).get();
      const frischerRecord = frischeSnap.exists ? normalisiere(frischeSnap.data() as Partial<KontoRecord>, jetzt) : undefined;
      const frischerStand = frischerRecord?.benachrichtigung;
      if (!frischerStand || !frischerStand.aktiv || frischerStand.abmeldeToken !== stand.abmeldeToken) {
        zusammenfassung.zwischenzeitlichAbgemeldet++;
        continue;
      }
      // Ein paralleler Lauf (z.B. der manuelle Trigger) hat inzwischen versendet.
      if (kuerzlichBenachrichtigt(frischerStand.letzteAm?.toMillis() ?? null, jetzt, erzwingen)) {
        zusammenfassung.kuerzlichBenachrichtigt++;
        continue;
      }

      const abbestellen = `${FUNCTIONS_BASE_URL}/kontoAbbestellen?k=${encodeURIComponent(uid)}&t=${encodeURIComponent(frischerStand.abmeldeToken)}`;
      // Nur fuer den Satz in der Mail: passen nicht alle neuen Stellen auf die
      // Merkliste, sagt die Mail das, statt "auch auf deiner Merkliste" zu
      // versprechen. Eine unlesbare Merkliste haelt die Mail nicht auf.
      const merklisteVoll = merklisteZuKlein(frischerRecord, planung.neu);
      const inhalt = trefferMail(planung.senden, planung.weitere, { basis: PUBLIC_SITE_URL, abbestellen }, { merklisteVoll });

      await sendeMail({
        apiKey: resendApiKey.value(),
        domain: resendDomain.value(),
        an: nutzer.email,
        inhalt,
        kopfzeilen: {
          "List-Unsubscribe": `<${abbestellen}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      // AT-LEAST-ONCE: die Mail ist ab hier
      // unwiderruflich raus. Schlaegt der folgende Schreibvorgang fehl, hat
      // `gemeldet` den alten Stand - dieselben Stellen werden in der
      // naechsten Nacht erneut gemeldet. Hingenommen: die Alternative (erst
      // schreiben, dann senden) koennte eine Stelle bei einem Absturz
      // zwischen beiden Schritten STILL verlieren, nie nur doppelt melden.
      // Dieselbe Transaktion setzt die Stellen auf die Merkliste; ein Problem
      // dort haelt den Zustand nicht auf (s. schreibeNachVersand).
      const geschrieben = await schreibeNachVersand(uid, jetzt, planung.neueGemeldet, planung.neu);
      if (geschrieben.ergebnis === "konto-fehlt") {
        // Das Konto ist zwischen Versand und Schreiben verschwunden - es
        // gibt nichts mehr festzuschreiben, aber auch niemanden mehr, dem
        // gegenueber der Lauf "fehlgeschlagen" waere.
        zusammenfassung.zwischenzeitlichAbgemeldet++;
      } else {
        zusammenfassung.aufMerkliste += geschrieben.aufMerkliste;
        zusammenfassung.merklisteOhnePlatz += geschrieben.keinPlatz;
        if (geschrieben.merklisteFehler) zusammenfassung.merklisteFehler++;
      }
      zusammenfassung.mails++;
    } catch (fehler) {
      logger.error("benachrichtigeKonten: Konto fehlgeschlagen", { name: (fehler as Error).name });
      zusammenfassung.fehlgeschlagen++;
    }
  }

  logger.info("benachrichtigeKonten abgeschlossen", zusammenfassung);
  return zusammenfassung;
}

// ─── Trigger ────────────────────────────────────────────────────────────────

export const benachrichtigeScheduled = onSchedule(
  {
    schedule: "0 4 * * *",
    timeZone: "Europe/Berlin",
    region: REGION,
    // Hoechstwert fuer geplante Functions; der Lauf ist sequentiell.
    timeoutSeconds: 1800,
    secrets: [resendApiKey, resendDomain],
  },
  async () => {
    const jetzt = Date.now();
    // Erst aufraeumen, dann mailen: eine mit geschlossenen Stellen volle
    // Merkliste haette sonst keinen Platz fuer die neuen. Scheitert das
    // Aufraeumen, gehen die Mails trotzdem raus.
    const merkliste = await aufraeumenOhneAbbruch(jetzt, false);
    const zusammenfassung = await benachrichtigeKonten({ jetzt, trockenlauf: false });
    const fehler = zusammenfassung.fehlgeschlagen + (merkliste?.fehlgeschlagen ?? 1);
    if (fehler > 0) {
      throw new Error(
        `benachrichtigeScheduled: ${zusammenfassung.fehlgeschlagen} Konto(en) beim Versand, ` +
          `${merkliste ? merkliste.fehlgeschlagen : "alle"} beim Aufraeumen der Merklisten fehlgeschlagen.`,
      );
    }
  },
);

/** Das Aufraeumen der Merklisten darf den Mail-Lauf nie mitreissen - `null` heisst: gescheitert. */
async function aufraeumenOhneAbbruch(jetzt: number, trockenlauf: boolean): Promise<MerklistenAufraeumung | null> {
  try {
    return await raeumeMerklistenAuf({ jetzt, trockenlauf });
  } catch (fehler) {
    logger.error("raeumeMerklistenAuf fehlgeschlagen", { name: (fehler as Error).name });
    return null;
  }
}

/**
 * Manueller Trigger fuer Debugging/On-Demand-Lauf - dasselbe Muster wie
 * `syncJobsManual` (index.ts): Header `x-sync-secret` gegen SYNC_MANUAL_SECRET,
 * ohne gueltigen Header 401. `?trockenlauf=1` zaehlt nur, ohne zu versenden
 * oder zu schreiben - auch beim Aufraeumen der Merklisten (Feld `merkliste`
 * der Antwort). `?erzwingen=1` hebt die MIN_ABSTAND_STUNDEN-Sperre auf. Vergleich per `tokenPasst` -
 * konstante Zeit, kein `!==` auf dem Secret.
 *
 * Zusaetzlich IAM-privat (`invoker: "private"`): der Lauf verschickt echte
 * Mails an echte Konten, und das Secret allein waere die einzige Huerde vor
 * einem oeffentlichen Endpunkt. `syncJobsManual` ist ebenso privat, dort aber
 * per Hand in IAM gesetzt; hier steht es im Code, damit ein Deploy es nicht
 * wieder oeffnet. Aufruf nur mit Identitaetstoken eines Projektinhabers.
 */
export const benachrichtigeManual = onRequest(
  {
    region: REGION,
    timeoutSeconds: 540,
    invoker: "private",
    secrets: [syncManualSecret, resendApiKey, resendDomain],
  },
  async (req, res) => {
    if (!tokenPasst(syncManualSecret.value(), req.get("x-sync-secret"))) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const trockenlauf = req.query.trockenlauf === "1";
    const erzwingen = req.query.erzwingen === "1";
    try {
      const jetzt = Date.now();
      const merkliste = await aufraeumenOhneAbbruch(jetzt, trockenlauf);
      const zusammenfassung = await benachrichtigeKonten({ jetzt, trockenlauf, erzwingen });
      res.status(200).json({ ...zusammenfassung, merkliste: merkliste ?? { fehler: "aufraeumen-fehlgeschlagen" } });
    } catch (fehler) {
      logger.error("benachrichtigeManual fehlgeschlagen", { name: (fehler as Error).name });
      res.status(500).json({ error: (fehler as Error).name });
    }
  },
);
