/**
 * Register: wie Menschen einen Beruf nennen -> wie man ihn hier findet.
 *
 * WOZU: `suchbegriff` trifft nur den Stellentitel. Ein Bewerber sagt aber
 * "Panzerkommandant", und so heisst keine Ausschreibung - die Suche kommt leer
 * zurueck und eine schwaechere KI antwortet "gibt es nicht", obwohl
 * Panzer-Stellen offen sind. Genau diese Schicht haben ESCO (`altLabels`),
 * O*NET (*alternate titles*) und die Klassifikation der Berufe der
 * Bundesagentur (Suchwortverzeichnis) auch.
 *
 * WAS HIER NICHT REINGEHOERT: Aussagen darueber, wie eine Laufbahn verlaeuft
 * oder wie man zu einem Dienstposten aufsteigt. Das Register sagt, **wie man
 * sucht**, nicht **wie man Soldat wird** - alles andere waere aus dem
 * Trainingswissen erfunden und genau das, was dieser Server verhindern soll.
 *
 * PFLEGE: handgepflegt und klein. Jeder Eintrag muss gegen den echten Bestand
 * geprueft sein - ein Vorschlag, der wieder ins Leere fuehrt, ist schlimmer als
 * gar keiner.
 *
 * Nicht von Hand nachzaehlen, sondern `npm run wuensche:check` (mit `--alias`
 * fuer die Schreibvarianten). Das prueft jeden Eintrag gegen den deployten
 * Server und meldet, welcher Vorschlag ins Leere zeigt oder weniger findet als
 * die direkte Suche nach dem Wunschwort.
 */

import { geteilterHinweis, type GeteilterHinweis } from "../lib/geteilterHinweis";

export interface Berufswunsch {
  /** Das Wort, das ein Bewerber benutzt. */
  wunsch: string;
  /** Weitere Schreibweisen und Synonyme desselben Wunsches. */
  auch?: string[];
  /**
   * Was in den Ausschreibungen tatsaechlich steht - beschreibend, ohne Deutung
   * der Laufbahn. Wird der anfragenden KI woertlich vorgelegt.
   */
  wasEsGibt: string;
  /** Direkt als `list_jobs`-Argumente verwendbar. Leer, wenn es nichts gibt. */
  suche: {
    suchbegriff?: string;
    organisationsbereich?: string[];
  };
}

export const BERUFSWUENSCHE: Berufswunsch[] = [
  {
    wunsch: "Panzerkommandant",
    auch: ["Panzerfahrer", "Panzersoldat", "Panzerbesatzung", "Kampfpanzer"],
    wasEsGibt:
      "Ausgeschrieben sind Stellen rund um den Panzer: Kraftfahrer und Bediener in der Besatzung sowie Panzertechnik, alle im Heer.",
    suche: { suchbegriff: "Panzer", organisationsbereich: ["Heer"] },
  },
  {
    wunsch: "Sanitäter",
    auch: ["Rettungssanitäter", "Notfallsanitäter", "Sanitätssoldat", "Militärarzt"],
    // Nicht `suchbegriff: "Sanitäts"`: das trifft fast nur Offizierstellen mit
    // Abiturvoraussetzung. Wer "Sanitaeter" sagt, meint meist nicht das. Der
    // Organisationsbereich deckt alle Laufbahnen ab.
    wasEsGibt:
      "Der Sanitaetsdienst ist ein eigener Organisationsbereich - von Mannschaften bis Offizieren, militaerisch und zivil. Die Titel nennen die Fachrichtung (z.B. Sanitätsoffizier), selten das Wort selbst.",
    suche: { organisationsbereich: ["Zentraler Sanitätsdienst der Bundeswehr"] },
  },
  {
    wunsch: "Militärpolizist",
    auch: ["Militärpolizei", "Polizist", "Polizei"],
    wasEsGibt: "Die Militaerpolizei der Bundeswehr heisst Feldjaegertruppe; danach sind die Stellen benannt.",
    suche: { suchbegriff: "Feldjäger" },
  },
  {
    wunsch: "Matrose",
    auch: ["Seemann", "Schiffsbesatzung", "Seefahrer", "zur See fahren"],
    wasEsGibt: "Stellen an Bord tragen den Schiffsbezug selten im Titel; verlaesslich ist der Organisationsbereich.",
    suche: { organisationsbereich: ["Marine"] },
  },
  {
    wunsch: "Hacker",
    auch: ["Cybersecurity", "IT-Sicherheit", "Cyberabwehr"],
    wasEsGibt: "Die Stellen laufen unter \"Cyber\" im Titel, oft zusammen mit IT.",
    suche: { suchbegriff: "Cyber" },
  },
  {
    wunsch: "Krankenschwester",
    auch: ["Pfleger", "Krankenpflege", "Pflegekraft"],
    // Der Wortstamm "Pflege" statt "Krankenpfleger": die Titelsuche setzt am
    // Wortanfang an, der Stamm trifft deshalb weit mehr Stellen.
    wasEsGibt:
      "Ausgeschrieben wird unter Titeln rund um die Pflege - zivil im mittleren Dienst, militaerisch bis zum Feldwebel, dazu Ausbildungsplaetze.",
    suche: { suchbegriff: "Pflege" },
  },
  {
    wunsch: "Kampfpilot",
    auch: ["Jetpilot", "Kampfjetpilot", "Flugzeugführer", "Fliegen"],
    wasEsGibt: "Fliegende Verwendungen stehen im Titel als \"Pilot\".",
    suche: { suchbegriff: "Pilot" },
  },
  {
    wunsch: "Scharfschütze",
    auch: ["Sniper"],
    wasEsGibt:
      "Es gibt auch keinen anderen Titel, unter dem so eine Stelle liefe. Sinnvoll ist ein Ueberblick ueber das Heer, statt weitere Woerter zu raten.",
    suche: {},
  },
];

