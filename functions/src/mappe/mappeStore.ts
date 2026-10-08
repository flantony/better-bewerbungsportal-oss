import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { MAPPEN_ID_REGEX, neueMappenId } from "./mappeId";
import { aktivitaetsFelder, istAbgelaufen } from "./ablauf";
import { MappeVollError, pruefeUpload } from "./uploadRegeln";
import { HinweisFehler } from "../lib/hinweisFehler";
import {
  MAPPEN_COLLECTION,
  mappenBestand,
  mappenPrefix,
  type MappeRecord,
  type MappenDokument,
  type MappenAnforderungen,
  type Formularstand,
} from "./mappeTypen";

/**
 * Der Fehlertext geht bei vier Werkzeugen unveraendert an das fremde KI-Tool -
 * er muss deshalb den WEG nennen, nicht nur das Warum. Ein Client, der nur die
 * Erklaerung der Frist und damit eine Sackgasse ohne naechsten Schritt sieht, meldet
 * dem Bewerber eine Stoerung, statt ihm eine neue Mappe anzulegen - und der
 * Bewerber glaubt, das Angebot sei kaputt, obwohl nur seine Stunde um ist.
 *
 * Ohne mappenId in der Meldung: sie ist der Zugriffsschluessel und darf nicht in
 * Logs oder Fehlertexte geraten. Der Wortlaut "gibt es nicht mehr" bleibt
 * stabil, Pruefskripte suchen danach.
 * NICHT dieselbe Meldung wie an den Browser: die Upload-Seite bekommt
 * `MAPPE_UNBEKANNT_MELDUNG` aus `mappeHttp.ts`, weil dort ein Mensch liest und
 * ein Werkzeugname fuer ihn Kauderwelsch waere.
 */
export class MappeNichtGefundenError extends HinweisFehler {
  constructor() {
    super(
      "Diese Mappe gibt es nicht mehr. Mappen werden eine Stunde nach dem Paketbau gelöscht - oder, " +
        "falls nie eines gebaut wurde, eine Stunde nach der letzten Änderung. Das ist kein Serverfehler: " +
        "rufe eroeffne_bewerbungsmappe mit derselben pinstGuid erneut auf, dann bekommst du eine neue " +
        "Kennung samt Upload-Seite. Sag dem Bewerber, dass die Frist um ist und er seine Dateien über " +
        "den neuen Link noch einmal ablegen muss - melde ihm keine Störung.",
    );
    this.name = "MappeNichtGefundenError";
  }
}

/**
 * Obergrenze gleichzeitig offener Mappen, ueber alle Aufrufer.
 *
 * WOZU: die Pro-IP-Drosselung bremst einen
 * einzelnen Aufrufer, nicht viele. Ohne Deckel liessen sich Mappen schneller
 * anlegen, als der viertelstuendliche Aufraeumlauf sie loescht - und dann haelt
 * die Stundenfrist nicht mehr, die DSFA.md zusagt. 500 liegt weit ueber dem
 * echten Bedarf (eine Mappe lebt hoechstens eine Stunde nach der letzten
 * Aenderung). Die Zaehlung ist nicht atomar mit dem Anlegen; gleichzeitige
 * Aufrufe koennen den Deckel um ein paar Mappen ueberschreiten - er ist eine
 * Bremse, keine exakte Grenze.
 */
export const MAX_OFFENE_MAPPEN = 500;

export class ZuVieleMappenError extends HinweisFehler {
  constructor() {
    super(
      "Gerade sind so viele Bewerbungsmappen gleichzeitig offen, dass dieser Server im Moment keine neue anlegen " +
        "kann. Das liegt weder am Bewerber noch an dieser Stelle. Offene Mappen werden spätestens eine Stunde nach " +
        "ihrer letzten Änderung gelöscht und machen dann Platz - es kann also bis zu einer Stunde dauern. Versuche " +
        "eroeffne_bewerbungsmappe höchstens noch zwei- oder dreimal im Abstand einiger Minuten. Klappt es dann nicht, " +
        "sag dem Bewerber, dass die Mappe gerade nicht verfügbar ist, und hilf ihm ohne sie: Lebenslauf und " +
        "Anschreiben im Gespräch entwerfen, und die Formulare holt er sich als Blankoformular über die downloadUrl " +
        "aus get_document_requirements und stellt die Bewerbung selbst zusammen.",
    );
    this.name = "ZuVieleMappenError";
  }
}

/**
 * Die Kennung kommt von aussen (Werkzeugaufruf, HTTP-Body) und wird zu einem
 * Firestore-Pfad und einem Storage-Praefix. Was `neueMappenId` nicht erzeugt
 * haben kann, gibt es nicht - also derselbe Fehler wie fuer eine geloeschte
 * Mappe, ohne jeden Zugriff.
 */
