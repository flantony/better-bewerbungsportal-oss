import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { loescheKonto } from "./konto/kontoStore";
import { KONTEN_COLLECTION } from "./konto/kontoTypen";
import { vorwarnMail } from "./konto/trefferMail";
import { sendeMail } from "./lib/resend";
import { resendApiKey, resendDomain } from "./lib/secrets";
import { PUBLIC_SITE_URL } from "./mcp/publicSite";

export const INAKTIV_TAGE = 365;
const TAG_MS = 86_400_000;
// getAuth().getUsers() erlaubt hoechstens 100 Identifier je Aufruf.
const GETUSERS_BLOCK = 100;

/**
 * Vorwarn-Fenster vor der Inaktivitaetsloeschung: 30 Tage vorher, also ab Tag
 * 335. Beide Grenzen INKLUSIV - das Fenster ist
 * bewusst GENAU SO BREIT wie der woechentliche Lauf (7 Kalendertage: 335, 336,
 * ..., 341) - so trifft jeder woechentliche Lauf jeden Nutzer genau einmal,
 * weder doppelt noch gar nicht (s. waehleVorzuwarnende).
 */
export const VORWARNUNG_TAGE_MIN = INAKTIV_TAGE - 30;
export const VORWARNUNG_TAGE_MAX = VORWARNUNG_TAGE_MIN + 6;

export function waehleInaktive(
  nutzer: { uid: string; creationTime: string; lastSignInTime?: string; lastRefreshTime?: string | null }[],
  jetzt: number,
): string[] {
  const grenze = jetzt - INAKTIV_TAGE * TAG_MS;
  return nutzer
    .filter((n) => {
      const zeiten = [n.creationTime, n.lastSignInTime, n.lastRefreshTime ?? undefined]
        .filter((z): z is string => Boolean(z))
        .map((z) => Date.parse(z));
      // Keine auswertbare Zeit ist NICHT dasselbe wie "laenger als die Frist
      // inaktiv": `Math.max()` ohne Argumente ist
      // `-Infinity`, das waere IMMER `< grenze` und wuerde damit ausgerechnet
      // den Datensatz auswaehlen, ueber den am wenigsten bekannt ist. Ebenso
      // bei einer unparsable (aber nicht-leeren) Zeitangabe: `Date.parse`
      // liefert dann `NaN`, und `Math.max(...zeiten)` waere `NaN` -
      // `NaN < grenze` ist zwar bereits `false`, wird hier aber zusaetzlich
      // explizit gemacht, statt sich auf die NaN-Weiterreichung zu verlassen.
      if (zeiten.length === 0 || zeiten.some(Number.isNaN)) return false;
      return Math.max(...zeiten) < grenze;
    })
    .map((n) => n.uid);
}

/**
 * Ein Kontodokument ohne zugehoeriges Auth-Konto ist verwaist - z.B. weil die
 * Konto-Loeschung nach dem Firestore-`recursiveDelete` beim Auth-Teil
 * fehlgeschlagen ist (s. kontoStore.loescheKonto), oder weil ein Konto ueber
 * die Firebase-Konsole geloescht wurde, ohne unseren Loeschpfad zu
 * durchlaufen. `gefundeneUids` sind die ueber `getAuth().getUsers()`
 * tatsaechlich gefundenen Auth-Konten.
 */
export function verwaisteKonten(dokIds: string[], gefundeneUids: Set<string>): string[] {
  return dokIds.filter((id) => !gefundeneUids.has(id));
}

/**
 * "konten/abc/" -> "abc" - reine Kernlogik ohne Storage-Zugriff, direkt
 * testbar. Ein Praefix, der nicht exakt "konten/<etwas ohne Schraegstrich>/"
 * ist, liefert `null` statt eine falsche uid zu raten (im Zweifel nicht
 * loeschen, wie ueberall in dieser Datei).
 */
export function uidAusPraefix(praefix: string): string | null {
  const treffer = /^konten\/([^/]+)\/$/.exec(praefix);
  return treffer ? treffer[1] : null;
}

/**
 * "konten/abc/privat/angaben" -> "abc" - reine Kernlogik, direkt testbar.
 * Ein Dokument unter `konten/{uid}/privat/*` kann
 * existieren, OHNE dass das ELTERN-Dokument `konten/{uid}` selbst existiert
 * (z.B. nach einer manuellen Teil-Loeschung) - die
 * Iteration ueber die `konten`-Collection allein saehe ein solches Konto nie.
 * Nur Pfade GENAU der Form `konten/{uid}/privat/{irgendein Dokument}` zaehlen;
 * alles andere liefert `null` (im Zweifel nicht loeschen).
 */
