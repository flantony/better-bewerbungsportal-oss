/**
 * Stuendlicher Sweep fuer verwaiste Eingangs-Uploads - das Gegenstueck zur eigenen Aufraeumung in
 * `kontoHttp.kontoUnterlageUploadUrl` (die nur den EIGENEN Praefix des
 * gerade anfragenden Kontos abraeumt, bevor eine neue Upload-URL ausgestellt
 * wird). Dieser Lauf deckt den Fall ab, dass ein Bewerber nie zurueckkommt:
 * eine angeforderte, aber nie hochgeladene oder nie registrierte Datei soll
 * nicht dauerhaft unter
 * `konten/{uid}/eingang/{docId}` liegen bleiben, unsichtbar fuer Liste und
 * Export, aber trotzdem echte personenbezogene Daten.
 */
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { istAusstehendAbgelaufen, istVerwaisterUpload } from "./konto/unterlagen";
import { vergissAusstehendeUnterlage } from "./konto/kontoStore";
import { uidAusPrivatPfad } from "./raeumeKontenAuf";

const REGION = "europe-west3";

/**
 * "konten/{uid}/eingang/{docId}" -> { uid, docId } - reine Kernlogik, direkt
 * testbar. Alles, was nicht exakt diesem Muster entspricht (insbesondere
 * `konten/{uid}/dokumente/{docId}`, das registrierte Unterlagen), liefert
 * `null` und wird vom Sweep ignoriert - im Zweifel nicht loeschen.
 */
export function eingangAusPfad(pfad: string): { uid: string; docId: string } | null {
  const treffer = /^konten\/([^/]+)\/eingang\/([^/]+)$/.exec(pfad);
  return treffer ? { uid: treffer[1], docId: treffer[2] } : null;
}

/**
 * Serverseitiger Filter (`matchGlob` gibt es in
 * @google-cloud/storage 7.x): `*` passt auf genau ein Pfadsegment (die uid),
 * `**` auf den Rest - gelistet werden nur Eingangs-Objekte, nicht der
 * gesamte `konten/`-Bestand samt aller registrierten Unterlagen.
 */
const EINGANG_GLOB = "konten/*/eingang/**";

/**
 * "konten/{uid}/pakete/{paketId}.zip" -> { uid, paketId } - dasselbe
 * Muster wie `eingangAusPfad`, eigene Funktion statt einer generischeren
 * Regex, damit ein spaeterer Formatwechsel eines der beiden Muster den
 * anderen Sweep nicht beeinflusst.
 */
export function paketAusPfad(pfad: string): { uid: string; paketId: string } | null {
  const treffer = /^konten\/([^/]+)\/pakete\/([^/]+)$/.exec(pfad);
  return treffer ? { uid: treffer[1], paketId: treffer[2] } : null;
}

/** Serverseitiger Filter wie `EINGANG_GLOB`, nur fuer befristete Bewerbungspakete. */
const PAKET_GLOB = "konten/*/pakete/**";

/**
 * Listet die Objekte unter `konten/*\/eingang/` (per `matchGlob`, s. oben)
 * und blaettert dabei selbst weiter (`autoPaginate: false` + `nextQuery`-Schleife,
 * dieselbe Notwendigkeit wie in raeumeKontenAuf.ts) -
 * `eingangAusPfad` sortiert als zweite Sicherung alles aus, was kein Eingangs-Objekt ist.
 *
 * Loeschen und `ausstehend`-Eintrag entfernen sind BEIDE Best-Effort: eine
 * einzelne fehlgeschlagene Datei darf weder den Lauf abbrechen noch die
 * uebrigen verwaisten Objekte von der Aufraeumung ausschliessen. Nur
 * Zaehler werden geloggt, nie uid/docId.
 */
