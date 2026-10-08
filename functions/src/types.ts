import type { Besoldungsspanne } from "./lib/besoldungsSpanne";

/**
 * Rohformat der `Stellensuche`-Entität, wie sie von der öffentlichen
 * Bundeswehr-OData-API (BWD_ER2_EREC_EXT_UNREG_SRV) zurückgegeben wird.
 * Feldnamen entsprechen exakt der API (PascalCase), damit beim Debuggen
 * gegen die Doku/Netzwerk-Mitschnitte keine Übersetzung nötig ist.
 *
 * Wichtig: `SearchCategory` ist beim Listing kontextabhängig (spiegelt den
 * getroffenen Filterzweig wider, nicht eine stabile Job-Eigenschaft) und
 * darf NICHT als verlässliches Kategorisierungsfeld verwendet werden.
 * `ContractType` ist dagegen stabil und über Wertehilfen_Vertragsart gelabelt.
 */
export interface RawStellensuche {
  Laufbahn: string;
  NumberOfJobs: string;
  Distance: number;
  PLZ: string;
  InterestGroup: string;
  Ausbi: string;
  Place: string;
  SearchCategory: string;
  PostingTxt: string;
  HierarchyLevel: string;
  ContractType: string;
  HotJob: boolean;
  EmployeeFract: string;
  NewJob: boolean;
  FunctionalArea: string;
  ShlpBesoldGrp: string;
  Industry: string;
  Keywords: string;
  Langu: string;
  OrgObjid: string;
  SearchTask: string;
  PinstGuid: string;
  CompanyDesc: string;
  JobDesc: string;
  RefCode: string;
  RequireDesc: string;
  RemarcDesc: string;
  ContactDesc: string;
  Title: string;
  PostingAge: number;
  BesOrt: string;
  ReqType: string;
  ReqIndustry: number;
  ApplicationEnd: string;
  Latitude: string;
  Longitude: string;
  RC: number;
  ArtResStelle: string;
  Country: string;
  Region: string;
  Arbeitszeit: string;
  BesGruppe: string;
  BesTabelle: string;
  Tarifgruppe1: string;
  Tarifgruppe2: string;
  StartDate: string;
  EndDate: string;
}

/** Rohformat der `AttSuchauftrag`-Entität (geforderte Dokumente je Stelle). */
export interface RawAttSuchauftrag {
  PinstGuid: string;
  AttType: string;
  AttHeader: string;
  AttTypeTxt: string;
  AttachmentUrl: string;
  Attachment: string;
  Size: string;
  Category: string;
  Subcategory: string;
  CategoryId: string;
  SubcategoryId: string;
  ContentType: string;
}

/** Ergebnis der Listenabfrage (nur Übersichtsfelder, Volltext ist leer). */
export interface JobSummary {
  pinstGuid: string;
  langu: string;
  refCode: string;
  title: string;
  /** Bundesland-Code (Wertehilfen_Region, "12" = Brandenburg). Nur in der Listenzeile. */
  region: string;
  /** ISO-Laendercode (Wertehilfen_Staaten). Nur in der Listenzeile. */
  country: string;
}

/** Normalisiertes Dokument, wie es in Firestore unter `documents[]` liegt. */
/**
 * Ergebnis der KI-Anforderungsextraktion (`extractJobAttributes.ts`).
 * Hier nochmal als Firestore-Form deklariert, damit `types.ts` die einzige
 * Stelle bleibt, an der das Dokumentschema steht.
 */
export interface JobAttributesRecord {
  dienstgrad: string;
  besoldung: { label: string; von: number; bis: number } | null;
  laufbahngruppen: string[];
  abschluss: string;
  seiteneinstieg: "ja" | "nein" | "unklar";
  sicherheitsueberpruefung: string;
  sprachen: string[];
  berufserfahrungJahre: number;
  /** 0 = nicht genannt. Haeufigstes K.-o.-Kriterium militaerischer Laufbahnen. */
  mindestalter: number;
  hoechstalter: number;
  /** Woertlich aus dem Text, z.B. "12 Jahre". */
  verpflichtungsdauer: string;
  /** Geforderte Unterlagen, wie im Ausschreibungstext aufgezaehlt. */
  unterlagen: string[];
  /** Formale Auflagen dazu (beglaubigte Uebersetzung, Weg ueber Karriereberatung, ...). */
  unterlagenHinweise: string;
  /** Woertliches Zitat aus der Ausschreibung, das die Angabe belegt. */
  belegstelle: string;
  schemaVersion: string;
}