export function uidAusPrivatPfad(pfad: string): string | null {
  const treffer = /^konten\/([^/]+)\/privat\/[^/]+$/.exec(pfad);
  return treffer ? treffer[1] : null;
}

/**
 * Listet die uid-Praefixe unter `konten/` im Bucket - das Storage-
 * Gegenstueck zu `verwaisteKonten` (dort: Firestore-Dokument ohne Auth-Konto;
 * hier: Storage-Dateien ohne Auth-Konto, z.B. weil `loescheKonto` beim
 * Storage-Teil scheiterte oder ein Konto ausserhalb dieses Pfads geloescht
 * wurde). `delimiter: "/"` liefert in `apiResponse.prefixes` NUR die ersten
 * Pfadsegmente (die uids), nicht jede einzelne Datei darunter;
 * `autoPaginate: false`, weil hier nur diese eine Ebene gebraucht wird - dafuer
 * muss ueber `nextQuery` selbst weitergeblaettert werden: ohne die Schleife
 * saehe der Sweep nur die ERSTE Seite Praefixe und liesse jedes Konto ab der
 * zweiten Seite dauerhaft unbeachtet - `nextQuery` ist
 * `null`/`undefined`, sobald keine weitere Seite mehr existiert (Vorgabe der
 * @google-cloud/storage-API, s. deren `getFiles`-Beispiel mit `delimiter`).
 */
async function listeKontoPraefixeImBucket(): Promise<string[]> {
  const praefixe: string[] = [];
  let query: Record<string, unknown> | null = { prefix: "konten/", delimiter: "/", autoPaginate: false };
  while (query) {
    const ergebnis = (await getStorage().bucket().getFiles(query)) as unknown as [
      unknown[],
      Record<string, unknown> | null | undefined,
      { prefixes?: string[] } | undefined,
    ];
    const [, nextQuery, apiResponse] = ergebnis;
    praefixe.push(...(apiResponse?.prefixes ?? []));
    query = nextQuery ?? null;
  }
  return praefixe.map(uidAusPraefix).filter((uid): uid is string => uid !== null);
}

const BERLIN_KALENDERTEILE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function datumsteil(teile: Intl.DateTimeFormatPart[], typ: string): number {
  const treffer = teile.find((t) => t.type === typ);
  if (!treffer) throw new Error(`Kein Datumsteil vom Typ "${typ}"`);
  return Number(treffer.value);
}

/** Der Kalendertag (Europe/Berlin) eines Zeitpunkts, als Tage seit der Unix-Epoche. */
function berlinKalendertag(ms: number): number {
  const teile = BERLIN_KALENDERTEILE.formatToParts(new Date(ms));
  const jahr = datumsteil(teile, "year");
  const monat = datumsteil(teile, "month");
  const tag = datumsteil(teile, "day");
  return Math.floor(Date.UTC(jahr, monat - 1, tag) / TAG_MS);
}

/**
 * Tage zwischen zwei Zeitpunkten - ueber den KALENDERTAG in Europe/Berlin
 * gerechnet, nicht ueber die Millisekunden-Differenz.
 * Eine Sommer-/Winterzeit-Umstellung veraendert die reale ms-Differenz
 * zwischen zwei Zeitpunkten um +/-1 Stunde, ohne die Anzahl der
 * dazwischenliegenden Kalendertage zu aendern - eine ms-basierte Rechnung
 * koennte in der Umstellungswoche einen Nutzer um einen Tag verschieben und
 * ihn so am 7-taegigen Vorwarnfenster vorbeirutschen lassen.
 */
export function tageDazwischenBerlin(frueher: number, spaeter: number): number {
  return berlinKalendertag(spaeter) - berlinKalendertag(frueher);
}

/**
 * Auswahl fuer die Loesch-Vorwarnung: letzte Aktivitaet zwischen
 * `VORWARNUNG_TAGE_MIN` und `VORWARNUNG_TAGE_MAX` KALENDERTAGEN her, beide
 * Grenzen inklusiv (s. `tageDazwischenBerlin`).
 * Dieselben Zeit-Regeln wie `waehleInaktive`: leer/unlesbar -> nie vorgewarnt
 * (im Zweifel keine Mail statt einer falschen).
 *
 * Liefert die letzte Aktivitaet direkt mit (`letzteAktivitaetMs`), damit der
 * Aufrufer daraus das Loeschdatum (`+ INAKTIV_TAGE`) berechnen kann, ohne die
 * Zeit-Ermittlung ein zweites Mal nachzubauen.
 */