export async function raeumeVerwaisteEingaenge(jetzt: number): Promise<{ geloescht: number; fehlgeschlagen: number }> {
  let geloescht = 0;
  let fehlgeschlagen = 0;
  let query: Record<string, unknown> | null = { prefix: "konten/", matchGlob: EINGANG_GLOB, autoPaginate: false };

  while (query) {
    const ergebnis = (await getStorage().bucket().getFiles(query)) as unknown as [
      { name: string; metadata: { timeCreated?: string }; delete: (opts?: { ignoreNotFound?: boolean }) => Promise<unknown> }[],
      Record<string, unknown> | null | undefined,
      unknown,
    ];
    const [dateien, nextQuery] = ergebnis;

    for (const datei of dateien) {
      const treffer = eingangAusPfad(datei.name);
      if (!treffer) continue;
      const erstelltMs = Date.parse(datei.metadata.timeCreated ?? "");
      if (Number.isNaN(erstelltMs) || !istVerwaisterUpload(erstelltMs, jetzt)) continue;

      try {
        await datei.delete({ ignoreNotFound: true });
        try {
          await vergissAusstehendeUnterlage(treffer.uid, treffer.docId);
        } catch (fehler) {
          logger.error("raeumeUploadsAuf: ausstehender Eintrag konnte nicht entfernt werden", {
            name: (fehler as Error).name,
          });
        }
        geloescht++;
      } catch (fehler) {
        logger.error("raeumeUploadsAuf: verwaistes Eingangs-Objekt konnte nicht geloescht werden", {
          name: (fehler as Error).name,
        });
        fehlgeschlagen++;
      }
    }

    query = (nextQuery as Record<string, unknown> | null) ?? null;
  }

  return { geloescht, fehlgeschlagen };
}

/**
 * Loescht befristete Bewerbungspakete (`konten/{uid}/pakete/{paketId}.zip`),
 * die aelter als die Stundenfrist sind - dasselbe `matchGlob`-Muster wie
 * `raeumeVerwaisteEingaenge`, nur ohne `ausstehend`-Gegenstueck: ein Paket hat
 * kein Firestore-Pendant, das mitaufzuraeumen waere, und `kontoBewerbungspaketBauen`
 * loescht die eigenen ALTEN Pakete ohnehin schon bei jedem Neubau (s.
 * kontoHttp.ts) - dieser Sweep faengt nur das Paket ab, das nach dem letzten
 * Neubau nie abgeholt wurde.
 */
export async function raeumeVerwaistePakete(jetzt: number): Promise<{ geloescht: number; fehlgeschlagen: number }> {
  let geloescht = 0;
  let fehlgeschlagen = 0;
  let query: Record<string, unknown> | null = { prefix: "konten/", matchGlob: PAKET_GLOB, autoPaginate: false };

  while (query) {
    const ergebnis = (await getStorage().bucket().getFiles(query)) as unknown as [
      { name: string; metadata: { timeCreated?: string }; delete: (opts?: { ignoreNotFound?: boolean }) => Promise<unknown> }[],
      Record<string, unknown> | null | undefined,
      unknown,
    ];
    const [dateien, nextQuery] = ergebnis;

    for (const datei of dateien) {
      if (!paketAusPfad(datei.name)) continue;
      const erstelltMs = Date.parse(datei.metadata.timeCreated ?? "");
      if (Number.isNaN(erstelltMs) || !istVerwaisterUpload(erstelltMs, jetzt)) continue;

      try {
        await datei.delete({ ignoreNotFound: true });
        geloescht++;
      } catch (fehler) {
        logger.error("raeumeUploadsAuf: veraltetes Paket konnte nicht geloescht werden", {
          name: (fehler as Error).name,
        });
        fehlgeschlagen++;
      }
    }

    query = (nextQuery as Record<string, unknown> | null) ?? null;
  }

  return { geloescht, fehlgeschlagen };
}

/**
 * Raeumt `ausstehend`-Eintraege ab, die aelter als die Stundenfrist sind -
 * UNABHAENGIG davon, ob (noch) ein zugehoeriges Eingangs-Objekt existiert:
 * nach einem gescheiterten Best-Effort-Loeschversuch
 * (oder wenn das Objekt schon vorher weg war) traegt ein liegen gebliebener
 * Eintrag sonst auf unbestimmte Zeit einen Dateinamen weiter mit sich herum,
 * unsichtbar fuer den storage-basierten Sweep oben.
 *
 * `collectionGroup("privat")` findet JEDES Dokument unter irgendeiner
 * `privat`-Subcollection, egal unter welchem `konten/{uid}` - dieselbe
 * Abfrage wie in raeumeKontenAuf.ts, hier aber gefiltert auf das Dokument
 * `dokumente` (nur das kann `ausstehend` tragen). `.select("ausstehend")`
 * liest nicht auch noch `eintraege` mit.
 */
