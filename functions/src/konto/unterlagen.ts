/**
 * Unterlagen im Konto - reine Regeln, keine Firestore-/Storage-
 * Zugriffe. Dateinamen werden gespeichert, aber nie geloggt;
 * Feldwerte der Angaben tauchen hier ohnehin nicht auf.
 */
import { Timestamp } from "firebase-admin/firestore";
import { type Pruefung } from "./kontoAnfragen";
import { ERLAUBTE_TYPEN, MAX_DATEI_BYTES } from "../mappe/uploadRegeln";

/**
 * Keine "ausweiskopie": wir nehmen keine Ausweiskopien
 * entgegen (s. mappe/ausweiskopie.ts). Deshalb braucht keine Unterlage einen
 * eigenen Einwilligungsvermerk.
 */
export const UNTERLAGEN_ARTEN = ["lebenslauf", "zeugnis", "sonstiges"] as const;
export type UnterlageArt = (typeof UNTERLAGEN_ARTEN)[number];

export const MAX_UNTERLAGEN = 15;
export const MAX_UNTERLAGEN_BYTES = 50 * 1024 * 1024;

export interface UnterlageEintrag {
  docId: string;
  art: UnterlageArt;
  dateiname: string;
  contentType: string;
  sizeBytes: number;
  hochgeladenAm: Timestamp;
}

export function pruefeNeueUnterlage(
  neu: { art: UnterlageArt; contentType: string; sizeBytes: number },
  bestand: { anzahl: number; bytes: number },
): Pruefung<true> {
  if (!ERLAUBTE_TYPEN.includes(neu.contentType as (typeof ERLAUBTE_TYPEN)[number])) {
    return { ok: false, fehler: "Erlaubt sind PDF, JPEG und PNG." };
  }
  if (neu.sizeBytes <= 0 || neu.sizeBytes > MAX_DATEI_BYTES) {
    return { ok: false, fehler: `Eine Datei darf höchstens ${MAX_DATEI_BYTES / 1024 / 1024} MB haben.` };
  }
  if (bestand.anzahl >= MAX_UNTERLAGEN) {
    return { ok: false, fehler: `Ein Konto nimmt höchstens ${MAX_UNTERLAGEN} Dateien.` };
  }
  if (bestand.bytes + neu.sizeBytes > MAX_UNTERLAGEN_BYTES) {
    return { ok: false, fehler: `Ein Konto darf insgesamt höchstens ${MAX_UNTERLAGEN_BYTES / 1024 / 1024} MB haben.` };
  }
  return { ok: true, wert: true };
}

/** Storage-Pfad einer REGISTRIERTEN Unterlage - `uid` kommt aus dem geprueften ID-Token, nie vom Client. */
export function unterlagenPfad(uid: string, docId: string): string {
  return `konten/${uid}/dokumente/${docId}`;
}

/**
 * Storage-Pfad des UPLOAD-Ziels - getrennt von
 * `unterlagenPfad`. Eine signierte PUT-URL bleibt 15 Minuten gueltig und laesst
 * sich beliebig oft erneut aufrufen; zeigte sie direkt auf den endgueltigen
 * Pfad, koennte ein spaeteres PUT eine bereits registrierte, bereits gegen-
 * gepruefte Datei nach der Pruefung unbemerkt ersetzen. Ein Upload landet
 * deshalb IMMER zuerst hier; `kontoUnterlageRegistrieren` liest die echten
 * Bytes von hier, kopiert sie erst NACH erfolgreicher Pruefung nach
 * `unterlagenPfad` und loescht das Eingangs-Objekt. Ein nie registriertes
 * Eingangs-Objekt gilt nach `EINGANG_FRIST_MS` als verwaist (s.
 * `istVerwaisterUpload`) und wird abgeraeumt - es zaehlt bis dahin gegen die
 * Mengengrenzen des Kontos, damit es diese nicht durch endloses Abbrechen
 * umgehen kann.
 */
