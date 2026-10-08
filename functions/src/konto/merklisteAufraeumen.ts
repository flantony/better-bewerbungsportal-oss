/**
 * Geschlossene Stellen verlassen die Merkliste - alle Eintraege, selbst
 * gemerkte wie aus der Mail. Laeuft
 * naechtlich mit `benachrichtigeScheduled` (04:00, nach dem Sync um 01:00, der
 * `active` setzt). Was "geschlossen" heisst, steht an `istGeschlossen`.
 *
 * KOSTEN, bewusst begrenzt: je Konto ein Lesevorgang (nur das Feld
 * `merkliste`), je verschiedener gemerkter Stelle einer (`getAll` mit
 * Feldmaske, in Bloecken), und eine Transaktion nur fuer Konten, bei denen
 * wirklich etwas wegfaellt. Ein Fehler beim Nachschlagen der Stellen bricht
 * den ganzen Lauf ab, ohne etwas zu loeschen - im Zweifel bleibt ein Eintrag
 * eine Nacht laenger stehen. Dasselbe, wenn `jobsV2` unplausibel wenige
 * aktive Stellen meldet (`MIN_AKTIVE_STELLEN`). Geloggt werden nur Zahlen.
 */
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { KONTEN_COLLECTION } from "./kontoTypen";
import { entferneGeschlosseneVonMerkliste } from "./kontoStore";
import { istGeschlossen } from "./merkliste";
import { JOBS_V2_COLLECTION } from "../lib/jobsV2Shape";

/** So viele Stellen je `getAll`. */
const GETALL_BLOCK = 100;

/**
 * Plausibilitaetsbremse: liefert `jobsV2` weniger aktive Stellen als das,
 * stimmt mit dem Bestand etwas nicht (abgebrochener Sync, Migration,
 * Teil-Loeschung) - dann wuerde "fehlt" oder "active: false" jede Merkliste
 * leeren, und das laesst sich nicht rueckgaengig machen. Ueblich sind rund
 * 1.000 aktive Stellen.
 */
export const MIN_AKTIVE_STELLEN = 200;

export class BestandUnplausibelError extends Error {
  constructor(aktive: number) {
    super(`jobsV2 meldet nur ${aktive} aktive Stellen - Aufraeumen der Merklisten abgebrochen.`);
    this.name = "BestandUnplausibelError";
  }
}

export interface MerklistenAufraeumung {
  /** Konten mit mindestens einem Eintrag auf der Merkliste. */
  kontenMitMerkliste: number;
  /** Verschiedene gemerkte Stellen, nachgeschlagen in `jobsV2`. */
  stellenGeprueft: number;
  geschlosseneStellen: number;
  /** Konten, deren Merkliste gekuerzt wurde (im Trockenlauf: gekuerzt wuerde). */
  kontenBereinigt: number;
  eintraegeEntfernt: number;
  fehlgeschlagen: number;
}

/**
 * Die Stellen-IDs einer gelesenen Merkliste, ohne Kaputtes: nur nicht-leere
 * Texte ohne "/" (sonst wirft `doc()` beim Nachschlagen in `jobsV2`).
 */
export function merklistenIds(merkliste: unknown): string[] {
  if (!Array.isArray(merkliste)) return [];
  return merkliste
    .map((eintrag) => (eintrag && typeof eintrag === "object" ? (eintrag as { pinstGuid?: unknown }).pinstGuid : undefined))
    .filter((id): id is string => typeof id === "string" && id !== "" && !id.includes("/"));
}

export async function raeumeMerklistenAuf(params: { jetzt: number; trockenlauf: boolean }): Promise<MerklistenAufraeumung> {
  const { jetzt, trockenlauf } = params;
  const db = getFirestore();
  const ergebnis: MerklistenAufraeumung = {
    kontenMitMerkliste: 0,
    stellenGeprueft: 0,
    geschlosseneStellen: 0,
    kontenBereinigt: 0,
    eintraegeEntfernt: 0,
    fehlgeschlagen: 0,
  };

  const konten = await db.collection(KONTEN_COLLECTION).select("merkliste").get();
  const idsJeKonto = new Map<string, string[]>();
  for (const doc of konten.docs) {
    const ids = merklistenIds(doc.get("merkliste"));
    if (ids.length > 0) idsJeKonto.set(doc.id, ids);
  }
  ergebnis.kontenMitMerkliste = idsJeKonto.size;
  if (idsJeKonto.size === 0) {
    logger.info("raeumeMerklistenAuf abgeschlossen", { ...ergebnis, trockenlauf });
    return ergebnis;
  }

  // Erst den Bestand pruefen, dann entscheiden (s. MIN_AKTIVE_STELLEN). Eine
  // Zaehl-Aggregation kostet einen Lesevorgang je 1.000 Indexeintraege.
  const aktive = (await db.collection(JOBS_V2_COLLECTION).where("active", "==", true).count().get()).data().count;
  if (aktive < MIN_AKTIVE_STELLEN) throw new BestandUnplausibelError(aktive);

  const alleIds = [...new Set([...idsJeKonto.values()].flat())];
  ergebnis.stellenGeprueft = alleIds.length;
  const geschlossen = new Set<string>();
  for (let i = 0; i < alleIds.length; i += GETALL_BLOCK) {
    const refs = alleIds.slice(i, i + GETALL_BLOCK).map((id) => db.collection(JOBS_V2_COLLECTION).doc(id));
    const snaps = await db.getAll(...refs, { fieldMask: ["active"] });
    for (const snap of snaps) {
      if (istGeschlossen({ exists: snap.exists, active: snap.exists ? snap.get("active") : undefined })) {
        geschlossen.add(snap.id);
      }
    }
  }
  ergebnis.geschlosseneStellen = geschlossen.size;

  if (geschlossen.size > 0) {
    for (const [uid, ids] of idsJeKonto) {
      const betroffen = ids.filter((id) => geschlossen.has(id)).length;
      if (betroffen === 0) continue;
      if (trockenlauf) {
        ergebnis.kontenBereinigt++;
        ergebnis.eintraegeEntfernt += betroffen;
        continue;
      }
      try {
        const entfernt = await entferneGeschlosseneVonMerkliste(uid, geschlossen, jetzt);
        if (entfernt > 0) {
          ergebnis.kontenBereinigt++;
          ergebnis.eintraegeEntfernt += entfernt;
        }
      } catch (fehler) {
        // Nur der Fehlername, nie die uid.
        logger.error("raeumeMerklistenAuf: Konto fehlgeschlagen", { name: (fehler as Error).name });
        ergebnis.fehlgeschlagen++;
      }
    }
  }

  logger.info("raeumeMerklistenAuf abgeschlossen", { ...ergebnis, trockenlauf });
  return ergebnis;
}