/** Verweis auf einen deduplizierten Anhang, wie er auf der Stelle liegt. */
export interface JobDocumentRefRecord {
  docId: string;
  attHeader: string;
}

export interface JobDocument {
  attHeader: string;
  attType: string;
  /** Klartext-Label zu `attType` (SAP-Domainwert), z.B. "Bewerbungsbogen". */
  attTypeTxt: string;
  /** Kategorie/Unterkategorie der Anlage - strukturierte Alternative zum
   *  Header-Text-Matching in `detectBewerbungsbogenVariant`. */
  category: string;
  subcategory: string;
  attachment: string;
  sizeLabel: string;
  contentType: string;
  downloadUrl: string;
}

/**
 * Name/ID der Subcollection, die den Volltext (`JobContentRecord`) getrennt
 * von den schlanken Listenfeldern (`JobSummaryRecord`) hält - siehe
 * `JobRecord`-Kommentar für die Begründung. Firestore-Reads werden pro
 * Dokument abgerechnet, unabhängig von dessen Größe; die Trennung spart also
 * kein Read-Kontingent, wohl aber Bandbreite/Ladezeit für Listenansichten,
 * die die Volltexte ohnehin nie anzeigen.
 */
export const JOB_CONTENT_SUBCOLLECTION = "content";
export const JOB_CONTENT_DOC_ID = "detail";

/** Volltext/Dokumente einer Ausschreibung - unter `jobs/{pinstGuid}/content/detail`. */
export interface JobContentRecord {
  companyDesc: string;
  jobDesc: string;
  requireDesc: string;
  remarcDesc: string;
  contactDesc: string;
}

/**
 * Schlanker Datensatz für `jobs/{pinstGuid}` - alles, was Listenansichten
 * (Stellenliste, KI-Matching-Hartfilter, Last Chance) brauchen, OHNE die
 * großen Volltextfelder (s. `JobContentRecord`).
 */
/**
 * Übersichtsdokument einer Ausschreibung (`jobs/{pinstGuid}`).
 *
 * BEWUSST SCHLANK: Rohfelder der Bundeswehr-API, die der Detailabruf nicht
 * befüllt (`functionalArea`, `hierarchyLevel`, `laufbahn`, `besGruppe`,
 * `besTabelle`, `shlpBesoldGrp`, `keywords`, `industry`, `artResStelle`,
 * `interestGroup`, `ausbi`, `place`, `plz`, `employeeFract`, `orgObjid`,
 * `searchTask`) oder die keinen Informationsgehalt haben (`distance` immer 0,
 * `newJob` immer false, `langu` immer "D"), werden nicht gespeichert - ebenso
 * `searchCategoryRaw`/`postingAge` als unbrauchbar bzw. redundant.
 *
 * Ein Rohfeld aufzunehmen ist billig - ein Sync-Lauf, keine KI-Kosten.
 * Deshalb wird nichts "vielleicht mal nützlich" mitgeschleppt.
 */
export interface JobSummaryRecord {
  pinstGuid: string;
  refCode: string;
  title: string;

  // ─── Kategorie (alles hiervon ist filterbar) ─────────────────────────────
  contractType: string;
  contractTypeLabel: string | null;
  /** 1 = militärisch, 2 = zivil (Wertehilfen_Taetigkeitsbereich). */
  reqIndustry: number;
  /**
   * Job-Typ-Code der API (`ReqType`, wenige distinkte Werte, immer befüllt). Wirkt
   * kryptisch, ist aber die Grundlage der "Art der Stelle"-Facette in der
   * Stellenliste (s. web/src/features/jobs/lib/job-filters.ts) - deshalb
   * bewusst behalten, obwohl die Bedeutung der Codes nicht dokumentiert ist.
   */
  reqType: string;
  /**
   * Hergeleitete Facetten (s. deriveJobFacets.ts): die Rohfelder
   * `FunctionalArea`/`HierarchyLevel` liefert die API beim Lesen immer leer, im
   * `$filter` funktionieren sie aber. Diese Codes werden deshalb beim Sync über
   * invertierte Filterabfragen ermittelt - anders als die Rohfelder sind sie
   * tatsächlich befüllt und abfragbar.
   * Codes: ORGANISATIONSBEREICH_OPTIONS / LAUFBAHNGRUPPE_OPTIONS.
   */
  organisationsbereich?: string;
  laufbahngruppe?: string;
  /**
   * Besonderer Einstiegsweg, deterministisch aus dem `refCode`-Praefix
   * abgeleitet (s. lib/einstiegsweg.ts): `ROB-` = Reserveoffizier, `SE_` =
   * Seiteneinstieg, `WE_` = Wiedereinstellung. `""` = keiner erkennbar, das ist
   * der Normalfall.
   *
   * WARUM NICHT AUS DEM VOLLTEXT: Fast keine `SE_`-Ausschreibung enthaelt das
   * Wort "Seiteneinstieg" im Text. Die KI-Extraktion liefert dort korrekt "unklar" - das Signal steht schlicht
   * nicht im Text, sondern im Kennzeichen. Deshalb hier deterministisch und
   * ohne Modellaufruf.
   *
   * Nicht zu verwechseln mit `jobAttributes.seiteneinstieg`: das ist die
   * Aussage des Ausschreibungstextes ("wird es ausdruecklich angeboten?"),
   * dieses Feld ist das Verfahren, in dem die Stelle laeuft.
   */
  einstiegsweg?: string;