export function waehleVorzuwarnende(
  nutzer: { uid: string; creationTime: string; lastSignInTime?: string; lastRefreshTime?: string | null }[],
  jetzt: number,
): { uid: string; letzteAktivitaetMs: number }[] {
  const ergebnis: { uid: string; letzteAktivitaetMs: number }[] = [];
  for (const n of nutzer) {
    const zeiten = [n.creationTime, n.lastSignInTime, n.lastRefreshTime ?? undefined]
      .filter((z): z is string => Boolean(z))
      .map((z) => Date.parse(z));
    if (zeiten.length === 0 || zeiten.some(Number.isNaN)) continue;
    const letzteAktivitaetMs = Math.max(...zeiten);
    const tage = tageDazwischenBerlin(letzteAktivitaetMs, jetzt);
    if (tage >= VORWARNUNG_TAGE_MIN && tage <= VORWARNUNG_TAGE_MAX) {
      ergebnis.push({ uid: n.uid, letzteAktivitaetMs });
    }
  }
  return ergebnis;
}

const DATUM_FORMAT_DE = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** TT.MM.JJJJ in der Zeitzone Europe/Berlin, z.B. fuer das Loeschdatum in der Vorwarn-Mail. */
export function formatiereDeutschesDatum(ms: number): string {
  return DATUM_FORMAT_DE.format(new Date(ms));
}

/**
 * Ueber die Auth-Metadaten, nicht ueber Firestore: so erwischt die Regel auch
 * Konten, die sich registriert und nie das Konto geladen haben (dann gibt es
 * kein Firestore-Dokument, aber eine E-Mail-Adresse in Auth).
 */