/** Weibliche Form auf die Registerform zurueckfuehren: "Sanitäterin" -> "sanitäter". */
function normalisiere(wort: string): string {
  const klein = wort.trim().toLowerCase();
  return klein.endsWith("in") ? klein.slice(0, -2) : klein;
}

/**
 * Der Hinweis, der in einer LEEREN Trefferliste steht.
 *
 * Er ist der eigentliche Zweck des Registers: Die Anweisung "bei leerem
 * Ergebnis zuerst zaehle_treffer" steht in der Tool-Beschreibung und
 * wird trotzdem oft uebergangen, weil sie gelesen wird, bevor der Fall eintritt. Im
 * Rueckgabewert kommt sie genau dann an, wenn sie gebraucht wird.
 *
 * `weitereFilter` verhindert eine falsche Diagnose: Steht neben dem Suchbegriff
 * noch ein Ort oder ein Bereich, kann genauso gut der Filter schuld sein - dann
 * darf hier nicht behauptet werden, das Wort komme in keinem Titel vor.
 */
/**
 * KEINE Bewerberhaelfte, in keinem der Zweige - und das ist Absicht: eine leere
 * Trefferliste heisst nicht, dass es nichts gibt, sondern dass falsch gesucht
 * wurde. Ein zitierfaehiger Satz waere hier zwangslaeufig "dazu gibt es nichts",
 * also genau die Antwort, die dieser Hinweis verhindern soll. Erst weiter
 * suchen, dann antworten.
 */
export function hinweisFuerLeereSuche(
  suchbegriff: string | undefined,
  weitereFilter: boolean,
): GeteilterHinweis {
  const wunsch = suchbegriff?.trim();
  if (!wunsch) {
    return geteilterHinweis(
      "Keine Treffer. Ohne Suchbegriff liegt es an der Filterkombination - haeufigste Ursache ist ein Ort " +
      "zusammen mit weiteren Filtern. Naechster Schritt: zaehle_treffer ohne den engsten Filter aufrufen, um zu " +
      "sehen, wo es ueberhaupt Stellen gibt.",
    );
  }

  const treffer = findeBerufswunsch(wunsch);
  if (treffer) {
    const argumente = [
      treffer.suche.suchbegriff ? `suchbegriff: "${treffer.suche.suchbegriff}"` : null,
      treffer.suche.organisationsbereich?.length
        ? `organisationsbereich: ${JSON.stringify(treffer.suche.organisationsbereich)}`
        : null,
    ].filter((teil): teil is string => teil !== null);

    const naechster = argumente.length
      ? `Naechster Schritt: list_jobs erneut aufrufen mit ${argumente.join(", ")}.`
      : "Naechster Schritt: mit zaehle_treffer einen Ueberblick holen, statt weitere Woerter zu raten.";

    // Kein Meta-Satz an die KI ("dem Nutzer nicht sagen, dass..."): ein
    // Modell, das Ergebnisse teilweise durchreicht, zeigt dem Bewerber sonst
    // einen Satz, der in dritter Person ueber ihn spricht.
    return geteilterHinweis(
      `Keine Treffer fuer "${wunsch}" - so heisst keine Ausschreibung. ${treffer.wasEsGibt} ${naechster}`,
    );
  }

  if (weitereFilter) {
    return geteilterHinweis(
      `Keine Treffer fuer "${wunsch}" mit den gesetzten Filtern. Ursache kann beides sein: der Suchbegriff ` +
      "trifft nur den Stellentitel, oder die Filterkombination ist zu eng. Naechster Schritt: zaehle_treffer " +
      "ohne den engsten Filter aufrufen, statt dem Nutzer zu sagen, es gebe nichts.",
    );
  }

  return geteilterHinweis(
    `Keine Treffer fuer "${wunsch}". Der Suchbegriff durchsucht nur den Stellentitel, nicht den Ausschreibungstext ` +
    "- zusammengesetzte Berufswuensche stehen dort selten so, wie ein Bewerber sie nennt. Naechster Schritt: " +
    "zaehle_treffer mit einem einzelnen Wortbestandteil aufrufen (beim Wortende anfangen: \"Panzerkommandant\" -> " +
    "\"Panzer\") und danach filtern, statt dem Nutzer zu sagen, es gebe nichts.",
  );
}

export function findeBerufswunsch(wort: string): Berufswunsch | null {
  const gesucht = wort.trim().toLowerCase();
  if (!gesucht) return null;
  const ohneEndung = normalisiere(wort);

  return (
    BERUFSWUENSCHE.find((eintrag) =>
      [eintrag.wunsch, ...(eintrag.auch ?? [])].some((wert) => {
        const kandidat = wert.toLowerCase();
        return kandidat === gesucht || kandidat === ohneEndung;
      }),
    ) ?? null
  );
}