  // ─── Ort ─────────────────────────────────────────────────────────────────
  besOrt: string;
  /**
   * Bundesland als Code der API (`Region`, s. Wertehilfen_Region: "12" =
   * Brandenburg). Kommt aus der LISTENZEILE, nicht aus dem Detailabruf - der
   * liefert das Feld leer. Dadurch bekommt es jede Stelle bei jedem Sync, auch
   * die laengst bekannten.
   *
   * WOZU: Ohne dieses Feld kennt die Suche nur exakte Ortsnamen. Eine Anfrage
   * nach "Brandenburg" faende dann keine Stellen in Schoenewalde.
   */
  region: string;
  /** Land als ISO-Code (`Country`, Wertehilfen_Staaten). Wie `region` aus der Listenzeile. */
  country: string;
  /** Fast immer befüllt - echte Umkreissuche wäre damit möglich. */
  latitude: string;
  longitude: string;

  // ─── Zeit ────────────────────────────────────────────────────────────────
  applicationEnd: string;
  /**
   * Sortierbare Entsprechung von `applicationEnd` (DD.MM.YYYY-String, lexikographisch
   * NICHT chronologisch sortierbar). Fehlt/nicht
   * parsbar -> weit in der Zukunft, damit "offene" Ausschreibungen beim Sortieren
   * nach Bewerbungsschluss ans Ende rutschen statt fälschlich ganz vorn zu landen.
   */
  applicationEndSortKey: FirebaseFirestore.Timestamp;
  startDate: string;
  endDate: string;

  // ─── Beschäftigung ───────────────────────────────────────────────────────
  arbeitszeit: string;
  /**
   * Amtliche Tarif-/Besoldungsgruppen der Ausschreibung, roh. Quelle der
   * abgeleiteten `besoldung`-Spanne (s. besoldungsSpanne.ts). Nur im
   * Detailabruf enthalten, also nur bei Stellen gesetzt, deren Details
   * abgerufen wurden.
   */
  tarifgruppe1: string;
  tarifgruppe2: string;
  /** Aus `arbeitszeit` vorberechnet, damit direkt gefiltert werden kann. */
  vollzeit: boolean;

  /**
   * EINE Besoldungsangabe. Primärquelle sind die amtlichen
   * Rohfelder `Tarifgruppe1`/`Tarifgruppe2` (Spanne), Fallback ist
   * die Ableitung über einen genannten Dienstgrad. `quelle` sagt, was es war.
   * `null` = keine Angabe ermittelbar. S. lib/besoldungsSpanne.ts.
   */
  besoldung: Besoldungsspanne | null;

  /** Titel-Tokens für `array-contains`-Suche, s. lib/suchTokens.ts. */
  suchTokens: string[];
  /**
   * Orts-Tokens, damit der Wunschort in die Query wandert statt nachgefiltert zu
   * werden. Als Nachfilter waere er still falsch: der Fetch-Deckel greift vor
   * dem Filter (s. queryJobs.ts, MAX_FETCH_NACHFILTER).
   */
  ortTokens: string[];

  /**
   * Verweise auf die dedupliziert abgelegten Anhänge (s. jobDocumentStore.ts).
   * Liegt auf dem Übersichtsdokument, damit die Trefferliste weiß, ob ein
   * Bewerbungsbogen existiert, ohne den Volltext nachzuladen.
   */
  dokumente: JobDocumentRefRecord[];