export const raeumeKontenAufScheduled = onSchedule(
  {
    schedule: "0 4 * * 1",
    timeZone: "Europe/Berlin",
    region: "europe-west3",
    timeoutSeconds: 540,
    secrets: [resendApiKey, resendDomain],
  },
  async () => {
    let seite: string | undefined;
    let geloescht = 0;
    // Getrennte Zaehler je Fehlerart: ein Sammelzaehler hiesse am Lauf-Ende
    // pauschal "konnten nicht geloescht werden", auch bei einer reinen
    // Mail-Panne der Vorwarnung.
    let loeschFehlgeschlagen = 0;
    let vorgewarnt = 0;
    let vorwarnFehlgeschlagen = 0;
    do {
      const jetzt = Date.now();
      const { users, pageToken } = await getAuth().listUsers(1000, seite);
      // Explizit gemappt, NIE `...u.metadata` gespreadet: `UserMetadata` ist
      // eine Klasseninstanz, deren Spread leere Felder liefern kann - das
      // hiesse "nie aktiv" und wuerde jedes Konto zur Loeschung auswaehlen.
      const metadaten = users.map((u) => ({
        uid: u.uid,
        creationTime: u.metadata.creationTime,
        lastSignInTime: u.metadata.lastSignInTime,
        lastRefreshTime: u.metadata.lastRefreshTime,
      }));
      const inaktiv = waehleInaktive(metadaten, jetzt);
      // Pro uid abgefangen: eine einzelne
      // fehlschlagende Loeschung darf weder den Lauf abbrechen noch die
      // uebrigen inaktiven Konten von der Aufraeumung ausschliessen, und den
      // Abschluss-Log darf sie erst recht nicht verhindern.
      for (const uid of inaktiv) {
        try {
          await loescheKonto(uid);
          geloescht++;
        } catch (fehler) {
          // Nur der Fehlername, nie die uid.
          logger.error("raeumeKontenAuf: Konto konnte nicht geloescht werden", { name: (fehler as Error).name });
          loeschFehlgeschlagen++;
        }
      }

      // Loesch-Vorwarnung: 30 Tage vor der Inaktivitaetsloeschung,
      // nur an bestaetigte Adressen. Das Fenster liegt weit unter der
      // Inaktivitaetsgrenze (335-341 von 365 Tagen) - dieselbe uid kann in
      // demselben Lauf nie sowohl vorgewarnt als auch geloescht werden.
      const nutzerByUid = new Map(users.map((u) => [u.uid, u]));
      for (const { uid, letzteAktivitaetMs } of waehleVorzuwarnende(metadaten, jetzt)) {
        const nutzer = nutzerByUid.get(uid);
        if (!nutzer || nutzer.emailVerified !== true || !nutzer.email) continue;
        try {
          const loeschtAm = formatiereDeutschesDatum(letzteAktivitaetMs + INAKTIV_TAGE * TAG_MS);
          const inhalt = vorwarnMail({ basis: PUBLIC_SITE_URL, loeschtAm });
          await sendeMail({
            apiKey: resendApiKey.value(),
            domain: resendDomain.value(),
            an: nutzer.email,
            inhalt,
          });
          vorgewarnt++;
        } catch (fehler) {
          // Nur der Fehlername, nie die uid/Adresse.
          logger.error("raeumeKontenAuf: Vorwarnung fehlgeschlagen", { name: (fehler as Error).name });
          vorwarnFehlgeschlagen++;
        }
      }

      seite = pageToken;
    } while (seite);

    // Verwaiste Kontodokumente: ein Dokument in `konten`, zu dem es kein
    // Auth-Konto mehr gibt (s. verwaisteKonten oben). `select()` ohne Felder,
    // weil hier ausschliesslich die Dokument-IDs gebraucht werden.
    let verwaistGeloescht = 0;
    let verwaistFehlgeschlagen = 0;
    let verwaistPruefungFehlgeschlagen = 0;
    const dokIds = (await getFirestore().collection(KONTEN_COLLECTION).select().get()).docs.map((d) => d.id);
    // Zusaetzlich JEDES Dokument unter irgendeiner
    // `privat`-Subcollection - das findet auch ein Konto, dessen ELTERN-
    // Dokument `konten/{uid}` fehlt, das aber unter `konten/{uid}/privat/*`
    // (Angaben/Unterlagen) noch Daten traegt (s. `uidAusPrivatPfad`).
    const privatUids = (await getFirestore().collectionGroup("privat").select().get()).docs
      .map((d) => uidAusPrivatPfad(d.ref.path))
      .filter((uid): uid is string => uid !== null);
    const alleDokIds = [...new Set([...dokIds, ...privatUids])];
    const gefundeneUids = new Set<string>();
    // Nur Bloecke, deren getUsers-Aufruf geklappt hat, gehen in die
    // Verwaist-Pruefung ein: scheitert ein Block, kann
    // fuer dessen IDs nicht entschieden werden, ob ein Auth-Konto existiert -
    // sie duerfen dann NICHT als verwaist gelten, sonst wuerden intakte
    // Konten geloescht, nur weil eine einzelne getUsers-Anfrage (transient)
    // fehlgeschlagen ist.
    const gepruefteDokIds: string[] = [];
    for (let i = 0; i < alleDokIds.length; i += GETUSERS_BLOCK) {
      const block = alleDokIds.slice(i, i + GETUSERS_BLOCK);
      try {
        const { users } = await getAuth().getUsers(block.map((uid) => ({ uid })));
        users.forEach((u) => gefundeneUids.add(u.uid));
        gepruefteDokIds.push(...block);
      } catch (fehler) {
        // Nur der Fehlername, nie die uids.
        logger.error("raeumeKontenAuf: Pruefung auf verwaiste Kontodokumente fehlgeschlagen", {
          name: (fehler as Error).name,
        });
        verwaistPruefungFehlgeschlagen++;
      }
    }
    for (const uid of verwaisteKonten(gepruefteDokIds, gefundeneUids)) {
      try {
        // loescheKonto faengt "auth/user-not-found" bereits selbst ab - fuer
        // ein verwaistes Dokument gibt es per Definition kein Auth-Konto mehr.
        await loescheKonto(uid);
        verwaistGeloescht++;
      } catch (fehler) {
        logger.error("raeumeKontenAuf: verwaistes Kontodokument konnte nicht geloescht werden", {
          name: (fehler as Error).name,
        });
        verwaistFehlgeschlagen++;
      }
    }

    // Verwaiste STORAGE-Praefixe unter `konten/` - das Gegenstueck
    // zu den verwaisten Kontodokumenten oben, aber in die andere Richtung:
    // Dateien ohne Auth-Konto (z.B. weil `loescheKonto` beim Storage-Teil
    // scheiterte). Dieselbe `loescheKonto`-Funktion raeumt beides auf einmal
    // auf (Firestore-Rest, falls doch vorhanden, UND die Storage-Dateien) -
    // ein zweiter Aufruf fuer eine uid, die oben schon behandelt wurde, ist
    // ein No-Op (recursiveDelete auf ein nicht (mehr) existierendes Dokument,
    // deleteFiles ohne Treffer).
    let storageVerwaistGeloescht = 0;
    let storageVerwaistFehlgeschlagen = 0;
    let storagePruefungFehlgeschlagen = 0;
    try {
      const praefixUids = await listeKontoPraefixeImBucket();
      const gefundeneStorageUids = new Set<string>();
      const gepruefteStorageUids: string[] = [];
      for (let i = 0; i < praefixUids.length; i += GETUSERS_BLOCK) {
        const block = praefixUids.slice(i, i + GETUSERS_BLOCK);
        try {
          const { users } = await getAuth().getUsers(block.map((uid) => ({ uid })));
          users.forEach((u) => gefundeneStorageUids.add(u.uid));
          gepruefteStorageUids.push(...block);
        } catch (fehler) {
          logger.error("raeumeKontenAuf: Pruefung auf verwaiste Storage-Praefixe fehlgeschlagen", {
            name: (fehler as Error).name,
          });
          storagePruefungFehlgeschlagen++;
        }
      }
      for (const uid of verwaisteKonten(gepruefteStorageUids, gefundeneStorageUids)) {
        try {
          await loescheKonto(uid);
          storageVerwaistGeloescht++;
        } catch (fehler) {
          logger.error("raeumeKontenAuf: verwaister Storage-Praefix konnte nicht geloescht werden", {
            name: (fehler as Error).name,
          });
          storageVerwaistFehlgeschlagen++;
        }
      }
    } catch (fehler) {
      // Das Listing selbst (getFiles) ist fehlgeschlagen - ohne die Liste laesst
      // sich kein einzelner Praefix einer uid zuordnen, also zaehlt das als
      // EINE fehlgeschlagene Pruefung, nicht als "kein verwaister Praefix".
      logger.error("raeumeKontenAuf: Listing der Storage-Praefixe fehlgeschlagen", { name: (fehler as Error).name });
      storagePruefungFehlgeschlagen++;
    }

    // Nur die Zahlen - nie uids. Immer geloggt, auch wenn ein getUsers-Block
    // fehlgeschlagen ist - die bis dahin gesammelten
    // Zaehler sollen nicht verloren gehen, nur weil danach noch geworfen wird.
    logger.info("raeumeKontenAuf abgeschlossen", {
      geloescht,
      loeschFehlgeschlagen,
      vorgewarnt,
      vorwarnFehlgeschlagen,
      verwaistGeloescht,
      verwaistFehlgeschlagen,
      verwaistPruefungFehlgeschlagen,
      storageVerwaistGeloescht,
      storageVerwaistFehlgeschlagen,
      storagePruefungFehlgeschlagen,
    });
    // Wirft am Ende, statt einzelne Fehler zu verschlucken: ein fehlgeschlagener
    // Lauf soll in der Scheduler-Ansicht als fehlgeschlagen auftauchen, nicht
    // nur im Log als Zahl versteckt sein. Die Meldung nennt JEDE Fehlerart
    // einzeln, damit eine reine Vorwarn-Panne nicht als gescheiterte
    // Loeschung erscheint.
    if (
      loeschFehlgeschlagen > 0 ||
      vorwarnFehlgeschlagen > 0 ||
      verwaistFehlgeschlagen > 0 ||
      verwaistPruefungFehlgeschlagen > 0 ||
      storageVerwaistFehlgeschlagen > 0 ||
      storagePruefungFehlgeschlagen > 0
    ) {
      throw new Error(
        `raeumeKontenAuf: ${loeschFehlgeschlagen} Loeschung(en) fehlgeschlagen, ` +
          `${vorwarnFehlgeschlagen} Vorwarnung(en) fehlgeschlagen, ` +
          `${verwaistFehlgeschlagen} verwaiste(s) Kontodokument(e) nicht geloescht, ` +
          `${verwaistPruefungFehlgeschlagen} Pruefung(en) auf verwaiste Konten fehlgeschlagen, ` +
          `${storageVerwaistFehlgeschlagen} verwaiste(r) Storage-Praefix(e) nicht geloescht, ` +
          `${storagePruefungFehlgeschlagen} Pruefung(en) auf verwaiste Storage-Praefixe fehlgeschlagen.`,
      );
    }
  },
);
