/**
 * KI-Extraktion der Anforderungen, die in den Ausschreibungstexten nur als
 * Fliesstext stehen - Dienstgrad, Abschluss, Seiteneinstieg, Sicherheits-
 * ueberpruefung, Sprachen, Berufserfahrung.
 *
 * WARUM UEBERHAUPT KI: die strukturierten Felder der API sind dafuer leer
 * (`besGruppe`, `laufbahn`, `shlpBesoldGrp` bleiben unbefuellt). Was es
 * gibt, steht in `jobDesc`/`requireDesc`/`remarcDesc` als Prosa.
 *
 * WARUM NICHT REGEX: der entscheidende Fall ist die Unterscheidung
 * "Einstellung als Hauptmann nach §25 SLV" (Anforderung der Stelle) von
 * "Ihre Ansprechpartnerin, Hauptmann Mueller" (Kontaktperson). Beides steht im
 * selben Text, oft im selben Absatz. Das ist eine Bedeutungsfrage, keine
 * Musterfrage - ein Parser kann das nicht.
 *
 * ARBEITSTEILUNG mit lib/besoldung.ts: die KI extrahiert NUR den Dienstgrad im
 * Kontext. Die Zuordnung Dienstgrad -> Besoldungsgruppe macht anschliessend die
 * amtliche Tabelle (Anlage I BBesG), nicht das Modell - so kann keine
 * Besoldungsangabe halluziniert werden.
 *
 * KEINE PII: verarbeitet werden ausschliesslich oeffentliche Ausschreibungs-
 * texte, keinerlei Bewerberdaten (s. DSFA.md).
 */
import * as z from "zod";
import { GoogleGenAI } from "@google/genai";
import { logger } from "firebase-functions";
import { deriveBesoldung, type Laufbahngruppe } from "./lib/besoldung";
import type { JobContentRecord } from "./types";
import { normalisiereUnterlagen } from "./lib/unterlagen";

const AI_MODEL = "gemini-3.5-flash";
/**
 * Mindest-/Hoechstalter und Verpflichtungsdauer gehoeren zum Schema, weil
 * "bin ich mit 34 noch zu alt?" und "wie lange muss ich mich verpflichten?"
 * fuer militaerische Laufbahnen die haeufigsten K.-o.-Kriterien ueberhaupt
 * sind - und ausschliesslich im Fliesstext stehen.
 */
export const SCHEMA_VERSION = "job-attributes-v2";

/** Obergrenze pro Textfeld - schuetzt vor Ausreissern im Prompt-Budget. */
const MAX_FIELD_CHARS = 6_000;

/**
 * `jobAttributesAiSchema`: Firestore-Daten werden vor jedem LLM-Forward
 * gefiltert. Bewusst nur die drei Felder, die Anforderungen beschreiben -
 * `companyDesc` (Werbetext ueber die Dienststelle) und `contactDesc` (enthaelt
 * Namen und Dienstgrade von Ansprechpartnern!) werden NICHT mitgeschickt.
 * Letzteres ist kein Zufall: so kann die Kontaktperson gar nicht erst als
 * Stellenanforderung missverstanden werden.
 */