function pruefeMappenId(mappenId: string): void {
  if (!MAPPEN_ID_REGEX.test(mappenId)) throw new MappenIdUngueltigError();
}

/**
 * Unterklasse, damit jeder Aufrufer sie wie eine fehlende Mappe behandelt (404
 * in mappeHttp.ts) - aber mit eigenem Text: eine verstuemmelte Kennung ist
 * keine abgelaufene Frist, und der Bewerber soll nicht hoeren, er muesse alles
 * neu hochladen, wenn die KI nur falsch kopiert hat. Die MCP-Schemas fangen das
 * Format schon vorher ab; das hier ist das zweite Netz.
 */
export class MappenIdUngueltigError extends MappeNichtGefundenError {
  constructor() {
    super();
    this.message =
      "Diese Kennung hat nicht das Format, das eroeffne_bewerbungsmappe ausgibt (ein m und 25 Kleinbuchstaben " +
      "oder Ziffern). Kopiere die mappenId unverändert aus der Antwort von eroeffne_bewerbungsmappe.";
    this.name = "MappenIdUngueltigError";
  }
}

function ref(mappenId: string) {
  pruefeMappenId(mappenId);
  return getFirestore().collection(MAPPEN_COLLECTION).doc(mappenId);
}

/** Mappen, deren Frist noch laeuft - eine Zaehl-Aggregation, abgerechnet nach Index-Eintraegen. */
async function zaehleOffeneMappen(jetzt: number): Promise<number> {
  const zaehlung = await getFirestore().collection(MAPPEN_COLLECTION).where("verfaelltAm", ">", jetzt).count().get();
  return zaehlung.data().count;
}

export async function erstelleMappe(job: {
  pinstGuid: string;
  refCode: string;
  titel: string;
  /** Schnappschuss der oeffentlichen Ausschreibungsdaten, s. `MappenAnforderungen`. */
  anforderungen: MappenAnforderungen;
}): Promise<string> {
  const jetzt = Date.now();
  if ((await zaehleOffeneMappen(jetzt)) >= MAX_OFFENE_MAPPEN) throw new ZuVieleMappenError();
  const mappenId = neueMappenId();
  const mappe: MappeRecord = {
    ...job,
    erstelltAm: jetzt,
    ...aktivitaetsFelder(jetzt, null),
    zipGebautAm: null,
    heruntergeladenAm: null,
    einmalToken: null,
    dokumente: [],
    formularstand: {},
  };
  await ref(mappenId).set(mappe);
  return mappenId;
}

/**
 * Laedt die Mappe und weist eine ABGELAUFENE ab, als waere sie schon geloescht.
 *
 * WOZU die Ablaufpruefung hier und nicht beim Aufrufer: `raeumeMappenAuf` laeuft
 * viertelstuendlich, es gibt also planmaessig ein Fenster von bis zu 15 Minuten,
 * in dem eine abgelaufene Mappe noch in Firestore steht. Ohne diese Pruefung
 * waere sie in diesem Fenster ueber die MCP-Werkzeuge voll benutzbar - und
 * `schliesse_bewerbungsmappe` liesse sie ueber `merkeZip` sogar um eine weitere
 * Stunde AUFERSTEHEN (verfaelltAm spraenge von der Vergangenheit auf
 * jetzt + Frist). Die Stundenfrist waere damit eine Aussage ueber den
 * Loeschzeitpunkt, nicht ueber die Nutzbarkeit. Die Pruefung liegt darum im
 * Lader: wer eine Mappe laedt, kann sie
 * nicht mehr vergessen.
 *
 * DERSELBE Fehler wie bei einer fehlenden Mappe: nach aussen darf kein
 * Unterschied sichtbar sein zwischen "schon aufgeraeumt" und "faellig, aber der
 * Aufraeumlauf war noch nicht da" - beides ist fuer den Bewerber dasselbe, und
 * die Meldung nennt die Frist ohnehin.
 */
export async function ladeMappe(mappenId: string): Promise<MappeRecord> {
  const mappe = await ladeMappeRoh(mappenId);
  if (istAbgelaufen(mappe, Date.now())) throw new MappeNichtGefundenError();
  return mappe;
}

/**
 * Laedt OHNE Ablaufpruefung - nur fuer die HTTP-Endpunkte in `mappeHttp.ts`.
 *
 * WOZU die Ausnahme: die Upload-Seite unterscheidet "gibt es nicht" (404) von
 * "abgelaufen" (410) und zeigt dem Bewerber im zweiten Fall, dass seine Frist
 * um ist, statt eines allgemeinen Fehlers. Diese Endpunkte pruefen
 * `istAbgelaufen` deshalb selbst und antworten mit eigener Meldung. Fuer alles
 * andere - insbesondere jedes MCP-Werkzeug - ist `ladeMappe` der richtige Weg.
 */