export function eingangPfad(uid: string, docId: string): string {
  return `konten/${uid}/eingang/${docId}`;
}

/**
 * Ein noch unregistriertes Eingangs-Objekt/`ausstehend`-Eintrag gilt nach
 * dieser Frist als verwaist - abgebrochen, vergessen oder nie zu Ende
 * hochgeladen. Dieselbe Groessenordnung wie die Mappen-Frist
 * (`mappe/ablauf.ts`), aus demselben Grund: lang genug fuer einen echten
 * Upload, kurz genug, dass ein liegen gebliebenes Objekt nicht dauerhaft
 * unsichtbar im Bucket bleibt.
 */
export const EINGANG_FRIST_MS = 60 * 60 * 1000;

/**
 * Reine Alters-Pruefung - kein Storage-Zugriff, direkt
 * testbar. Wird sowohl beim eigenen Aufraeumen VOR jeder neuen Upload-URL
 * (`kontoUnterlageUploadUrl`) als auch vom stuendlichen Sweep
 * (`raeumeUploadsAufScheduled`) und bei der Mengengrenzen-Zaehlung
 * (`bestandImBucket`) verwendet - ein und dieselbe Regel an allen drei
 * Stellen, statt eines eigenen Zeitvergleichs je Aufrufer.
 */
export function istVerwaisterUpload(zeitErstelltMs: number, jetzt: number): boolean {
  return jetzt - zeitErstelltMs >= EINGANG_FRIST_MS;
}

/**
 * Wie `istVerwaisterUpload`, aber fuer einen gelesenen `ausstehend`-Eintrag,
 * dessen `erstelltAm` fehlen oder kaputt sein kann: ohne
 * brauchbaren Zeitstempel gilt der Eintrag als abgelaufen - im Zweifel
 * aufraeumen, statt einen Dateinamen unbefristet liegen zu lassen.
 */
export function istAusstehendAbgelaufen(erstelltAm: unknown, jetzt: number): boolean {
  if (typeof erstelltAm !== "number" || !Number.isFinite(erstelltAm)) return true;
  return istVerwaisterUpload(erstelltAm, jetzt);
}

/**
 * Metadaten eines angeforderten, aber noch nicht registrierten Uploads -
 * Bruecke zwischen `kontoUnterlageUploadUrl` (kennt art/dateiname/contentType)
 * und `kontoUnterlageRegistrieren` (bekommt laut Vertrag nur `docId`). Liegt
 * unter `ausstehend.<docId>` im selben Firestore-Dokument wie `eintraege`,
 * aber getrennt davon - ein angefordertes, nie hochgeladenes Upload taucht so
 * nirgends als fertige Unterlage auf (GET kontoUnterlagen, Export).
 */
export interface AusstehendeUnterlage {
  art: UnterlageArt;
  dateiname: string;
  contentType: string;
  /**
   * Millisekunden seit Epoch, wann diese Anfrage gestellt wurde -
   * unabhaengig davon, ob (noch) ein Eingangs-Objekt im Storage
   * existiert: ein liegen gebliebener `ausstehend`-Eintrag (z.B. nach einem
   * gescheiterten Best-Effort-Loeschversuch) traegt sonst auf unbestimmte
   * Zeit einen Dateinamen weiter mit sich herum. Dieselbe Stundenfrist wie
   * das Eingangs-Objekt selbst (`istVerwaisterUpload`).
   */
  erstelltAm: number;
}

/** Rohform von `konten/{uid}/privat/dokumente` - `eintraege` UND `ausstehend` koennen fehlen (frisches Dokument). */
export interface DokumenteRecord {
  schemaVersion?: string;
  eintraege?: UnterlageEintrag[];
  ausstehend?: Record<string, AusstehendeUnterlage>;
}

const MAX_DATEINAME_LAENGE = 120;
const MAX_ENDUNG_LAENGE = 10;
const STANDARD_DATEINAME = "unterlage";

