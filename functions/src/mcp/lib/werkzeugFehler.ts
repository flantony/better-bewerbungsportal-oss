import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HinweisFehler } from "../../lib/hinweisFehler";

/**
 * WOZU: Das SDK beantwortet jeden gescheiterten Werkzeugaufruf - ungueltige
 * Eingabe wie Fehler im Handler - mit HTTP 200 und `isError: true`, und loggt
 * nichts - ein Werkzeug kann dutzendfach scheitern, ohne dass im Log
 * irgendetwas davon steht. Diese Datei protokolliert
 * jeden solchen Fehler mit Werkzeugname, Fehlerart und
 * - bei Eingabefehlern: Feldpfad und Zod-Code,
 * - bei Handler-Fehlern: Fehlerklasse und Statuscode.
 * Nie einen Fehlertext und nie einen Wert: in fuelle_formular stehen Name,
 * Anschrift, Geburtsdatum und Staatsangehoerigkeit (Art. 9), und Storage-/
 * Firestore-Meldungen tragen Objektpfade mit der mappenId - dem einzigen
 * Zugriffsschutz einer Mappe.
 */

export type WerkzeugFehlerArt = "eingabe" | "ausfuehrung" | "unbekanntes-werkzeug";

export interface WerkzeugFehlerProtokoll {
  werkzeug: string;
  art: WerkzeugFehlerArt;
  /** Nur bei `eingabe`: Feldpfad und Zod-Fehlercode, ohne Wert. */
  felder?: { pfad: string; code: string; unbekannteNamen?: string[] }[];
  /** Nur bei `ausfuehrung`: Klasse des geworfenen Fehlers, z.B. MappeNichtGefundenError. */
  fehlerklasse?: string;
  /** Nur bei `ausfuehrung`: gRPC-/HTTP-Statuscode, falls der Fehler einen traegt. */
  statuscode?: string | number;
}

interface ZodAehnlicherFehler {
  issues: { path: (string | number)[]; code: string; keys?: string[] }[];
}

interface ParsbaresSchema {
  safeParse(eingabe: unknown): { success: boolean; error?: ZodAehnlicherFehler };
}

const NAME_MUSTER = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const MAX_UNBEKANNTE_NAMEN = 10;
const UNGUELTIGER_NAME = "(ungueltiger Name)";

/**
 * Werkzeug- und Parameternamen waehlt der Client frei; ein Schluessel kann
 * beliebigen Text tragen. Durch kommt nur, was wie ein Bezeichner aussieht.
 */
export function bereinigeName(name: unknown): string {
  return typeof name === "string" && NAME_MUSTER.test(name) ? name : UNGUELTIGER_NAME;
}

export function beschreibeEingabefehler(
  werkzeug: string,
  argumente: unknown,
  schema: ParsbaresSchema | undefined,
): WerkzeugFehlerProtokoll | null {
  if (!schema) return { werkzeug: bereinigeName(werkzeug), art: "unbekanntes-werkzeug" };

  const pruefung = schema.safeParse(argumente ?? {});
  if (pruefung.success || !pruefung.error) return null;
  return {
    werkzeug,
    art: "eingabe",
    felder: pruefung.error.issues.map((issue) => ({
      // Pfade kommen aus den Schema-Schluesseln (kein z.record, keine Union),
      // tragen also nie einen Wert.
      pfad: issue.path.map((teil) => (typeof teil === "number" ? String(teil) : bereinigeName(teil))).join(".") ||
        "(ganze Eingabe)",
      code: issue.code,
      // Bei unbekannten Parametern sind die NAMEN die Auskunft (erfundene
      // Feldnamen), nicht deren Werte.
      ...(issue.keys?.length ? { unbekannteNamen: issue.keys.slice(0, MAX_UNBEKANNTE_NAMEN).map(bereinigeName) } : {}),
    })),
  };
}

export function beschreibeAusfuehrungsfehler(werkzeug: string, fehler: unknown): WerkzeugFehlerProtokoll {
  const protokoll: WerkzeugFehlerProtokoll = { werkzeug, art: "ausfuehrung" };
  if (fehler instanceof Error) {
    protokoll.fehlerklasse = bereinigeName(fehler.name !== "Error" ? fehler.name : fehler.constructor?.name);
  }
  const code = (fehler as { code?: unknown } | null)?.code;
  if (typeof code === "number" || (typeof code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(code))) {
    protokoll.statuscode = code;
  }
  return protokoll;
}