export async function ladeMappeRoh(mappenId: string): Promise<MappeRecord> {
  const snap = await ref(mappenId).get();
  if (!snap.exists) throw new MappeNichtGefundenError();
  return snap.data() as MappeRecord;
}

/**
 * Liest die Mappe und schreibt sie in EINER Transaktion zurueck - `zipGebautAm`
 * stammt damit garantiert aus demselben Zug wie das daraus errechnete
 * `verfaelltAm`.
 *
 * WOZU (statt `get()` + `update()`): Faellt `merkeZip` zwischen Lesen und
 * Schreiben, liest der Aufrufer `zipGebautAm: null`, obwohl das Paket schon
 * gebaut ist, und `aktivitaetsFelder` setzt `verfaelltAm` auf `jetzt + Frist`
 * statt auf `zipGebautAm + Frist`. Weil `jetzt` immer >= dem Paketbau liegt,
 * kann dieses Rennen die Frist NUR verlaengern. Und es faellt danach niemandem
 * mehr auf: `raeumeMappenAuf` waehlt per `where("verfaelltAm", "<=", jetzt)` aus
 * - ein zu hoher Wert nimmt die Mappe aus der Abfrage heraus, sodass die
 * nachgelagerte Pruefung `istAbgelaufen` sie gar nicht erst zu sehen bekommt.
 * Dieselbe Bauart wie `registriereAtomar`/`loeseDownloadEin` in `mappeHttp.ts`.
 */
async function schreibeMitAblauf<T>(
  mappenId: string,
  jetzt: number,
  bauePatch: (mappe: MappeRecord) => Record<string, unknown> | null,
  ergebnisAus: (mappe: MappeRecord) => T,
): Promise<T> {
  const dokRef = ref(mappenId);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(dokRef);
    if (!snap.exists) throw new MappeNichtGefundenError();
    const mappe = snap.data() as MappeRecord;
    const patch = bauePatch(mappe);
    if (patch) tx.update(dokRef, { ...patch, ...aktivitaetsFelder(jetzt, mappe.zipGebautAm) });
    return ergebnisAus(mappe);
  });
}

/**
 * Schreibt die Datei in Storage und verzeichnet sie in der Mappe.
 *
 * Die Mengengrenzen (10 Dateien, 30 MB, s. `uploadRegeln.ts`) prueft die
 * Transaktion selbst, gegen das Verzeichnis, das sie gerade gelesen hat
 * - nicht die Werkzeuge VOR dem Aufruf gegen einen frueher gelesenen Stand:
 * sonst liessen zwei gleichzeitige Aufrufe oder ein wiederholtes Ausfuellen
 * die Mappe ueber jede Grenze wachsen. Scheitert die Pruefung, wird die schon
 * geschriebene Datei wieder geloescht (s. catch).
 *
 * `ersetzt` nimmt vorhandene Eintraege heraus, an deren Stelle das neue
 * Dokument tritt - bei `fuelle_formular` das zuvor ausgefuellte Formular, sonst
 * stuende es nach jedem Korrekturlauf einmal mehr im Paket. Deren Dateien
 * werden erst NACH dem Commit geloescht (wie in `entferneDokument`).
 */
export async function fuegeDokumentEin(
  mappenId: string,
  dokument: Omit<MappenDokument, "storagePath" | "hinzugefuegtAm">,
  bytes: Uint8Array,
  ersetzt: (vorhanden: MappenDokument) => boolean = () => false,
): Promise<MappenDokument> {
  // Vor dem Storage-Zugriff - der Pfad unten ist aus der Kennung gebaut.
  pruefeMappenId(mappenId);
  const storagePath = `${mappenPrefix(mappenId)}${dokument.docId}`;
  const datei = getStorage().bucket().file(storagePath);
  await datei.save(Buffer.from(bytes), { contentType: dokument.contentType, resumable: false });
  const jetzt = Date.now();
  const eintrag: MappenDokument = { ...dokument, storagePath, hinzugefuegtAm: jetzt };
  let abgeloest: MappenDokument[] = [];
  try {
    abgeloest = await schreibeMitAblauf(
      mappenId,
      jetzt,
      (mappe) => {
        const bleibt = mappe.dokumente.filter((vorhanden) => !ersetzt(vorhanden));
        const erlaubt = pruefeUpload(
          { contentType: eintrag.contentType, sizeBytes: eintrag.sizeBytes },
          mappenBestand({ dokumente: bleibt }),
        );
        if (!erlaubt.ok) throw new MappeVollError(erlaubt.grund);
        // Die ganze Liste statt arrayUnion: Lesen und Schreiben liegen in
        // derselben Transaktion, ein gleichzeitiger Upload fuehrt also zu einer
        // Wiederholung statt zu einem verlorenen Eintrag.
        return { dokumente: [...bleibt, eintrag] };
      },
      (mappe) => mappe.dokumente.filter(ersetzt),
    );
  } catch (fehler) {
    // Sonst laege die Datei ohne Verzeichniseintrag im Bucket - unter einem
    // Praefix, das der Aufraeumlauf ueber Firestore nie wieder findet (derselbe
    // Grund wie in mappeHttp.ts, mappeRegisterDocument).
    await datei.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw fehler;
  }
  for (const alt of abgeloest) {
    // Bleibt eine davon liegen, faellt sie der praefixweisen Loeschung in
    // loescheMappe zu - im Paket steht sie nicht mehr, das Verzeichnis kennt sie nicht.
    await getStorage().bucket().file(alt.storagePath).delete({ ignoreNotFound: true }).catch(() => undefined);
  }
  return eintrag;
}

