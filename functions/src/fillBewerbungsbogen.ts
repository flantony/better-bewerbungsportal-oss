// ============================================================
// Bewerbungsbogen-Ausfüllen
// ============================================================
// WICHTIG: pdf-lib kann die echten Bundeswehr-Bewerbungsbogen-PDFs NICHT
// parsen (nicht-standardkonforme xref/Object-Stream-Struktur) - `pdfjs-dist`
// dagegen liest sie problemlos. Ausfüllen läuft deshalb über `pdfjs-dist`s
// `annotationStorage` + `PDFDocumentProxy.saveDocument()` (inkrementelles
// Speichern), NICHT über pdf-lib. pdf-lib wird an anderer Stelle (Anschreiben-
// Rendering, Lebenslauf-Generierung) genutzt - dort wird ein NEUES
// PDF erzeugt, kein bestehendes eingelesen, das ist ein anderer Codepfad
// ohne die Parse-Inkompatibilität.
//
// MEHRERE VORLAGEN-VARIANTEN: die Bundeswehr verwendet mindestens drei
// strukturell komplett unterschiedliche Bewerbungsbogen/Karrierebogen-PDFs mit
// jeweils eigenen internen AcroForm-Feldnamen ("Bewerbungsbogen Seiteneinstieg
// und ROB", "Bewerbungsbogen_Militärisch", "Karrierebogen ... Mannschaften") -
// ein einziges, festes Feld-Mapping für "den" Bewerbungsbogen ließe für zwei
// der drei Varianten fast alle Felder (Telefon/E-Mail/Adresse/
// Geburtsdatum/Staatsangehörigkeit) still leer, während ein Erfolgs-Check
// (Nachname/Vorname vorhanden + mind. 1 Feld gefüllt) trotzdem grün wäre,
// weil diese zwei Feldnamen zufällig in allen Varianten gleich heißen.
// Deshalb: Variante anhand des Anhang-Klartextnamens (`attHeader`)
// erkennen, EIGENES Feld-Mapping pro Variante, laut fehlschlagen bei
// unbekannter Variante statt eine augenscheinlich erfolgreiche, tatsächlich
// leere Vorlage auszuliefern.
// ============================================================

// pdfjs-dist hat keine offiziellen Typdefinitionen für die Node-"legacy"-
// Variante in der hier genutzten Form (getFieldObjects/annotationStorage/
// saveDocument sind alle vorhanden, aber nicht vollständig typisiert) -
// require statt ESM-Import, da pdfjs-dist als ESM-only-Paket sonst mit
// diesem Projekt-tsconfig (CommonJS-Output) nicht sauber importierbar ist.
import { HinweisFehler } from "./lib/hinweisFehler";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs") as {
  getDocument: (params: { data: Uint8Array; isEvalSupported: boolean }) => { promise: Promise<PdfjsDocument> };
};

interface PdfjsDocument {
  getFieldObjects(): Promise<Record<string, Array<{ id: string }>> | null>;
  annotationStorage: { setValue: (id: string, value: { value: string | boolean }) => void };
  saveDocument(): Promise<Uint8Array>;
}

// Nur diese drei nutzt JEDE bekannte Variante - alles andere haengt an der
// Vorlage (der Karrierebogen hat z.B. gar kein Telefon-/Adressfeld). Deshalb
// sind die uebrigen Angaben optional: welche eine konkrete Vorlage wirklich
// braucht, sagt `angabenFuerVariante` und damit `get_document_requirements`.
// Waeren sie verpflichtend, muesste der Bewerber Daten heraussuchen, die in
// keinem Feld landen.
export interface BewerbungsbogenFillValues {
  nachname: string;
  vorname: string;
  geburtsdatumLabel: string; // bereits formatiert, z.B. "12.03.1998"
  telefon?: string;
  email?: string;
  geburtsort?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  // Art.-9-nahe Angabe und trotzdem eine normale: der Vordruck hat ein Feld
  // dafuer. Nie gespeichert.
  staatsangehoerigkeit?: string;
  // Hat nicht jeder - erfragt wird nur, was die Vorlage einsetzt.
  studienabschluss?: string;
  fuehrerschein?: string;
  ausschreibungId: string; // job.refCode
  ausschreibungTitel: string; // job.title
}