// Steuerzeichen (inkl. CR/LF/NUL/Tab) sowie `"` und `\` - der Name landet
// spaeter in einem gequoteten Content-Disposition-Header; ohne dieses Sieb
// koennte ein Dateiname mit eingebettetem CR/LF dort weitere Header
// einschleusen (Header-Injection), ein `"` die Quotierung aufbrechen.
const UNERWUENSCHTE_ZEICHEN = /[\x00-\x1f\x7f"\\]/g;

// Unicode-Format-Zeichen (Kategorie Cf) - insbesondere die bidirektionalen
// Steuerzeichen U+202A-U+202E (RLO/LRO/PDF etc.) und die unsichtbaren
// Trenner U+200B-U+200F/U+2060-U+2069/U+FEFF. Kein Steuerzeichen im Sinne
// von `UNERWUENSCHTE_ZEICHEN` (das sind nur \x00-\x1f/\x7f), aber derselbe
// Angriff: "rechnung\u202Efdp.exe" zeigt sich im Dateisystem/Browser als
// "rechnungexe.pdf" (RLO dreht die sichtbare Reihenfolge um) - der
// tatsaechliche Dateityp bleibt aber .exe. `\p{Cf}` statt einer festen Liste,
// damit auch nicht einzeln aufgezaehlte Format-Zeichen derselben Kategorie
// erfasst sind.
const FORMAT_ZEICHEN = /\p{Cf}/gu;

/**
 * Erkennt eine "echte" Dateiendung: ein Punkt mit hoechstens 10
 * alphanumerischen Zeichen danach (der Stamm davor darf leer sein, s.
 * `sichererDateiname`). Alles andere (kein Punkt, oder ein unplausibel
 * langer/sonderzeichenhaltiger Rest) zaehlt NICHT als Endung, sondern bleibt
 * Teil des Stamms - sonst koennte eine praeparierte "Endung" die
 * 120-Zeichen-Kuerzung unterlaufen.
 */
function zerlegeEndung(name: string): { stamm: string; endung: string } {
  const punkt = name.lastIndexOf(".");
  // Kein Punkt -> keine Endung. Ein Punkt an Position 0 (z.B. ".pdf" nach dem
  // Saeubern von "\r\n.pdf") zaehlt dagegen als Endung mit leerem Stamm -
  // `sichererDateiname` setzt den Stamm dann auf `STANDARD_DATEINAME`.
  if (punkt < 0) return { stamm: name, endung: "" };
  const endung = name.slice(punkt);
  const zeichenOhnePunkt = endung.slice(1);
  const gueltig = zeichenOhnePunkt.length > 0 && zeichenOhnePunkt.length <= MAX_ENDUNG_LAENGE && /^[A-Za-z0-9]+$/.test(zeichenOhnePunkt);
  return gueltig ? { stamm: name.slice(0, punkt), endung } : { stamm: name, endung: "" };
}

/**
 * Nur der Dateiname, kein Pfadanteil (haelt `../../x.pdf` und
 * `..\\..\\x.pdf` davon ab, aus dem vorgesehenen Ordner auszubrechen), ohne
 * Steuerzeichen/Anfuehrungszeichen/Backslash (s. `UNERWUENSCHTE_ZEICHEN`) und
 * ohne Unicode-Format-/Bidi-Zeichen (s. `FORMAT_ZEICHEN`), hoechstens 120
 * Zeichen - die Endung bleibt beim Kuerzen erhalten, damit der Dateityp fuer
 * den Bewerber erkennbar bleibt. Zuerst NFC-normalisiert: ein zerlegter
 * Umlaut (Buchstabe + Kombinationszeichen, z.B. aus manchen macOS-Dateisystemen)
 * soll denselben Namen ergeben wie die vorkomponierte Form, nicht zwei
 * optisch identische, aber unterschiedliche gespeicherte Namen. Bleibt nach
 * dem Bereinigen kein Stamm mehr uebrig (leer, oder nur Steuer-/Format-
 * zeichen), tritt `unterlage` an seine Stelle - ein leerer gespeicherter
 * Dateiname waere sonst ein eigener Fehlerfall an jeder Stelle, die ihn
 * spaeter anzeigt oder herunterlaedt.
 */
/**
 * Kuerzt nach CODEPUNKTEN, nicht nach UTF-16-Code-Einheiten: ein Emoji o.ae.
 * ausserhalb der Basic Multilingual Plane besteht
 * aus einem Surrogatpaar (zwei Code-Einheiten) - `String.prototype.slice`
 * kennt das nicht und kann mitten im Paar abschneiden. Ein einzeln
 * uebrig gebliebenes Surrogat ist kein gueltiges UTF-16 mehr:
 * `encodeURIComponent` wirft dann eine URIError - in
 * `contentDispositionUnterlage` waere das ein dauerhaftes 500 beim Download
 * genau dieser einen Datei. `Array.from` zerlegt nach Codepunkten (kennt
 * Surrogatpaare), `.join("")` fuegt sie unverletzt wieder zusammen.
 */
function kuerzeAufCodepunkte(text: string, maxLaenge: number): string {
  const codepunkte = Array.from(text);
  return codepunkte.length <= maxLaenge ? text : codepunkte.slice(0, maxLaenge).join("");
}

export function sichererDateiname(name: string): string {
  const normalisiert = name.normalize("NFC");
  const ohnePfad = normalisiert.replace(/^.*[\\/]/, "");
  const bereinigt = ohnePfad.replace(UNERWUENSCHTE_ZEICHEN, "").replace(FORMAT_ZEICHEN, "");
  if (bereinigt.length === 0) return STANDARD_DATEINAME;

  const { stamm, endung } = zerlegeEndung(bereinigt);
  const sichererStamm = stamm.length > 0 ? stamm : STANDARD_DATEINAME;
  const grenze = Math.max(0, MAX_DATEINAME_LAENGE - endung.length);
  return kuerzeAufCodepunkte(sichererStamm, grenze) + endung;
}

/** Die Sicht auf eine Unterlage, wie sie `kontoUnterlagen`/`kontoUnterlageRegistrieren` ausliefern. */
export interface UnterlageSicht {
  docId: string;
  art: UnterlageArt;
  dateiname: string;
  contentType: string;
  sizeBytes: number;
  hochgeladenAm: string;
}

/** Reine Umwandlung des gespeicherten Eintrags in die Sicht (ISO-Zeitstempel statt Timestamp). */
export function unterlageSicht(eintrag: UnterlageEintrag): UnterlageSicht {
  return {
    docId: eintrag.docId,
    art: eintrag.art,
    dateiname: eintrag.dateiname,
    contentType: eintrag.contentType,
    sizeBytes: eintrag.sizeBytes,
    hochgeladenAm: eintrag.hochgeladenAm.toDate().toISOString(),
  };
}

/**
 * `Content-Disposition` fuer den Unterlagen-Download: `filename=` mit einem
 * ASCII-Fallback (fuer einen Client ohne RFC-5987-Unterstuetzung) UND
 * zusaetzlich `filename*=UTF-8''...` (RFC 5987, prozent-kodiert) mit dem
 * echten Namen - so bleibt ein Umlaut im Dateinamen erhalten, ohne den
 * Header-Wert auf nicht-Latin1-Bytes zu verlassen. Setzt auf
 * `sichererDateiname` auf (kein Header-Injection-Risiko, s. dort).
 */
export function contentDispositionUnterlage(dateiname: string): string {
  const sicher = sichererDateiname(dateiname);
  const asciiFallback = sicher.replace(/[^\x20-\x7e]/g, "_");
  // RFC-5987-ext-value: attr-char erlaubt weniger Zeichen, als encodeURIComponent
  // unkodiert laesst (' ( ) * bleiben sonst stehen) - dieselbe Nachkodierung wie
  // im MDN-Beispiel fuer Content-Disposition.
  const percentKodiert = encodeURIComponent(sicher)
    .replace(/['()]/g, (z) => `%${z.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${percentKodiert}`;
}