const jobAttributesAiSchema = z.object({
  jobDesc: z.string(),
  requireDesc: z.string(),
  remarcDesc: z.string(),
});

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    dienstgrad: {
      type: "string",
      description:
        "Dienstgrad, mit dem eingestellt wird bzw. der gefordert ist. Leerer String, wenn keiner genannt ist oder der Dienstgrad nur zu einer Kontaktperson gehört.",
    },
    abschluss: {
      type: "string",
      description: "Geforderter Bildungsabschluss, z.B. 'Bachelor Informatik', 'Mittlere Reife'. Leer, wenn keiner genannt.",
    },
    seiteneinstieg: {
      type: "string",
      enum: ["ja", "nein", "unklar"],
      // "unklar" und "nein" sind ausdruecklich voneinander abgegrenzt, sonst
      // verteilt das Modell dieselbe Beobachtung auf zwei Werte. "unklar" ist
      // der erwartete Normalfall: fast alle Ausschreibungen sagen im Text
      // ueberhaupt nichts dazu.
      description:
        "Sagt der Ausschreibungstext, dass es ein Seiteneinstieg/Quereinstieg für Berufserfahrene ist? " +
        "'ja' = der Text sagt es ausdrücklich (das Wort oder eine klare Umschreibung kommt vor). " +
        "'nein' = der Text schließt es aus, z.B. weil ausdrücklich eine Erstausbildung oder ein " +
        "Anwärtermodell ohne Anrechnung von Berufserfahrung beschrieben wird. " +
        "'unklar' = der Text äußert sich dazu gar nicht - das ist der häufigste Fall und keine " +
        "Verlegenheitsantwort. Verwende NICHT 'nein', wenn du nur nichts gefunden hast; 'nein' ist " +
        "eine Aussage über den Text, nicht über deine Unsicherheit.",
    },
    sicherheitsueberpruefung: {
      type: "string",
      description: "Geforderte Sicherheitsüberprüfung, z.B. 'Ü2'. Leer, wenn keine genannt.",
    },
    sprachen: {
      type: "array",
      items: { type: "string" },
      description: "Ausdrücklich geforderte Sprachkenntnisse, z.B. ['Englisch B2']. Leeres Array, wenn keine genannt.",
    },
    berufserfahrungJahre: {
      type: "number",
      description: "Geforderte Mindest-Berufserfahrung in Jahren. 0, wenn keine genannt.",
    },
    unterlagen: {
      type: "array",
      items: { type: "string" },
      description:
        "Die einzureichenden Bewerbungsunterlagen, genau wie im Text genannt, z.B. ['Bewerbungsbogen', 'Lebenslauf', 'Fragebogen zur Verfassungstreueprüfung', 'Zeugniskopien', 'Kopie des Personalausweises']. Leeres Array, wenn der Text keine Unterlagen aufzählt.",
    },
    unterlagenHinweise: {
      type: "string",
      description:
        "Formale Auflagen zu den Unterlagen, z.B. 'fremdsprachige Nachweise mit beglaubigter deutscher Übersetzung' oder 'Bewerbung ausschließlich über das Karriereberatungsbüro'. Leer, wenn keine genannt.",
    },
    mindestalter: {
      type: "number",
      description:
        "Das REGULÄRE Mindestalter in Jahren. Bedingte Ausnahmen NICHT hier eintragen: bei 'Mindestalter 18 Jahre (17 Jahre mit Einverständnis der gesetzlichen Vertretung)' ist die Antwort 18, nicht 17 - sonst liest sich die Ausnahme wie die Regel. 0, wenn keines genannt ist.",
    },
    hoechstalter: {
      type: "number",
      description:
        "Höchstalter in Jahren, bis zu dem eingestellt wird ('darf das 34. Lebensjahr noch nicht vollendet haben' -> 34). 0, wenn keines genannt ist.",
    },
    verpflichtungsdauer: {
      type: "string",
      description:
        "Dauer der Verpflichtung, genau wie im Text genannt, z.B. '12 Jahre', 'mindestens 4 Jahre', 'zwischen 2 und 12 Jahre'. Kurz halten, nur die Dauer selbst. Leer, wenn keine genannt ist.",
    },
    belegstelle: {
      type: "string",
      description:
        "Wörtliches Zitat (max. 200 Zeichen) aus dem Text, das die Dienstgrad- oder Abschlussangabe belegt. Leer, wenn nichts extrahiert wurde.",
    },
  },
  required: [
    "dienstgrad",
    "abschluss",
    "seiteneinstieg",
    "sicherheitsueberpruefung",
    "sprachen",
    "berufserfahrungJahre",
    "mindestalter",
    "hoechstalter",
    "verpflichtungsdauer",
    "unterlagen",
    "unterlagenHinweise",
    "belegstelle",
  ],
} as const;

const SEITENEINSTIEG_WERTE = ["ja", "nein", "unklar"] as const;