export type BewerbungsbogenVariant = "seiteneinstieg-rob" | "militaerisch" | "karrierebogen-mannschaften";

/**
 * Erkennt anhand des Anhang-Klartextnamens (`attHeader`), welche der bekannten Vorlagen-Varianten
 * vorliegt. Gibt `null` zurück, wenn keine bekannte Variante erkannt wird -
 * der Aufrufer MUSS das als "nicht unterstützt" behandeln (laut
 * fehlschlagen), nicht raten (s. Datei-Kopfkommentar).
 */
export function detectBewerbungsbogenVariant(attHeader: string): BewerbungsbogenVariant | null {
  const normalized = attHeader.toLowerCase();
  if (normalized.includes("karrierebogen") && normalized.includes("mannschaften")) {
    return "karrierebogen-mannschaften";
  }
  if (normalized.includes("militärisch")) {
    return "militaerisch";
  }
  if (normalized.includes("seiteneinstieg")) {
    return "seiteneinstieg-rob";
  }
  return null;
}

/**
 * "Bewerbungsbogen Seiteneinstieg und ROB". Nur Felder mit eindeutig identifizierbarer Bedeutung
 * (Name/Kontakt/Ausschreibungsreferenz) - bei mehrdeutigen Feldern (z.B.
 * "Staat Geb" taucht mehrfach auf) wird bewusst NICHT geraten.
 */