/**
 * Was die fremde KI bei einem Fehler liest, den wir NICHT selbst formuliert
 * haben. Das SDK reicht sonst jede `Error.message` durch - auch Firestore-/Storage-Meldungen, die einen
 * Objektpfad mit der `mappenId` tragen koennen. Der Satz nennt den naechsten
 * Schritt, damit aus dem Fehler keine erfundene Antwort wird.
 */
export const UNERWARTETER_WERKZEUGFEHLER =
  "Bei diesem Aufruf ist auf dem Server ein unerwarteter Fehler aufgetreten - das liegt nicht an deiner Eingabe. " +
  "Versuche denselben Aufruf in einer Minute noch einmal. Scheitert er wieder, sag dem Bewerber, dass der Dienst " +
  "gerade gestört ist, und erfinde keine Ergebnisse.";

/**
 * Laesst nur Fehler mit einem fuer den Client bestimmten Text durch
 * (`HinweisFehler` und Unterklassen, s. lib/hinweisFehler.ts); alles andere wird
 * durch `UNERWARTETER_WERKZEUGFEHLER` ersetzt.
 */
export function fuerDenClient(fehler: unknown): Error {
  return fehler instanceof HinweisFehler ? fehler : new Error(UNERWARTETER_WERKZEUGFEHLER);
}

type AnfrageHandler = (anfrage: unknown, extra: unknown) => Promise<unknown>;
type WerkzeugHandler = (...argumente: unknown[]) => Promise<unknown>;

interface ToolsCallAnfrage {
  params?: { name?: unknown; arguments?: unknown };
}

/**
 * Haengt sich an zwei Stellen ins SDK, das dafuer keinen oeffentlichen Haken
 * bietet (`_registeredTools`, `_requestHandlers` sind private Felder):
 * - um jeden Werkzeug-Handler, damit Handler-Fehler mit ihrer Klasse statt
 *   ihres Textes protokolliert werden - und nach aussen nur ein fuer den Client
 *   bestimmter Text geht (`fuerDenClient`),
 * - um `tools/call`, damit auch Eingabefehler und unbekannte Werkzeuge, die den
 *   Handler nie erreichen, im Log stehen.
 * Fehlen die Felder nach einem SDK-Update, warnt der Server einmal und laeuft
 * ohne Protokoll weiter - werkzeugFehler.test.ts faellt dann durch.
 * Muss NACH allen registerTool-Aufrufen laufen.
 */
export function protokolliereWerkzeugFehler(server: McpServer): void {
  const intern = server as unknown as {
    _registeredTools?: Record<string, { inputSchema?: ParsbaresSchema; handler?: WerkzeugHandler }>;
    server: { _requestHandlers?: Map<string, AnfrageHandler> };
  };
  const werkzeuge = intern._registeredTools;
  const handlers = intern.server._requestHandlers;
  const original = handlers?.get("tools/call");
  if (!werkzeuge || !handlers || !original) {
    console.warn("mcpServer: Werkzeugfehler-Protokoll nicht aktiv (SDK-Interna geaendert)");
    return;
  }

  for (const [name, werkzeug] of Object.entries(werkzeuge)) {
    const handler = werkzeug.handler;
    if (typeof handler !== "function") continue;
    werkzeug.handler = async (...argumente: unknown[]) => {
      try {
        return await handler(...argumente);
      } catch (fehler) {
        console.warn("mcpServer: Werkzeugfehler", beschreibeAusfuehrungsfehler(name, fehler));
        throw fuerDenClient(fehler);
      }
    };
  }

  handlers.set("tools/call", async (anfrage, extra) => {
    const ergebnis = (await original(anfrage, extra)) as { isError?: boolean };
    if (ergebnis?.isError) {
      const params = (anfrage as ToolsCallAnfrage).params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      const schema = Object.hasOwn(werkzeuge, name) ? werkzeuge[name]?.inputSchema : undefined;
      // Handler-Fehler hat der Handler-Wrapper schon protokolliert; hier nur,
      // was den Handler nie erreicht hat.
      const protokoll = beschreibeEingabefehler(name, params.arguments, schema);
      if (protokoll) console.warn("mcpServer: Werkzeugfehler", protokoll);
    }
    return ergebnis;
  });
}