export async function entferneDokument(mappenId: string, docId: string): Promise<void> {
  const dokument = await schreibeMitAblauf(
    mappenId,
    Date.now(),
    (mappe) => {
      const eintrag = mappe.dokumente.find((vorhanden) => vorhanden.docId === docId);
      // arrayRemove statt Read-Filter-Overwrite: sonst verliert ein gleichzeitiger
      // Upload seinen Eintrag, und seine Datei ist im Paket nicht mehr auffindbar.
      return eintrag ? { dokumente: FieldValue.arrayRemove(eintrag) } : null;
    },
    (mappe) => mappe.dokumente.find((vorhanden) => vorhanden.docId === docId),
  );
  if (!dokument) return;
  // Erst nach dem Commit: eine Transaktion kann wiederholt werden, und eine
  // geloeschte Datei laesst sich nicht zurueckholen. Umgekehrt bleibt sie im
  // schlimmsten Fall bis zum Ablauf liegen und faellt dann der praefixweisen
  // Loeschung in loescheMappe zu.
  await getStorage().bucket().file(dokument.storagePath).delete({ ignoreNotFound: true });
}

export async function setzeFormularstand(mappenId: string, docId: string, stand: Formularstand): Promise<void> {
  await schreibeMitAblauf(
    mappenId,
    Date.now(),
    () => ({ [`formularstand.${docId}`]: stand }),
    () => undefined,
  );
}

/**
 * Der EINZIGE Schreibvorgang, der `verfaelltAm` nach hinten setzen darf - und
 * deshalb der einzige, der eine abgelaufene Mappe auferstehen lassen koennte.
 * Die Ablaufpruefung liegt darum in der Transaktion selbst, nicht nur im
 * vorgelagerten `ladeMappe` des Aufrufers: zwischen Laden und Schreiben liegt
 * hier der Paketbau, und der dauert (echte PDFs, echtes Storage). Ohne die
 * zweite Pruefung koennte eine Mappe, die waehrend des Verpackens faellig wird,
 * mit einer frischen Stunde zurueckkommen.
 */
export async function merkeZip(mappenId: string, einmalToken: string): Promise<void> {
  const dokRef = ref(mappenId);
  const jetzt = Date.now();
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(dokRef);
    if (!snap.exists) throw new MappeNichtGefundenError();
    if (istAbgelaufen(snap.data() as MappeRecord, jetzt)) throw new MappeNichtGefundenError();
    tx.update(dokRef, {
      zipGebautAm: jetzt,
      heruntergeladenAm: null,
      einmalToken,
      // Paketbau IST hier die Stichzeit - deshalb jetzt auch als zipGebautAm an
      // aktivitaetsFelder uebergeben, nicht das (nicht mehr aktuelle) alte Feld.
      ...aktivitaetsFelder(jetzt, jetzt),
    });
  });
}

/**
 * Registrierung und Einmal-Download sind NICHT hier: beide pruefen zusaetzlich
 * Grenzen bzw. Token in derselben Transaktion, sonst laesst sich die Groesse mit
 * einer parallelen Anfrage aushebeln bzw. derselbe Token zweimal einloesen. Sie
 * liegen in `mappeHttp.ts` (`registriereAtomar`, `loeseDownloadEin`) direkt
 * neben der Pruefung, die sie anwenden.
 */

/**
 * Loescht erst die Dateien, dann das Verzeichnis. Bricht der Lauf dazwischen ab,
 * findet der naechste die Mappe erneut und raeumt fertig auf - umgekehrt bliebe
 * eine Datei liegen, von der niemand mehr weiss.
 */
export async function loescheMappe(mappenId: string): Promise<void> {
  await getStorage().bucket().deleteFiles({ prefix: mappenPrefix(mappenId), force: true });
  await ref(mappenId).delete();
}