function buildFieldMapSeiteneinstiegRob(values: BewerbungsbogenFillValues): Record<string, string> {
  const map: Record<string, string> = {
    Nachname: values.nachname,
    Vorname: values.vorname,
    "Geb-Datum": values.geburtsdatumLabel,
    "ID 1": values.ausschreibungId,
    "Titel/Überschrift": values.ausschreibungTitel,
  };
  // Fehlende Teile bleiben weg statt als ", " im amtlichen Formular zu stehen.
  const wohnsitz = [values.strasse, [values.plz, values.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (values.telefon) map.Handy = values.telefon;
  if (values.email) map.Mail = values.email;
  if (wohnsitz) map.Hauptwohnsitz = wohnsitz;
  if (values.plz) map.Plz = values.plz;
  if (values.staatsangehoerigkeit) {
    map.Staatsa = values.staatsangehoerigkeit;
  }
  return map;
}

/**
 * "Bewerbungsbogen_Militärisch" (Bw-2053_BewerbungsbogenMil), 2-seitige
 * Vorlage. Kein Feld für eine Ausschreibungs-
 * Referenz vorhanden (diese Variante ist nicht an eine einzelne Ausschreibung
 * gebunden). Nur die unnummerierten Basis-Feldnamen für Nachname/Vorname -
 * die nummerierten Varianten (`Nachname_4`/`_5`, `Vorname_3`/`_4`) gehören zu
 * den Unterschriftsblöcken in Teil B/C bzw. zum "Bei Minderjährigen
 * zusätzlich"-Block für die/den Erziehungsberechtigte(n) auf Seite 2; ohne
 * Positionsprüfung der einzelnen Annotationen nicht sicher unterscheidbar,
 * welcher Block wessen Namen erwartet - ein versehentlich in ein
 * Erziehungsberechtigten-Feld eingetragener Bewerbername wäre eine echte
 * Falschangabe, kein kosmetischer Fehler, deshalb bewusst ausgelassen.
 * "Staatsangehörigkeit_2"/"_3" sind laut Vordruck für "frühere" (also
 * historische) Staatsangehörigkeiten - wir erfassen nur die aktuelle.
 */
function buildFieldMapMilitaerisch(values: BewerbungsbogenFillValues): Record<string, string> {
  const map: Record<string, string> = {
    Nachname: values.nachname,
    Vorname: values.vorname,
    Geburtsdatum: values.geburtsdatumLabel,
  };
  // "Telefon", nicht "Mobiltelefon": wir fragen nur nach EINER Rufnummer, und
  // die ist im allgemeinen Telefonfeld immer richtig - eine Festnetznummer im
  // Mobilfeld nicht. Beide Felder sind laut
  // Vordruck freiwillig.
  if (values.telefon) map.Telefon = values.telefon;
  if (values.email) map.EMail = values.email;
  if (values.geburtsort) map.Geburtsort = values.geburtsort;
  if (values.strasse) map.Straße_Hausnummer = values.strasse;
  if (values.plz) map.PLZ = values.plz;
  if (values.ort) map.Ort = values.ort;
  if (values.staatsangehoerigkeit) {
    map["Staatsangehörigkeit_1"] = values.staatsangehoerigkeit;
  }
  if (values.studienabschluss) {
    map["Akademischer Grad"] = values.studienabschluss;
  }
  if (values.fuehrerschein) {
    map["Führerschein Klassen zivil freiwillig"] = values.fuehrerschein;
  }
  return map;
}

/**
 * "Karrierebogen für die Laufbahnen der Feldwebel, Fachunteroffiziere,
 * Mannschaften und Freiwilligen Wehrdienst Leistender" -
 * 7 Seiten, überwiegend freiwillige Laufbahn-/Verwendungswünsche (Checkboxen,
 * die der Bewerber selbst bewusst treffen muss) sowie rechtlich bedeutsame
 * Selbstauskünfte (Vorstrafen, Wohnsitzhistorie für die Sicherheits-
 * überprüfung, wirtschaftliche Verhältnisse, Wehrdienst-Vorgeschichte) - bei
 * diesen wird NIE automatisch geraten oder ein Default (z.B. "Nein")
 * eingetragen, das wäre eine echte Falschangabe, keine bloße Auslassung.
 * Gefüllt wird nur die auf jeder Seite wiederkehrende Kopfzeile.
 * "Personenkennziffer" dient laut Vordruck selbst explizit als Fallback-Feld
 * für das Geburtsdatum ("Personenkennziffer (sofern bekannt/vorhanden)
 * (sonst) Geburtsdatum") - ein Neu-/Wiederbewerber hat noch keine
 * Personenkennziffer, der Vordruck sieht das Geburtsdatum für genau diesen
 * Fall ausdrücklich als Ersatzangabe vor. `Nachname_6`/`_7`/`Vorname_2`
 * bleiben aus demselben Grund wie bei der militärischen Variante aus (mutmaßlich
 * der "Bei Minderjährigen"-Erziehungsberechtigten-Block auf Seite 5).
 */
function buildFieldMapKarrierebogenMannschaften(values: BewerbungsbogenFillValues): Record<string, string> {
  const map: Record<string, string> = {
    Nachname: values.nachname,
    Vorname: values.vorname,
    Personenkennziffer: values.geburtsdatumLabel,
  };
  if (values.studienabschluss) {
    map["Akademischer Grad"] = values.studienabschluss;
  }
  return map;
}

/**
 * Welche der optionalen Zusatzangaben (canonicalApplicantFields-Schlüssel)
 * eine Variante tatsächlich in ein PDF-Feld einsetzt - der Aufrufer
 * braucht das, um genau diese Schlüssel aus der
 * separaten "Zusaetzliche_Angaben.txt"-Textbeilage auszuschließen, ohne für
 * Varianten, die einen Schlüssel NICHT unterstützen, dieselbe Angabe
 * versehentlich ganz verschwinden zu lassen.
 */
const OPTIONAL_EXTRA_KEYS_BY_VARIANT: Record<BewerbungsbogenVariant, readonly string[]> = {
  "seiteneinstieg-rob": [],
  militaerisch: ["studienabschluss", "fuehrerschein"],
  "karrierebogen-mannschaften": ["studienabschluss"],
};

/** Hinweistext für Varianten, bei denen ein erfolgreicher Fill BEWUSST nur ein Teil der Vorlage abdeckt. */
const PARTIAL_FILL_NOTES: Partial<Record<BewerbungsbogenVariant, string>> = {
  "karrierebogen-mannschaften":
    "Dieser Karrierebogen enthält neben deinen Kontaktdaten vor allem Laufbahn-/Verwendungswünsche " +
    "sowie rechtlich bedeutsame Selbstauskünfte (u.a. zu Vorstrafen, Wohnsitzhistorie und " +
    "wirtschaftlichen Verhältnissen). Wir haben nur Name, Vorname, Geburtsdatum und (falls angegeben) " +
    "deinen akademischen Grad vorausgefüllt. Die übrigen Seiten füllst du bitte vor dem Versand selbst aus.",
};

// ─── Was der Bewerber von Hand ergaenzen muss ───────────────────────────────

/** Die Laufbahn-Kaestchen oben auf dem militaerischen Bogen, so wie sie gedruckt sind. */
const LAUFBAHN_KAESTCHEN_MILITAERISCH = [
  "Freiwilliger Wehrdienst",
  "Soldat auf Zeit (Kurz)",
  "Mannschaften",
  "Unteroffiziere",
  "Feldwebel",
  "Offiziere",
];

/**
 * Felder, die unser Mapping BEWUSST nie fuellt - je Variante, in den Worten des
 * Vordrucks, gruppiert wie der Bewerber sie abarbeitet. Unterschriften fehlen
 * hier, die nennt der Merkzettel in einem eigenen Abschnitt.
 *
 * Grundlage sind die AcroForm-Felder und der gedruckte Text der Vorlagen;
 * die Zeilen des Karrierebogens fuer Mannschaften passen zu
 * `PARTIAL_FILL_NOTES`.
 *
 * WOZU: Ohne diese Liste ginge der militaerische Bogen mit leerer
 * Laufbahn-Auswahl, leerem Geschlecht, leerer Anrede und leeren Staat-Feldern
 * hinaus, und der Merkzettel sagte nur "unterschreiben".
 */
const NIE_GEFUELLT: Record<BewerbungsbogenVariant, readonly string[]> = {
  militaerisch: [
    "Geschlecht und Anrede auswählen, Titel falls vorhanden",
    // Den Ort kennen wir, den Staat nicht sicher - kein Raten, aber ein Beispiel.
    "Staat beim Hauptwohnsitz und beim Geburtsort (z. B. Deutschland)",
    "Weitere Wohnsitze, falls vorhanden",
    "Freiwillig, falls nicht schon eingetragen: Akademischer Grad, Führerschein Klassen zivil, weitere oder " +
      "frühere Staatsangehörigkeiten, Grad der Behinderung",
    "Teil B (Einwilligung zur Erreichbarkeit per Telefon und E-Mail): Nein oder Ja ankreuzen, Ort und Datum",
    "Teil C (Erklärung): Ort und Datum",
    "Bei Minderjährigen zusätzlich: Ort, Datum, Vorname und Nachname der Sorgeberechtigten",
  ],
  "seiteneinstieg-rob": [
    "Teil A: ankreuzen, ob als Offizierin / Offizier auf Zeit (SaZ) oder der Reserve; ob du dich auf weitere " +
      "Ausschreibungen bewirbst (Nein oder Ja, mit deren ID)",
    "Teil B: Anrede, Akademischer Grad, Personenkennziffer (falls vorhanden), weitere oder frühere Namen, " +
      "Ort / Staat beim Hauptwohnsitz, Geburtsort / Staat (z. B. Deutschland), weitere Wohnsitze, Grad der Behinderung (freiwillig), " +
      "Termine in den nächsten 2 Monaten, an denen du verhindert bist",
    "Teil C (Fragebogen zur Verfassungstreueprüfung; jedes Feld ausfüllen, sonst „keine“ eintragen): " +
      "Geschlechtereintrag, weitere oder frühere Staatsangehörigkeit, eigene Internetseiten, Mitgliedschaften " +
      "in sozialen Netzwerken",
    "Teil D: Fragen zu Kriegsdienstverweigerung, Offizierausbildung, Musterung, Assessmentverfahren und " +
      "früherem Dienstverhältnis beantworten",
    "Teil E: Einwilligung Ja oder Nein ankreuzen, Ort und Datum",
  ],
  "karrierebogen-mannschaften": [
    "Alle Selbstauskünfte auf den übrigen Seiten, u. a. zu Vorstrafen, Wohnsitzen, wirtschaftlichen " +
      "Verhältnissen und früherem Wehrdienst",
    "Bei Minderjährigen zusätzlich: die Angaben der Erziehungsberechtigten",
  ],
};

/** Feldname auf dem Vordruck je Angabe - wo eine Variante ihn anders druckt, steht er hier. */
const FELD_AUF_DEM_BOGEN: Record<AngabeSchluessel, string> = {
  nachname: "Nachname",
  vorname: "Vorname",
  geburtsdatumLabel: "Geburtsdatum",
  telefon: "Telefon",
  email: "E-Mail",
  geburtsort: "Geburtsort",
  strasse: "Straße/Hausnummer",
  plz: "PLZ",
  ort: "Ort",
  staatsangehoerigkeit: "Staatsangehörigkeit",
  studienabschluss: "Akademischer Grad",
  fuehrerschein: "Führerschein Klassen zivil",
};
type Feldnamen = Partial<Record<AngabeSchluessel, string>>;
const FELD_AUF_DEM_BOGEN_ABWEICHEND: Partial<Record<BewerbungsbogenVariant, Feldnamen>> = {
  "seiteneinstieg-rob": { telefon: "Mobiltelefon", plz: "Postleitzahl" },
  "karrierebogen-mannschaften": { geburtsdatumLabel: "Personenkennziffer (sonst Geburtsdatum)" },
};

function laufbahnZeile(kaestchen: readonly string[], laufbahngruppen: string[], text: string): string {
  const passend = laufbahngruppen.filter((gruppe) => kaestchen.includes(gruppe));
  return passend.length > 0 ? `${text}, laut Ausschreibung: ${passend.join(", ")}` : text;
}

/**
 * Was der Bewerber in DIESEM Vordruck nach unserem Ausfuellen noch selbst
 * eintragen muss: die Felder, die wir nie fuellen, plus die Angaben, die beim
 * Ausfuellen fehlten. Nur Feldnamen, nie Werte.
 *
 * `laufbahngruppen` (aus der Ausschreibung, z.B. ["Feldwebel"]) landet nur als
 * Hinweis an der Laufbahn-Zeile - ankreuzen muss der Bewerber selbst, denn die
 * Auswahl ist Mehrfachauswahl und gehoert zu seiner Bewerbung, nicht zu unserer
 * Lesart der Anzeige.
 */
export function vonHandZuErgaenzen(
  variant: BewerbungsbogenVariant,
  kontext: { fehlendeAngaben: readonly string[]; laufbahngruppen: readonly string[] },
): string[] {
  const zeilen: string[] = [];
  // Steht "deutsch" nur im Lebenslauf, bleibt das Pflichtfeld im Bogen leer,
  // und das faellt sonst nicht auf. Wir lesen die Angabe
  // NIE aus Bewerbertexten heraus (Art. 9) - die Zeile steht deshalb einzeln und
  // ganz oben statt in der Sammelzeile "Noch leer".
  const ohneStaatsangehoerigkeit = kontext.fehlendeAngaben.includes("staatsangehoerigkeit");
  if (ohneStaatsangehoerigkeit) zeilen.push("Staatsangehörigkeit eintragen (Pflichtangabe auf dem Bogen)");
  const gruppen = [...kontext.laufbahngruppen];
  if (variant === "militaerisch") {
    zeilen.push(
      laufbahnZeile(
        LAUFBAHN_KAESTCHEN_MILITAERISCH,
        gruppen,
        `Laufbahn ankreuzen (${LAUFBAHN_KAESTCHEN_MILITAERISCH.join(" / ")})`,
      ),
    );
  }
  if (variant === "karrierebogen-mannschaften") {
    zeilen.push(
      laufbahnZeile(
        ["Mannschaften", "Unteroffiziere", "Feldwebel"],
        gruppen,
        "Laufbahn- und Verwendungswünsche ankreuzen",
      ),
    );
  }
  zeilen.push(...NIE_GEFUELLT[variant]);

  const namen = { ...FELD_AUF_DEM_BOGEN, ...FELD_AUF_DEM_BOGEN_ABWEICHEND[variant] };
  const fehlend = kontext.fehlendeAngaben
    .filter((schluessel): schluessel is AngabeSchluessel => schluessel in namen)
    .filter((schluessel) => schluessel !== "staatsangehoerigkeit")
    .map((schluessel) => namen[schluessel]);
  if (fehlend.length > 0) zeilen.push(`Noch leer, weil die Angabe beim Ausfüllen fehlte: ${fehlend.join(", ")}`);
  return zeilen;
}

/** Exportiert für Tests - reine Funktion, kein PDF-/Firestore-Zugriff. */
export function buildFieldMapForVariant(
  variant: BewerbungsbogenVariant,
  values: BewerbungsbogenFillValues,
): Record<string, string> {
  switch (variant) {
    case "seiteneinstieg-rob":
      return buildFieldMapSeiteneinstiegRob(values);
    case "militaerisch":
      return buildFieldMapMilitaerisch(values);
    case "karrierebogen-mannschaften":
      return buildFieldMapKarrierebogenMannschaften(values);
  }
}

/**
 * Alle Angaben, die `fill_bewerbungsbogen` vom Bewerber annimmt (ohne
 * `pinstGuid`, das kommt aus der Suche, nicht vom Nutzer).
 */
export const ANGABEN_SCHLUESSEL = [
  "nachname",
  "vorname",
  "geburtsdatumLabel",
  "telefon",
  "email",
  "geburtsort",
  "strasse",
  "plz",
  "ort",
  "staatsangehoerigkeit",
  "studienabschluss",
  "fuehrerschein",
] as const;

export type AngabeSchluessel = (typeof ANGABEN_SCHLUESSEL)[number];

/**
 * Angaben, die nur einzusetzen sind, wenn der Nutzer sie von sich aus nennt -
 * nicht, weil sie heikel waeren, sondern weil sie nicht jeder hat: ein Formular
 * ohne akademischen Grad ist vollstaendig, eines ohne Namen nicht.
 *
 * `staatsangehoerigkeit` gehoert bewusst NICHT hierher, sondern gilt als
 * normale Angabe: der amtliche Bogen hat ein Feld dafuer, und ohne die Frage
 * danach ginge ein Formular mit leerem Pflichtfeld hinaus, ohne dass es
 * jemandem auffiele. Art.-9-Daten
 * bleiben es trotzdem - gespeichert wird nichts, geloggt wird nichts.
 */
const OPTIONALE_ZUSATZANGABEN: readonly AngabeSchluessel[] = ["studienabschluss", "fuehrerschein"];

export interface VorlagenAngaben {
  /** Angaben, die diese Vorlage tatsächlich in ein Feld einsetzt. */
  benoetigt: AngabeSchluessel[];
  /** Zusatzangaben, die diese Vorlage einsetzt, wenn sie vorliegen - nie zu erfragen. */
  optional: AngabeSchluessel[];
  /** Angaben, die diese Vorlage NICHT hat - danach zu fragen ist verlorene Mühe. */
  nichtVerwendet: AngabeSchluessel[];
}

/**
 * Welche Angaben eine Vorlage wirklich braucht - abgeleitet aus dem
 * Feld-Mapping selbst, nicht als zweite Liste daneben.
 *
 * WOZU: Der Karrierebogen hat kein Telefon-, E-Mail-, Adress- und
 * Geburtsort-Feld. Wer stur die zwölf Eingaben von `fill_bewerbungsbogen`
 * abfragt, laesst den Bewerber sechs Angaben heraussuchen, die anschliessend
 * nirgends landen - und erhebt Daten, fuer die es keinen Zweck gibt. Diese
 * Auskunft geht ueber `get_document_requirements` an den Client, BEVOR er fragt.
 *
 * Bewusst per Sonden-Werten aus `buildFieldMapForVariant` erschlossen: aendert
 * jemand ein Mapping, aendert sich diese Antwort mit. Eine handgepflegte Liste
 * waere schon beim ersten neuen Feld falsch, ohne dass es auffaellt.
 */
export function angabenFuerVariante(variant: BewerbungsbogenVariant): VorlagenAngaben {
  // Eine EINZIGE, immer gleiche Sonde, pro Angabe einmal durchgespielt: so kann
  // kein Schluessel im anderen stecken. Setzte man alle zwoelf gleichzeitig und
  // benannte die Sonden nach ihrem Schluessel, wuerde `ort` in `geburtsort`
  // gefunden - eine Vorlage mit Geburtsort-, aber ohne Ortsfeld meldete `ort`
  // dann als benoetigt, also das Gegenteil des Zwecks.
  const SONDE = "<<sonde>>";
  const leer: BewerbungsbogenFillValues = {
    nachname: "",
    vorname: "",
    geburtsdatumLabel: "",
    ausschreibungId: "",
    ausschreibungTitel: "",
  };
  const wirdEingesetzt = (key: AngabeSchluessel) =>
    Object.values(buildFieldMapForVariant(variant, { ...leer, [key]: SONDE })).some((wert) => wert.includes(SONDE));

  const angaben: VorlagenAngaben = { benoetigt: [], optional: [], nichtVerwendet: [] };
  for (const key of ANGABEN_SCHLUESSEL) {
    if (!wirdEingesetzt(key)) angaben.nichtVerwendet.push(key);
    else if (OPTIONALE_ZUSATZANGABEN.includes(key)) angaben.optional.push(key);
    else angaben.benoetigt.push(key);
  }
  return angaben;
}

export class BewerbungsbogenTemplateChangedError extends HinweisFehler {
  constructor(message = "Die Bewerbungsbogen-Vorlage scheint sich geändert zu haben - bitte manuell ausfüllen.") {
    super(message);
    this.name = "BewerbungsbogenTemplateChangedError";
  }
}

export interface BewerbungsbogenFillResult {
  bytes: Uint8Array;
  /**
   * Gesetzt, wenn die Vorlage laut Design nur TEILWEISE ausgefüllt wird
   * (s. `PARTIAL_FILL_NOTES`) - kein Fehler, sondern ein Hinweis, den der
   * Aufrufer an den Nutzer weiterreicht.
   */
  partialFillNote?: string;
  /**
   * Welche optionalen Zusatzangaben-Schlüssel tatsächlich in ein PDF-Feld
   * eingesetzt wurden (s. `OPTIONAL_EXTRA_KEYS_BY_VARIANT`) - der Aufrufer
   * nutzt das, um genau diese aus der separaten Textbeilage auszuschließen.
   */
  filledExtraKeys: string[];
  /**
   * Angaben, die DIESE Vorlage einsetzt, zu denen aber kein Wert kam - die
   * Felder bleiben im PDF leer. Weil die Nicht-Kernangaben optional sind, ist
   * das der einzige Weg, auf dem der Aufrufer davon erfährt: still leer
   * bleibende Felder in einem amtlichen Formular sind sonst genau der Fehler,
   * den der Bewerber erst beim Karriereberatungsbüro merkt.
   */
  fehlendeAngaben: AngabeSchluessel[];
}

/**
 * Füllt die bekannten Felder der erkannten Bewerbungsbogen/Karrierebogen-
 * Variante aus. Wirft `BewerbungsbogenTemplateChangedError`, wenn `attHeader`
 * zu keiner bekannten Variante passt, oder wenn NICHT EINMAL die Kernfelder
 * (Nachname/Vorname) gefunden werden - lieber laut fehlschlagen, als ein
 * augenscheinlich ausgefülltes, tatsächlich aber leeres PDF auszuliefern.
 */
export async function fillBewerbungsbogen(
  templateBytes: Uint8Array,
  values: BewerbungsbogenFillValues,
  attHeader: string,
): Promise<BewerbungsbogenFillResult> {
  const variant = detectBewerbungsbogenVariant(attHeader);
  if (!variant) {
    throw new BewerbungsbogenTemplateChangedError(
      `Diese Bewerbungsbogen-Vorlage ("${attHeader}") wird noch nicht unterstützt - bitte manuell ausfüllen.`,
    );
  }

  const doc = await pdfjsLib.getDocument({ data: templateBytes, isEvalSupported: false }).promise;
  const fieldObjects = await doc.getFieldObjects();

  if (!fieldObjects?.Nachname || !fieldObjects?.Vorname) {
    throw new BewerbungsbogenTemplateChangedError();
  }

  const fieldMap = buildFieldMapForVariant(variant, values);
  let filledCount = 0;
  for (const [name, value] of Object.entries(fieldMap)) {
    const entries = fieldObjects[name];
    if (!entries) continue;
    for (const entry of entries) {
      doc.annotationStorage.setValue(entry.id, { value });
      filledCount++;
    }
  }

  if (filledCount === 0) {
    throw new BewerbungsbogenTemplateChangedError();
  }

  const optionalExtraValues: Record<string, string | undefined> = {
    staatsangehoerigkeit: values.staatsangehoerigkeit,
    studienabschluss: values.studienabschluss,
    fuehrerschein: values.fuehrerschein,
  };
  const filledExtraKeys = OPTIONAL_EXTRA_KEYS_BY_VARIANT[variant].filter((key) => Boolean(optionalExtraValues[key]));
  const fehlendeAngaben = angabenFuerVariante(variant).benoetigt.filter((key) => !values[key]);

  return {
    bytes: await doc.saveDocument(),
    partialFillNote: PARTIAL_FILL_NOTES[variant],
    filledExtraKeys,
    fehlendeAngaben,
  };
}
