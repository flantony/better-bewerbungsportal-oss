/**
 * Die Cloud Functions dieses Projekts.
 *
 * Mit der Bewerbungsmappe gibt es eine transiente Nutzerdaten-
 * Ablage: eine Mappe lebt hoechstens eine Stunde nach Paketbau (bzw. nach der
 * letzten Aenderung, falls nie ein Paket entstand) und wird danach durch eine
 * geplante Function geraeumt (s. `mappe/ablauf.ts` fuer die Frist). Die
 * Mappen-Kennung ist dort der einzige Zugriffsschutz.
 *
 * Zusaetzlich gibt es ein optionales,
 * dauerhaftes Konto (`konten/{uid}`, s. `konto/kontoTypen.ts`): Suchprofil und
 * Merkliste, angelegt beim ersten Laden, geschuetzt durch Firebase-Auth-
 * ID-Token (`kontoHttp.ts`) und nach 365 Tagen ohne Anmeldung automatisch
 * geloescht (`raeumeKontenAuf.ts`). Den tatsaechlichen Verarbeitungsstand mit
 * Risikoeinschaetzung haelt `DSFA.md` fest, nicht dieser Kommentar.
 *
 * Ausserhalb von Mappe und Konto gilt: was ein Bewerber ueber sich
 * preisgibt, bleibt zwischen ihm und seinem eigenen KI-Tool; wir liefern die
 * oeffentlichen Ausschreibungsdaten. `jobsV2` (samt `content`) und `glossary`
 * sind oeffentlich lesbar (s. firestore.rules), dafuer ist keine Anmeldung
 * noetig; `jobDocuments` und `jobs` liest nur der Server.
 */
import { initializeApp } from "firebase-admin/app";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { runSync } from "./sync";
import { syncManualSecret } from "./lib/secrets";
import { tokenPasst } from "./konto/benachrichtigung";

initializeApp();

const REGION = "europe-west3";
/**
 * Der Sync extrahiert die Anforderungen NEUER Stellen aus dem Fließtext
 * (s. sync.ts). Ohne diesen Key liefe er zwar durch, legte neue Stellen aber
 * ohne `jobAttributes` an. Der Kostenrahmen bleibt klein: betroffen sind die
 * Neuzugänge pro Nacht (meist eine Handvoll), nicht der Bestand.
 */
const geminiApiKey = defineSecret("GEMINI_API_KEY");

/** Täglicher Sync aller Bundeswehr-Ausschreibungen nach Firestore. */
export const syncJobsScheduled = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "Europe/Berlin",
    region: REGION,
    timeoutSeconds: 540,
    // 256 MiB reichen nicht: die Verarbeitung neuer Stellen (Anhaenge, Gemini)
    // ueberschreitet sie knapp. Ein Lauf pro Nacht - der Aufpreis ist klein.
    memory: "512MiB",
    secrets: [geminiApiKey],
  },
  async () => {
    const summary = await runSync(undefined, geminiApiKey.value());
    logger.info("syncJobsScheduled abgeschlossen", summary);
  },
);

/**
 * Manueller Trigger für Debugging/On-Demand-Sync. Erfordert den Header
 * `x-sync-secret` mit dem Wert von SYNC_MANUAL_SECRET (Secret Manager) -
 * ohne gültigen Header 401, damit der öffentlich erreichbare HTTP-Endpunkt
 * nicht beliebig Sync-Läufe (und damit Bundeswehr-API-Traffic) auslösen kann.
 */
export const syncJobsManual = onRequest(
  { region: REGION, timeoutSeconds: 540, memory: "512MiB", secrets: [syncManualSecret, geminiApiKey] },
  async (req, res) => {
    // Konstante Zeit statt `!==` auf dem Secret.
    if (!tokenPasst(syncManualSecret.value(), req.get("x-sync-secret"))) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const summary = await runSync(undefined, geminiApiKey.value());
      res.status(200).json(summary);
    } catch (err) {
      logger.error("syncJobsManual fehlgeschlagen", err);
      // Nur die Fehlerklasse in der Antwort -
      // der Text steht im Log, und dort liest ihn, wer ihn braucht.
      res.status(500).json({ error: err instanceof Error ? err.name : "unbekannt" });
    }
  },
);

export { mcpServer } from "./mcp/server";

export { kiSeite } from "./kiSeite";

export { mappeUploadUrl, mappeRegisterDocument, mappeDeleteDocument, mappeDownload } from "./mappeHttp";

export { raeumeMappenAufScheduled } from "./raeumeMappenAuf";

export {
  kontoLaden,
  kontoSuchprofileAendern,
  kontoSuchprofilTreffer,
  kontoMerklisteAendern,
  kontoLoeschen,
  kontoBenachrichtigungSetzen,
  kontoAbbestellen,
  kontoAngabenLaden,
  kontoAngabenSpeichern,
  kontoStaatsangehoerigkeitWiderrufen,
  kontoAngabenLoeschen,
  kontoUnterlageUploadUrl,
  kontoUnterlageRegistrieren,
  kontoUnterlagen,
  kontoUnterlageDownloadUrl,
  kontoUnterlageLoeschen,
  kontoExport,
  kontoBewerbungsplan,
  kontoBewerbungspaketBauen,
} from "./kontoHttp";

export { raeumeKontenAufScheduled } from "./raeumeKontenAuf";

export { raeumeUploadsAufScheduled } from "./raeumeUploadsAuf";

export { benachrichtigeScheduled, benachrichtigeManual } from "./benachrichtige";