export interface JobAttributes {
  dienstgrad: string;
  /** Aus `dienstgrad` ueber die amtliche Tabelle abgeleitet, nicht vom Modell. */
  besoldung: { label: string; von: number; bis: number } | null;
  laufbahngruppen: Laufbahngruppe[];
  abschluss: string;
  seiteneinstieg: (typeof SEITENEINSTIEG_WERTE)[number];
  sicherheitsueberpruefung: string;
  sprachen: string[];
  berufserfahrungJahre: number;
  /** 0 = nicht genannt. Haeufigstes K.-o.-Kriterium militaerischer Laufbahnen. */
  mindestalter: number;
  hoechstalter: number;
  /** Woertlich aus dem Text, z.B. "12 Jahre" - die Formen sind zu uneinheitlich fuer eine Zahl. */
  verpflichtungsdauer: string;
  /**
   * Geforderte Unterlagen, wie im Ausschreibungstext aufgezaehlt. Steht nur
   * dort - es gibt kein strukturiertes Feld dafuer. Ohne diese Extraktion muss
   * jede Beratungssitzung die Liste neu aus dem Fliesstext herleiten.
   */
  unterlagen: string[];
  /** Formale Auflagen dazu (beglaubigte Uebersetzung, Weg ueber Karriereberatung, ...). */
  unterlagenHinweise: string;
  belegstelle: string;
  schemaVersion: string;
}

interface RawAttributes {
  dienstgrad?: unknown;
  abschluss?: unknown;
  seiteneinstieg?: unknown;
  sicherheitsueberpruefung?: unknown;
  sprachen?: unknown;
  berufserfahrungJahre?: unknown;
  mindestalter?: unknown;
  hoechstalter?: unknown;
  verpflichtungsdauer?: unknown;
  unterlagen?: unknown;
  unterlagenHinweise?: unknown;
  belegstelle?: unknown;
}

/**
 * Verzeiht die ueblichen Abweichungen echter Modellantworten: Markdown-Zaeune
 * um das JSON und Begleittext davor/danach. Beides kommt trotz
 * `responseMimeType: "application/json"` gelegentlich vor, und dann ist die
 * Extraktion sonst grundlos verloren.
 * Gibt `null` zurueck, wenn wirklich kein Objekt zu finden ist.
 */
export function parseJsonLenient(text: string): RawAttributes | null {
  const kandidaten = [text.trim(), text.replace(/^[^{]*/, "").replace(/[^}]*$/, "")];
  for (const kandidat of kandidaten) {
    const ohneZaun = kandidat.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    if (!ohneZaun.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(ohneZaun) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as RawAttributes;
    } catch {
      // naechsten Kandidaten probieren
    }
  }
  return null;
}

/** Gemeinsame Bereinigung fuer String-Listen aus der Modellantwort. */
function asStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, maxLength))
    .filter((entry) => entry !== "")
    .slice(0, maxItems);
}