export async function raeumeVerwaisteAusstehendeEintraege(jetzt: number): Promise<{ geloescht: number; fehlgeschlagen: number }> {
  let geloescht = 0;
  let fehlgeschlagen = 0;

  const snap = await getFirestore().collectionGroup("privat").select("ausstehend").get();
  for (const doc of snap.docs) {
    if (doc.id !== "dokumente") continue;
    const uid = uidAusPrivatPfad(doc.ref.path);
    if (!uid) continue;

    const rohAusstehend = (doc.data() as { ausstehend?: unknown }).ausstehend;
    const ausstehend = typeof rohAusstehend === "object" && rohAusstehend !== null ? (rohAusstehend as Record<string, unknown>) : {};
    for (const [docId, eintrag] of Object.entries(ausstehend)) {
      const erstelltAm = typeof eintrag === "object" && eintrag !== null ? (eintrag as { erstelltAm?: unknown }).erstelltAm : undefined;
      if (istAusstehendAbgelaufen(erstelltAm, jetzt)) {
        try {
          await vergissAusstehendeUnterlage(uid, docId);
          geloescht++;
        } catch (fehler) {
          logger.error("raeumeUploadsAuf: verwaister ausstehend-Eintrag konnte nicht entfernt werden", {
            name: (fehler as Error).name,
          });
          fehlgeschlagen++;
        }
      }
    }
  }

  return { geloescht, fehlgeschlagen };
}

type SweepErgebnis = { geloescht: number; fehlgeschlagen: number };

/**
 * Die drei Sweeps laufen unabhaengig voneinander: wirft einer
 * (z.B. eine Firestore-Abfrage), laufen die anderen trotzdem - insbesondere
 * der Paket-Sweep, der befristete Pakete mit Bewerberangaben abraeumt. Ein
 * abgebrochener Schritt zaehlt in `abgebrochen` (nur der Fehlername wird geloggt).
 */
export async function fuehreUploadAufraeumenAus(jetzt: number): Promise<{
  eingaenge: SweepErgebnis;
  ausstehende: SweepErgebnis;
  pakete: SweepErgebnis;
  abgebrochen: number;
}> {
  let abgebrochen = 0;
  const leer: SweepErgebnis = { geloescht: 0, fehlgeschlagen: 0 };
  const sicher = async (schritt: string, lauf: () => Promise<SweepErgebnis>): Promise<SweepErgebnis> => {
    try {
      return await lauf();
    } catch (fehler) {
      abgebrochen++;
      logger.error(`raeumeUploadsAuf: Schritt ${schritt} abgebrochen`, { name: (fehler as Error).name });
      return leer;
    }
  };
  const eingaenge = await sicher("eingaenge", () => raeumeVerwaisteEingaenge(jetzt));
  const ausstehende = await sicher("ausstehende", () => raeumeVerwaisteAusstehendeEintraege(jetzt));
  const pakete = await sicher("pakete", () => raeumeVerwaistePakete(jetzt));
  return { eingaenge, ausstehende, pakete, abgebrochen };
}

/**
 * Stuendlich statt taeglich/woechentlich (anders als raeumeKontenAuf/
 * raeumeMappenAuf) - die Frist selbst ist nur eine Stunde
 * (`EINGANG_FRIST_MS`), ein selteneren Lauf liesse verwaiste Objekte
 * entsprechend laenger liegen.
 */
export const raeumeUploadsAufScheduled = onSchedule(
  { schedule: "0 * * * *", timeZone: "Europe/Berlin", region: REGION, timeoutSeconds: 540 },
  async () => {
    const { eingaenge, ausstehende, pakete, abgebrochen } = await fuehreUploadAufraeumenAus(Date.now());
    logger.info("raeumeUploadsAuf abgeschlossen", {
      eingaengeGeloescht: eingaenge.geloescht,
      eingaengeFehlgeschlagen: eingaenge.fehlgeschlagen,
      ausstehendeGeloescht: ausstehende.geloescht,
      ausstehendeFehlgeschlagen: ausstehende.fehlgeschlagen,
      paketeGeloescht: pakete.geloescht,
      paketeFehlgeschlagen: pakete.fehlgeschlagen,
      schritteAbgebrochen: abgebrochen,
    });
    if (abgebrochen > 0 || eingaenge.fehlgeschlagen > 0 || ausstehende.fehlgeschlagen > 0 || pakete.fehlgeschlagen > 0) {
      throw new Error(
        `raeumeUploadsAuf: ${abgebrochen} Schritt(e) abgebrochen, ` +
          `${eingaenge.fehlgeschlagen} verwaiste(s) Eingangs-Objekt(e) nicht geloescht, ` +
          `${ausstehende.fehlgeschlagen} verwaiste(r) ausstehend-Eintrag(e) nicht entfernt, ` +
          `${pakete.fehlgeschlagen} veraltete(s) Paket(e) nicht geloescht.`,
      );
    }
  },
);
