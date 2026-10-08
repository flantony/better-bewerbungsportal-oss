// zod/v3 (nicht "zod") - s. Kommentar in listJobs.ts.
import { z } from "zod/v3";
import { aehnlicheBegriffe, findeBegriff, ladeGlossar } from "../knowledge/glossar";
import { findeBerufswunsch, type Berufswunsch } from "../knowledge/berufswuensche";
import { deriveBesoldung } from "../../lib/besoldung";
import { laufbahngruppeBedeutung } from "../lib/filterOptions";
import { geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";

export const erklaereBegriffInputSchema = {
  begriff: z
    .string()
    .min(1)
    .describe(
      "The word to explain, exactly as it appears in the posting — e.g. 'Portepee', 'SaZ', 'Verwendungsreihe', or a rank like 'Kapitänleutnant'. Abbreviations and alternative spellings are matched too. One term per call.",
    ),
};

const erklaereBegriffInput = z.object(erklaereBegriffInputSchema);
export type ErklaereBegriffInput = z.infer<typeof erklaereBegriffInput>;

/** Besoldungseinordnung, wenn der Begriff ein Dienstgrad ist. */
export interface DienstgradAuskunft {
  /** Kanonische Schreibweise(n) laut Anlage I BBesG. */
  erkannt: string[];
  /** Anzeigeform der Besoldungsgruppe, z.B. "A11-A12". */
  besoldung: string;
  /** Laufbahngruppe(n) mit Klartext. */
  laufbahngruppen: { wert: string; bedeutung: string }[];
  hinweis: string;
}

export interface ErklaereBegriffResult {
  gefunden: boolean;
  begriff: string;
  erklaerung: string;
  /** Andere Schreibweisen, unter denen derselbe Begriff auftaucht. */
  auchGeschriebenAls: string[];
  /**
   * Gesetzt, wenn der Begriff ein Dienstgrad ist. Steht HIER und nicht nur in
   * der Resource `bw://wissen/besoldung`: Clients lesen Resources kaum,
   * Werkzeuge rufen sie auf. Ein Bewerber,
   * der nach "Einstellung als Kapitaenleutnant" fragt, bekommt die Einordnung
   * damit ohne Umweg.
   */
  dienstgrad?: DienstgradAuskunft;
  /** Nur wenn nichts gefunden wurde: was es sonst noch geben koennte. */
  vorschlaege?: string[];
  /**
   * Gesetzt, wenn das Wort kein Fachbegriff ist, sondern ein Berufswunsch, den
   * die Bundeswehr anders benennt. Traegt den Suchvorschlag, keine Definition.
   */
  suchhilfe?: Berufswunsch;
  /**
   * Zweigeteilt (s. geteilterHinweis.ts): der Referenzfall dieses Servers fuer
   * Steuerung im Rueckgabewert - "erfinde keine Definition" gilt fuer die KI,
   * "dafuer liegt hier keine Definition vor" ist das, was der Bewerber hoeren
   * muss. `dienstgrad.hinweis` bleibt dagegen ein einfacher Satz: er ist eine
   * Einordnung der Zahl, keine Anweisung, und ohnehin zitierfaehig.
   */
  hinweis?: GeteilterHinweis;
}

/**
 * Die Spanne ist keine Ungenauigkeit unserer Ableitung, sondern steht so im
 * Gesetz - "Hauptmann" ist dort A 11 UND A 12. Das gehoert dazugesagt, sonst
 * liest ein Client die Spanne als Schaetzung.
 */
const DIENSTGRAD_HINWEIS =
  "Zuordnung nach Anlage I Bundesbesoldungsgesetz (Besoldungsordnung A). Eine Spanne bedeutet, " +
  "dass das Gesetz den Dienstgrad in mehreren Besoldungsgruppen fuehrt - welche gilt, haengt am " +
  "konkreten Dienstposten und steht nicht in der Ausschreibung. Die Besoldungsgruppe ist nicht das " +
  "Gehalt: innerhalb der Gruppe steigt es mit der Erfahrungsstufe, dazu kommen Zulagen.";

function dienstgradAuskunft(begriff: string): DienstgradAuskunft | null {
  const ableitung = deriveBesoldung(begriff);
  if (!ableitung) return null;
  return {
    erkannt: ableitung.dienstgrade,
    besoldung: ableitung.label,
    laufbahngruppen: ableitung.laufbahngruppen.map((wert) => ({
      wert,
      bedeutung: laufbahngruppeBedeutung(wert),
    })),
    hinweis: DIENSTGRAD_HINWEIS,
  };
}

export async function erklaereBegriff(input: ErklaereBegriffInput): Promise<ErklaereBegriffResult> {
  // Dienstgrad zuerst pruefen: das ist eine amtliche Tabelle, das Glossar eine
  // erzeugte Lesehilfe. Beides kann zutreffen - dann wird beides geliefert.
  const dienstgrad = dienstgradAuskunft(input.begriff);

  const begriffe = await ladeGlossar();
  const treffer = findeBegriff(begriffe, input.begriff);

  if (!treffer && !dienstgrad) {
    // Kein Fachwort, aber vielleicht ein Berufswunsch: "Panzerkommandant" ist
    // keine Vokabel zum Erklaeren, sondern ein Suchproblem. Die Definition wird
    // trotzdem NICHT erfunden - `gefunden` bleibt false und `erklaerung` leer.
    const berufswunsch = findeBerufswunsch(input.begriff);
    if (berufswunsch) {
      return {
        gefunden: false,
        begriff: input.begriff,
        erklaerung: "",
        auchGeschriebenAls: [],
        suchhilfe: berufswunsch,
        hinweis: geteilterHinweis(
          "Zu diesem Wort gibt es keine hinterlegte Definition - es ist ein Berufswunsch, kein Fachbegriff aus den " +
            "Ausschreibungen. `suchhilfe` sagt, welche Stellen es dazu gibt, und ist ausdruecklich **keine Beschreibung " +
            "des Berufs** - nicht als Erklaerung wiedergeben, sonst entsteht die erfundene Auskunft, die hier vermieden " +
            `werden soll. Richtig ist: mit \`suchhilfe.suche\` list_jobs aufrufen und dem Bewerber sagen, unter welchem ` +
            "Namen die Bundeswehr ausschreibt.",
          `„${input.begriff}" ist ein gängiger Berufsname. Die Bundeswehr schreibt solche Tätigkeiten unter anderen ` +
            "Titeln aus, und eine Definition dazu liegt hier nicht vor.",
        ),
      };
    }

    const vorschlaege = aehnlicheBegriffe(begriffe, input.begriff);
    return {
      gefunden: false,
      begriff: input.begriff,
      erklaerung: "",
      auchGeschriebenAls: [],
      ...(vorschlaege.length > 0 ? { vorschlaege } : {}),
      hinweis: geteilterHinweis(
        vorschlaege.length > 0
          ? "Dieser Begriff steht nicht im Glossar und ist kein Dienstgrad. Die Vorschlaege sind Eintraege mit aehnlichem Wortanfang - passt keiner, bitte den Begriff aus dem Volltext der Ausschreibung erklaeren und dabei sagen, dass es keine hinterlegte Definition gibt."
          : "Dieser Begriff steht nicht im Glossar und ist kein Dienstgrad. Bitte ihn aus dem Volltext der Ausschreibung erklaeren und dabei sagen, dass es keine hinterlegte Definition gibt - nicht raten.",
        `Für „${input.begriff}" liegt hier keine hinterlegte Erklärung vor.`,
      ),
    };
  }

  return {
    gefunden: true,
    begriff: treffer?.term ?? dienstgrad?.erkannt[0] ?? input.begriff,
    erklaerung: treffer?.definition ?? "",
    auchGeschriebenAls: treffer?.aliases ?? [],
    ...(dienstgrad ? { dienstgrad } : {}),
    ...(treffer
      ? {}
      : {
          // Ohne Bewerberhaelfte: was fehlt, ist eine Lesehilfe zum Wort - die
          // eigentliche Auskunft (die amtliche Einordnung) liegt bei.
          hinweis: geteilterHinweis(
            "Zu diesem Dienstgrad gibt es keinen Glossareintrag, wohl aber die amtliche Besoldungseinordnung unter `dienstgrad`.",
          ),
        }),
  };
}