function asString(value: unknown, maxLength = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * Verwirft alles, was das Modell frei erfunden haben koennte. Insbesondere:
 * ein Dienstgrad wird nur uebernommen, wenn ihn die amtliche Tabelle kennt -
 * damit ist ausgeschlossen, dass eine Fantasie-Besoldung entsteht.
 */
export function sanitizeAttributes(raw: RawAttributes): JobAttributes {
  const dienstgradRoh = asString(raw.dienstgrad, 60);
  const ableitung = dienstgradRoh ? deriveBesoldung(dienstgradRoh) : null;

  const seiteneinstiegRoh = asString(raw.seiteneinstieg, 10).toLowerCase();
  const seiteneinstieg = (SEITENEINSTIEG_WERTE as readonly string[]).includes(seiteneinstiegRoh)
    ? (seiteneinstiegRoh as JobAttributes["seiteneinstieg"])
    : "unklar";

  const jahreRoh = typeof raw.berufserfahrungJahre === "number" ? raw.berufserfahrungJahre : 0;
  const berufserfahrungJahre = Number.isFinite(jahreRoh) && jahreRoh > 0 ? Math.min(Math.round(jahreRoh), 40) : 0;

  // Plausibilitaetsgrenzen: alles ausserhalb ist eher Halluzination oder eine
  // falsch gelesene Jahreszahl als eine echte Altersgrenze.
  const alter = (value: unknown): number => {
    const zahl = typeof value === "number" ? value : 0;
    return Number.isFinite(zahl) && zahl >= 15 && zahl <= 70 ? Math.round(zahl) : 0;
  };
  const mindestalter = alter(raw.mindestalter);
  const hoechstalter = alter(raw.hoechstalter);

  return {
    // Kanonische Schreibweise aus der Tabelle statt der Modell-Formulierung.
    dienstgrad: ableitung?.dienstgrade.join(", ") ?? "",
    besoldung: ableitung ? { label: ableitung.label, von: ableitung.von, bis: ableitung.bis } : null,
    laufbahngruppen: ableitung?.laufbahngruppen ?? [],
    abschluss: asString(raw.abschluss, 120),
    seiteneinstieg,
    sicherheitsueberpruefung: asString(raw.sicherheitsueberpruefung, 40),
    sprachen: asStringList(raw.sprachen, 8, 40),
    berufserfahrungJahre,
    mindestalter,
    // Ein Hoechstalter unter dem Mindestalter ist in sich widerspruechlich -
    // dann lieber beides verwerfen als eine unmoegliche Spanne ausliefern.
    hoechstalter: hoechstalter > 0 && hoechstalter < mindestalter ? 0 : hoechstalter,
    verpflichtungsdauer: asString(raw.verpflichtungsdauer, 120),
    unterlagen: normalisiereUnterlagen(asStringList(raw.unterlagen, 15, 120)),
    unterlagenHinweise: asString(raw.unterlagenHinweise, 300),
    belegstelle: asString(raw.belegstelle, 200),
    schemaVersion: SCHEMA_VERSION,
  };
}

function buildPrompt(content: z.infer<typeof jobAttributesAiSchema>): string {
  return [
    "Du liest eine Stellenausschreibung der Bundeswehr und extrahierst die formalen Anforderungen.",
    "Antworte ausschließlich mit den tatsächlich im Text genannten Angaben - erfinde nichts.",
    "",
    "WICHTIG zum Feld `dienstgrad`: Gemeint ist ausschließlich der Dienstgrad, mit dem",
    "eingestellt wird oder der für die Stelle gefordert ist. Dienstgrade von",
    "Ansprechpartnern, Vorgesetzten oder Beispielpersonen gehören NICHT dazu -",
    "in dem Fall bleibt das Feld leer.",
    "",
    "WICHTIG zum Feld `unterlagen`: Nur Unterlagen aufnehmen, die der Text tatsächlich",
    "als einzureichend nennt. Nicht ergänzen, was üblicherweise dazugehört.",
    "",
    "=== Tätigkeit ===",
    content.jobDesc.slice(0, MAX_FIELD_CHARS),
    "",
    "=== Anforderungen ===",
    content.requireDesc.slice(0, MAX_FIELD_CHARS),
    "",
    "=== Bemerkungen ===",
    content.remarcDesc.slice(0, MAX_FIELD_CHARS),
  ].join("\n");
}

/**
 * Ein Extraktionslauf fuer eine Ausschreibung. Wirft bei Netz-/Quota-Fehlern,
 * damit der Aufrufer entscheiden kann (ueberspringen statt Sync abbrechen).
 */
export async function extractJobAttributes(
  content: JobContentRecord,
  apiKey: string,
): Promise<JobAttributes> {
  const filtered = jobAttributesAiSchema.parse({
    jobDesc: content.jobDesc ?? "",
    requireDesc: content.requireDesc ?? "",
    remarcDesc: content.remarcDesc ?? "",
  });

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: AI_MODEL,
    contents: buildPrompt(filtered),
    config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini lieferte keine auswertbare Antwort");

  const parsed = parseJsonLenient(text);
  if (!parsed) {
    // Prefix mitloggen, damit ein kuenftiger Fehlschlag diagnostizierbar ist -
    // ohne den Text sieht man nur "war kein JSON" und raet.
    throw new Error(`Gemini-Antwort war kein gültiges JSON (Anfang: ${text.slice(0, 120)})`);
  }

  const attributes = sanitizeAttributes(parsed);
  logger.info("extractJobAttributes: extrahiert", {
    schemaVersion: SCHEMA_VERSION,
    hatDienstgrad: attributes.dienstgrad !== "",
    hatAbschluss: attributes.abschluss !== "",
    seiteneinstieg: attributes.seiteneinstieg,
  });
  return attributes;
}