  /**
   * KI-extrahierte Anforderungen aus dem Fließtext (s. extractJobAttributes.ts).
   * Bewusst ein eigenes Objekt, klar getrennt von den Angaben der Ausschreibung -
   * alles hier ist abgeleitet, nicht amtlich.
   */
  jobAttributes?: JobAttributesRecord;

  // ─── Kennzeichen / Housekeeping ──────────────────────────────────────────
  hotJob: boolean;
  firstSeenAt: FirebaseFirestore.Timestamp;
  lastSeenAt: FirebaseFirestore.Timestamp;
  lastDetailFetchAt: FirebaseFirestore.Timestamp;
  active: boolean;
  removedAt: FirebaseFirestore.Timestamp | null;
}

/**
 * Vollständiger, unaufgeteilter Datensatz - wird von `sync.ts` beim Anlegen
 * neuer Stellen einmal zusammengebaut und dann in `JobSummaryRecord`
 * (`jobs/{pinstGuid}`) und `JobContentRecord`
 * (`jobs/{pinstGuid}/content/detail`) aufgeteilt geschrieben.
 */
export type JobRecord = JobSummaryRecord & JobContentRecord;

/**
 * Ein Glossar-Eintrag für Bundeswehr-/öffentlicher-Dienst-Jargon, erzeugt
 * aus dem Ausschreibungsbestand. Dokument-ID in `glossary/{slug}` ist `slug`.
 * Wird von `sync.ts` genutzt, um Vorkommen in Ausschreibungs-
 * Volltexten mit `<span data-glossary-term="{slug}">` zu markieren (s.
 * `lib/glossaryAnnotate.ts`), und vom Frontend gelesen, um die Markierungen
 * beim Rendern in Tooltips mit `definition` aufzulösen.
 */
export interface GlossaryTerm {
  /** Anzeigename in Original-Schreibweise, z.B. "Unteroffizier mit Portepee". */
  term: string;
  /** URL-/ID-taugliches Kürzel, z.B. "unteroffizier-mit-portepee". */
  slug: string;
  /** Kurze, für Laien verständliche Erklärung. */
  definition: string;
  /** Alternative Schreibweisen/Abkürzungen, die ebenfalls auf diesen Eintrag verweisen sollen (z.B. "SanFw" für "Sanitätsfeldwebel"). */
  aliases: string[];
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string;
  totalListed: number;
  /** Neu aufgetauchte Stellen - einzige Fälle, die einen API-Detailabruf auslösen. */
  newCount: number;
  /** Bereits bekannte, weiterhin aktive Stellen - nur lastSeenAt aktualisiert, kein API-Call. */
  unchangedCount: number;
  /** Nicht mehr gelistet ODER Frist abgelaufen - beides fuehrt zur Archivierung (active: false). */
  removedCount: number;
  /** Archivierte Stellen, die aelter als ARCHIV_TAGE waren und endgueltig geloescht wurden. */
  archiviertGeloescht: number;
  /** Gelistete Stellen, die schon bei der Aufnahme abgelaufen waren - nie angelegt. */
  abgelaufenUebersprungen: number;
  errorCount: number;
  errors: string[];
}

/** Eine einzelne GET-Operation innerhalb eines OData `$batch`-Requests. */
export interface BatchOperation {
  /** Pfad + Query relativ zur Service-Root, z.B. "Stellensuche_Set?...". */
  path: string;
}

export interface BatchResult<T = unknown> {
  status: number;
  ok: boolean;
  body: T | null;
  rawText: string;
}

/**
 * Diese Datei enthaelt bewusst KEINE Nutzertypen. Nutzerbezogene Daten gibt es
 * nur im Konto (`konto/kontoTypen.ts`) und in der transienten Bewerbungsmappe
 * (`mappe/mappeTypen.ts`); der MCP-Server nimmt Bewerberangaben sonst pro
 * Aufruf entgegen und legt sie nirgends ab. Was tatsaechlich verarbeitet wird,
 * haelt `DSFA.md` fest.
 *
 * Ein weiteres nutzerbezogenes Feld ist eine neue
 * DSGVO-Verarbeitungstaetigkeit (Rechtsgrundlage, Loeschkonzept,
 * DSFA-Eintrag).
 */
