import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { JOBS_V2_COLLECTION } from "../lib/jobsV2Shape";
import {
  KONTEN_COLLECTION,
  KONTO_SCHEMA_VERSION,
  SUCHOPTIONEN,
  type BenachrichtigungRecord,
  type GemerkteStelle,
  type KontoRecord,
  type KontoSicht,
  type Suchprofil,
  type SuchprofilEintrag,
  type SuchprofilSicht,
} from "./kontoTypen";
import { merke, merkeAusMail, ohneGeschlossene, vergiss, type MerkErgebnis } from "./merkliste";
import { naechsterBenachrichtigungsStand, tokenPasst, type BenachrichtigungsZustand } from "./benachrichtigung";
import {
  ALTES_SUCHPROFIL_ID,
  aendereSuchprofil,
  entferneSuchprofil,
  fuegeSuchprofileHinzu,
  hatAktivenSuchfilter,
} from "./suchprofile";
import { neuerEinmalToken } from "../mappe/mappeId";
import { type Pruefung, type SuchprofileAnfrage } from "./kontoAnfragen";
import {
  angabenSchema,
  angabenSicht,
  KONTO_ANGABEN_SCHEMA_VERSION,
  naechsterAngabenStand,
  pruefeAngabenAnfrage,
  widerrufeStaatsangehoerigkeit as widerrufeStaatsangehoerigkeitReine,
  type Angaben,
  type AngabenRecord,
  type AngabenSicht,
} from "./angaben";
import {
  unterlagenPfad,
  UNTERLAGEN_ARTEN,
  type AusstehendeUnterlage,
  type UnterlageArt,
  type UnterlageEintrag,
} from "./unterlagen";

const kontoRef = (uid: string) => getFirestore().collection(KONTEN_COLLECTION).doc(uid);

// Bewerberangaben und Unterlagen: eigene Dokumente unter `konten/{uid}/privat/{angaben,dokumente}` -
// eigene Firestore-Regeln-Ebene (nicht rekursiv, s. firestore.rules), NIE im
// Hauptdokument, das der Nachtlauf fuer die Benachrichtigung liest.
const privatRef = (uid: string, doc: "angaben" | "dokumente") => kontoRef(uid).collection("privat").doc(doc);

type Roh = Record<string, unknown>;
const istObjekt = (wert: unknown): wert is Roh => typeof wert === "object" && wert !== null && !Array.isArray(wert);

/** Ein gelesenes Kontodokument - kann statt `suchprofile` das Einzelfeld `suchprofil` tragen. */
type KontoRoh = Partial<KontoRecord> & { suchprofil?: unknown };

/**
 * Die gespeicherten Filter eines gelesenen Dokuments (mehrere Filter je
 * Konto). Traegt das Dokument das Einzelfeld `suchprofil` (und kein
 * `suchprofile`), wird daraus EIN aktiver Filter mit `quelle: "hand"` und der
 * festen Kennung `ALTES_SUCHPROFIL_ID`; `null` wird zu keinem Filter. Die
 * naechste Schreibaktion an den Filtern schreibt `suchprofile` und entfernt
 * das Einzelfeld (s. `aendereSuchprofile`).
 *
 * Wie bei den `privat`-Dokumenten wird die Huelle geprueft: ein Eintrag ohne
 * Kennung, mit doppelter Kennung oder ohne Filterobjekt faellt weg (mit einer
 * Warnung, die nur die Zahl nennt), sonst greifen Vorgaben. Den Filter selbst
 * prueft der Server beim Schreiben (`suchprofilSchema`); hier wird er nicht
 * erneut validiert, damit eine spaeter umbenannte Auswahloption nicht still
 * den ganzen Filter loescht.
 */
function normalisiereSuchprofile(data: KontoRoh | undefined, erstelltAm: Timestamp): SuchprofilEintrag[] {
  const roh = data?.suchprofile as unknown;
  if (Array.isArray(roh)) {
    const eintraege: SuchprofilEintrag[] = [];
    const ids = new Set<string>();
    for (const e of roh) {
      if (!istObjekt(e) || typeof e.id !== "string" || e.id === "" || ids.has(e.id) || !istObjekt(e.filter)) continue;
      ids.add(e.id);
      eintraege.push({
        id: e.id,
        ...(typeof e.name === "string" && e.name !== "" ? { name: e.name } : {}),
        filter: e.filter as Suchprofil,
        aktiv: typeof e.aktiv === "boolean" ? e.aktiv : true,
        quelle: e.quelle === "ki" ? "ki" : "hand",
        erstelltAm: e.erstelltAm instanceof Timestamp ? e.erstelltAm : erstelltAm,
      });
    }
    if (eintraege.length < roh.length) {
      logger.warn("normalisiere: unlesbare Filtereintraege verworfen", { verworfen: roh.length - eintraege.length });
    }
    return eintraege;
  }
  const altesProfil = data?.suchprofil;
  if (istObjekt(altesProfil)) {
    return [{ id: ALTES_SUCHPROFIL_ID, filter: altesProfil as Suchprofil, aktiv: true, quelle: "hand", erstelltAm }];
  }
  return [];
}

/**
 * Vereinheitlicht ein gelesenes, moeglicherweise unvollstaendiges Dokument mit
 * den Vorgabewerten eines frischen Kontos. Noetig, weil ein Dokument
 * unvollstaendig sein kann (z.B. nur `schemaVersion` und `suchprofil`) - ein direkter
 * Cast auf `KontoRecord` liesse `merkliste`/`erstelltAm` dann `undefined`, und
 * jedes folgende `.map()` darauf (in `sicht`/`alsGemerkt`) wirft, also jeder
 * weitere Ladeversuch mit 500 endet. Wird an jeder Stelle verwendet, die ein
 * gelesenes Dokument in ein vollstaendiges `KontoRecord` verwandelt.
 */
// Exportiert, damit "Dokument ohne benachrichtigung" ohne
// Firestore testbar ist - der Schluessel fehlt dann ganz, statt auf
// ein Leer-/false-Objekt zu normalisieren (s. BenachrichtigungRecord-Kommentar
// in kontoTypen.ts). `sicht` macht daraus erst `aktiv: false`.
export function normalisiere(data: KontoRoh | undefined, jetzt: number): KontoRecord {
  const erstelltAm = data?.erstelltAm ?? Timestamp.fromMillis(jetzt);
  const basis: KontoRecord = {
    schemaVersion: data?.schemaVersion ?? KONTO_SCHEMA_VERSION,
    erstelltAm,
    suchprofile: normalisiereSuchprofile(data, erstelltAm),
    merkliste: data?.merkliste ?? [],
  };
  // Kein `benachrichtigung: data?.benachrichtigung` mit moeglichem
  // `undefined`-Wert: ein `tx.set`/`tx.update` mit einem Feld, das explizit
  // auf `undefined` steht, lehnt das Admin SDK ab.
  return data?.benachrichtigung ? { ...basis, benachrichtigung: data.benachrichtigung } : basis;
}

// `ausMail` wandert in beide Richtungen mit - sonst machte jedes Merken oder
// Vergessen aus allen Mail-Eintraegen still selbst gemerkte.
const alsGemerkt = (record: KontoRecord): GemerkteStelle[] =>
  record.merkliste.map((s) => ({
    pinstGuid: s.pinstGuid,
    gemerktAm: s.gemerktAm.toMillis(),
    ...(s.ausMail ? { ausMail: s.ausMail.toMillis() } : {}),
  }));

const alsGespeichert = (liste: GemerkteStelle[]): KontoRecord["merkliste"] =>
  liste.map((s) => ({
    pinstGuid: s.pinstGuid,
    gemerktAm: Timestamp.fromMillis(s.gemerktAm),
    ...(s.ausMail !== undefined ? { ausMail: Timestamp.fromMillis(s.ausMail) } : {}),
  }));

// Umwandlung Firestore-Timestamp <-> Millisekunden fuer die reine Logik in
// benachrichtigung.ts - dieselbe Aufteilung wie alsGemerkt/alsGespeichert oben.
const alsZustand = (b: BenachrichtigungRecord): BenachrichtigungsZustand => ({
  aktiv: b.aktiv,
  abmeldeToken: b.abmeldeToken,
  seitMs: b.seit.toMillis(),
  letzteAmMs: b.letzteAm ? b.letzteAm.toMillis() : null,
  gemeldet: b.gemeldet,
});

const alsBenachrichtigungRecord = (z: BenachrichtigungsZustand): BenachrichtigungRecord => ({
  aktiv: z.aktiv,
  abmeldeToken: z.abmeldeToken,
  seit: Timestamp.fromMillis(z.seitMs),
  letzteAm: z.letzteAmMs === null ? null : Timestamp.fromMillis(z.letzteAmMs),
  gemeldet: z.gemeldet,
});

// Exportiert: pure Sicht-Bildung, direkt testbar ohne Firestore.
// `emailBestaetigt` kommt vom Aufrufer (aus dem geprueften ID-Token), nie aus
// dem gespeicherten Record - s. Kommentar an KontoSicht.benachrichtigung.
export const suchprofilSicht = (e: SuchprofilEintrag): SuchprofilSicht => ({
  id: e.id,
  ...(e.name ? { name: e.name } : {}),
  filter: e.filter,
  aktiv: e.aktiv,
  quelle: e.quelle,
  erstelltAm: e.erstelltAm.toDate().toISOString(),
});

export function sicht(record: KontoRecord, emailBestaetigt: boolean): KontoSicht {
  return {
    suchprofile: record.suchprofile.map(suchprofilSicht),
    merkliste: record.merkliste.map((s) => ({
      pinstGuid: s.pinstGuid,
      gemerktAm: s.gemerktAm.toDate().toISOString(),
      ...(s.ausMail ? { ausMail: s.ausMail.toDate().toISOString() } : {}),
    })),
    optionen: SUCHOPTIONEN,
    benachrichtigung: { aktiv: record.benachrichtigung?.aktiv ?? false, emailBestaetigt },
  };
}

/**
 * Das Konto entsteht beim ersten Laden, nicht bei der Registrierung: so gibt es
 * keinen Auth-Trigger, der ausfallen kann, und kein Dokument fuer jemanden, der
 * sich registriert und nie wiederkommt (den raeumt die Inaktivitaetsregel ueber
 * die Auth-Metadaten ab, s. raeumeKontenAuf.ts).
 */
export async function ladeOderLegeAn(uid: string, jetzt: number, emailBestaetigt: boolean): Promise<KontoSicht> {
  const ref = kontoRef(uid);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return sicht(normalisiere(snap.data() as Partial<KontoRecord>, jetzt), emailBestaetigt);
    const neu = normalisiere(undefined, jetzt);
    tx.set(ref, neu);
    return sicht(neu, emailBestaetigt);
  });
}

/**
 * Wie `ladeOderLegeAn`, aber OHNE das Konto anzulegen -
 * fuer `kontoExport`: ein reiner Lesevorgang (Art. 15 DSGVO) darf nichts
 * anlegen, das vorher nicht da war. Ein noch nicht existierendes Konto liefert
 * einfach die normalisierten Vorgabewerte, ohne sie zu schreiben.
 */
export async function ladeReinLesend(uid: string, jetzt: number, emailBestaetigt: boolean): Promise<KontoSicht> {
  const snap = await kontoRef(uid).get();
  const record = normalisiere(snap.exists ? (snap.data() as Partial<KontoRecord>) : undefined, jetzt);
  return sicht(record, emailBestaetigt);
}

export type SuchprofileErgebnis =
  | { ergebnis: "hinzugefuegt"; hinzugefuegt: string[]; uebersprungen: number; suchprofile: SuchprofilSicht[] }
  | { ergebnis: "geaendert" | "geloescht"; suchprofile: SuchprofilSicht[] }
  | { ergebnis: "zu-viele"; frei: number }
  | { ergebnis: "unbekannt" | "doppelt" };

/**
 * Hinzufuegen, Aendern oder Loeschen von Filtern (`kontoSuchprofileAendern`)
 * - gelesen und geschrieben in EINER Transaktion, damit die Obergrenze und die
 * Dublettenpruefung gegen den jeweils aktuellen Stand laufen. Existiert das
 * Konto noch nicht, wird das VOLLSTAENDIGE Vorgabedokument angelegt, sonst
 * NUR `suchprofile` per `tx.update` geschrieben - eine
 * parallel geaenderte Merkliste bleibt unangetastet. Dabei faellt ein
 * Einzelfeld `suchprofil` weg: sein Inhalt steht danach als Eintrag in
 * `suchprofile` (s. `normalisiereSuchprofile`).
 */
export async function aendereSuchprofile(uid: string, anfrage: SuchprofileAnfrage, jetzt: number): Promise<SuchprofileErgebnis> {
  const ref = kontoRef(uid);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const record = normalisiere(snap.exists ? (snap.data() as KontoRoh) : undefined, jetzt);
    const schreibe = (suchprofile: SuchprofilEintrag[]) => {
      if (snap.exists) tx.update(ref, { suchprofile, suchprofil: FieldValue.delete() });
      else tx.set(ref, { ...record, suchprofile });
      return suchprofile.map(suchprofilSicht);
    };

    if (anfrage.aktion === "hinzufuegen") {
      const ergebnis = fuegeSuchprofileHinzu(record.suchprofile, anfrage.suchprofile, Timestamp.fromMillis(jetzt));
      if (!ergebnis.ok) return { ergebnis: "zu-viele", frei: ergebnis.frei };
      // Nur Dubletten - nichts zu schreiben, aber auch kein Fehler.
      const suchprofile =
        ergebnis.hinzugefuegt.length > 0 ? schreibe(ergebnis.liste) : record.suchprofile.map(suchprofilSicht);
      return {
        ergebnis: "hinzugefuegt",
        hinzugefuegt: ergebnis.hinzugefuegt,
        uebersprungen: ergebnis.uebersprungen,
        suchprofile,
      };
    }
    if (anfrage.aktion === "aendern") {
      const ergebnis = aendereSuchprofil(record.suchprofile, anfrage.id, anfrage.aenderung);
      if (!ergebnis.ok) return { ergebnis: ergebnis.grund };
      return { ergebnis: "geaendert", suchprofile: schreibe(ergebnis.liste) };
    }
    // Loeschen ist idempotent (wie "vergessen" auf der Merkliste): eine
    // unbekannte Kennung ist schon weg - dann wird auch nichts geschrieben.
    const rest = entferneSuchprofil(record.suchprofile, anfrage.id);
    if (rest.length === record.suchprofile.length) {
      return { ergebnis: "geloescht", suchprofile: record.suchprofile.map(suchprofilSicht) };
    }
    return { ergebnis: "geloescht", suchprofile: schreibe(rest) };
  });
}

/**
 * Der Filter mit dieser Kennung - fuer die Trefferzahl einer Filterkarte
 * (`kontoSuchprofilTreffer`). Rein lesend: legt kein Konto an.
 */
export async function ladeSuchprofilFilter(uid: string, id: string, jetzt: number): Promise<Suchprofil | null> {
  const snap = await kontoRef(uid).get();
  if (!snap.exists) return null;
  const record = normalisiere(snap.data() as KontoRoh, jetzt);
  return record.suchprofile.find((e) => e.id === id)?.filter ?? null;
}

export async function aendereMerkliste(
  uid: string,
  pinstGuid: string,
  aktion: "merken" | "vergessen",
  jetzt: number,
): Promise<MerkErgebnis | "vergessen" | "stelle-unbekannt"> {
  const db = getFirestore();
  if (aktion === "merken") {
    // Nur Stellen, die es gibt - sonst waere die Merkliste ein beliebiger
    // Textspeicher mit Nutzer-Schreibzugriff.
    const stelle = await db.collection(JOBS_V2_COLLECTION).doc(pinstGuid).get();
    if (!stelle.exists) return "stelle-unbekannt";
  }
  const ref = kontoRef(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const record = normalisiere(snap.exists ? (snap.data() as Partial<KontoRecord>) : undefined, jetzt);
    const alt = alsGemerkt(record);
    // Existiert das Konto schon, wird NUR `merkliste` geschrieben (`tx.update`)
    // statt das ganze Dokument zu ersetzen - zwischen-
    // zeitlich per `aendereSuchprofile` geaenderte `suchprofile` blieben
    // sonst unbemerkt auf dem hier gelesenen (moeglicherweise aelteren) Stand.
    // Nur fuer ein noch nicht existierendes Konto muss `tx.set` das
    // vollstaendige Vorgabedokument anlegen.
    const schreibe = (merkliste: KontoRecord["merkliste"]) =>
      snap.exists ? tx.update(ref, { merkliste }) : tx.set(ref, { ...record, merkliste });
    if (aktion === "vergessen") {
      schreibe(alsGespeichert(vergiss(alt, pinstGuid)));
      return "vergessen";
    }
    const { liste, ergebnis } = merke(alt, pinstGuid, jetzt);
    if (ergebnis === "gemerkt") schreibe(alsGespeichert(liste));
    return ergebnis;
  });
}

/** Die gemerkten Stellen eines gelesenen Kontos - fuer den Satz in der Treffer-Mail. */
export function gemerkteStellen(record: KontoRecord): GemerkteStelle[] {
  return alsGemerkt(record);
}

/** Firestore/gRPC-Fehlercode "NOT_FOUND" (dasselbe Muster wie FAILED_PRECONDITION in mcp/lib/queryJobs.ts). */
const NOT_FOUND = 5;

export type NachVersandErgebnis =
  | { ergebnis: "geschrieben"; aufMerkliste: number; keinPlatz: number; merklisteFehler: boolean }
  | { ergebnis: "konto-fehlt" };

/**
 * Nach einer erfolgreich versendeten Treffer-Mail: `benachrichtigung.letzteAm`
 * und `benachrichtigung.gemeldet` (gepunktete Pfade) fortschreiben und in
 * DERSELBEN Transaktion die gemeldeten Stellen auf die Merkliste setzen
 * (s. `merkeAusMail`). Eine
 * zwischenzeitliche Aenderung an Filtern oder `aktiv` durch den Nutzer bleibt
 * unangetastet; die Merkliste wird aus dem in der Transaktion gelesenen Stand
 * berechnet, ein paralleles Merken geht also nicht verloren.
 *
 * DIE MERKLISTE DARF DEN ZUSTAND NIE BLOCKIEREN: ohne fortgeschriebenes
 * `gemeldet` kaeme dieselbe Mail in der naechsten Nacht noch einmal. Laesst
 * sich die Merkliste nicht lesen, wird in derselben Transaktion nur der
 * Zustand geschrieben; scheitert die Transaktion als Ganzes, schreibt ein
 * zweiter Versuch nur den Zustand. Geloggt werden nur Fehlernamen.
 *
 * `konto-fehlt`: das Konto ist zwischen Versand und Schreiben verschwunden -
 * es gibt nichts mehr festzuschreiben.
 */
export async function schreibeNachVersand(
  uid: string,
  jetzt: number,
  gemeldet: string[],
  gemeldeteStellen: readonly string[],
): Promise<NachVersandErgebnis> {
  const ref = kontoRef(uid);
  const zustand = {
    "benachrichtigung.letzteAm": Timestamp.fromMillis(jetzt),
    "benachrichtigung.gemeldet": gemeldet,
  };
  try {
    return await getFirestore().runTransaction(async (tx): Promise<NachVersandErgebnis> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ergebnis: "konto-fehlt" };
      let merkliste: KontoRecord["merkliste"] | null = null;
      let aufMerkliste = 0;
      let keinPlatz = 0;
      let merklisteFehler = false;
      try {
        const record = normalisiere(snap.data() as KontoRoh, jetzt);
        const ergebnis = merkeAusMail(alsGemerkt(record), gemeldeteStellen, jetzt);
        aufMerkliste = ergebnis.hinzugefuegt;
        keinPlatz = ergebnis.keinPlatz;
        if (ergebnis.hinzugefuegt > 0) merkliste = alsGespeichert(ergebnis.liste);
      } catch (fehler) {
        logger.warn("schreibeNachVersand: Merkliste nicht lesbar, nur Zustand geschrieben", { name: (fehler as Error).name });
        merklisteFehler = true;
      }
      tx.update(ref, merkliste ? { ...zustand, merkliste } : zustand);
      return { ergebnis: "geschrieben", aufMerkliste, keinPlatz, merklisteFehler };
    });
  } catch (fehler) {
    if ((fehler as { code?: number }).code === NOT_FOUND) return { ergebnis: "konto-fehlt" };
    logger.warn("schreibeNachVersand: Transaktion fehlgeschlagen, schreibe nur den Zustand", { name: (fehler as Error).name });
    try {
      await ref.update(zustand);
    } catch (zweiterFehler) {
      if ((zweiterFehler as { code?: number }).code === NOT_FOUND) return { ergebnis: "konto-fehlt" };
      throw zweiterFehler;
    }
    return { ergebnis: "geschrieben", aufMerkliste: 0, keinPlatz: 0, merklisteFehler: true };
  }
}

/**
 * Nimmt geschlossene Stellen (s. `istGeschlossen` in merkliste.ts) von der
 * Merkliste eines Kontos - selbst gemerkte wie aus der Mail. Gelesen und
 * geschrieben in EINER Transaktion,
 * damit ein paralleles Merken nicht verloren geht; geschrieben wird nur
 * `merkliste` und nur, wenn sich etwas aendert. Liefert die Zahl der
 * entfernten Eintraege (0 auch fuer ein inzwischen geloeschtes Konto).
 */
export async function entferneGeschlosseneVonMerkliste(
  uid: string,
  geschlossen: ReadonlySet<string>,
  jetzt: number,
): Promise<number> {
  const ref = kontoRef(uid);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 0;
    const alt = alsGemerkt(normalisiere(snap.data() as KontoRoh, jetzt));
    const neu = ohneGeschlossene(alt, geschlossen);
    if (neu.length === alt.length) return 0;
    tx.update(ref, { merkliste: alsGespeichert(neu) });
    return alt.length - neu.length;
  });
}

/**
 * Schaltet die Benachrichtigung an/aus (`kontoBenachrichtigungSetzen`).
 * Die Entscheidung "aktiv:true ohne bestaetigte Mail -> 409" trifft der
 * Endpunkt VOR diesem Aufruf (die bestaetigte Mail kommt aus dem ID-Token, hat
 * hier nichts verloren). Transaktional und mit `tx.update` auf ein
 * bestehendes Dokument statt `set` (wie `aendereMerkliste`): ein
 * zwischenzeitlich geaendertes Suchprofil oder eine geaenderte Merkliste
 * bleiben unangetastet.
 */
export async function setzeBenachrichtigung(
  uid: string,
  aktiv: boolean,
  jetzt: number,
): Promise<"gesetzt" | "kein-profil"> {
  const ref = kontoRef(uid);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const record = normalisiere(snap.exists ? (snap.data() as Partial<KontoRecord>) : undefined, jetzt);
    // In derselben Transaktion gelesen wie geschrieben - ohne
    // einen aktiven, einschraenkenden Filter hiesse es "alle Stellen" (oder
    // nichts). Ausschalten geht immer.
    if (aktiv && !hatAktivenSuchfilter(record.suchprofile)) return "kein-profil";
    const alterZustand = record.benachrichtigung ? alsZustand(record.benachrichtigung) : undefined;
    const neuerZustand = naechsterBenachrichtigungsStand(alterZustand, aktiv, jetzt, neuerEinmalToken());
    const neuesFeld = alsBenachrichtigungRecord(neuerZustand);
    if (snap.exists) tx.update(ref, { benachrichtigung: neuesFeld });
    else tx.set(ref, { ...record, benachrichtigung: neuesFeld });
    return "gesetzt";
  });
}

/**
 * Loest den Abbestell-Link ein (`kontoAbbestellen` - ohne Anmeldung).
 * "Unbekanntes Konto", "falsches Token" und "nie eingeschaltet" liefern
 * dasselbe `"ungueltig"` - der Aufrufer darf daraus nicht auf die
 * Existenz eines Kontos schliessen. Token und `gemeldet`
 * bleiben erhalten, nur `aktiv` wird auf false gesetzt - ein spaeteres
 * Wiedereinschalten braucht keinen neuen Link.
 */
export async function bestaetigeAbbestellung(
  uid: string,
  token: string,
  jetzt: number,
): Promise<"abgemeldet" | "ungueltig"> {
  const ref = kontoRef(uid);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "ungueltig";
    const record = normalisiere(snap.data() as Partial<KontoRecord>, jetzt);
    if (!record.benachrichtigung || !tokenPasst(record.benachrichtigung.abmeldeToken, token)) return "ungueltig";
    if (record.benachrichtigung.aktiv) {
      tx.update(ref, { benachrichtigung: { ...record.benachrichtigung, aktiv: false } });
    }
    return "abgemeldet";
  });
}

/**
 * Erst die Daten, dann das Auth-Konto: scheitert das zweite, bleibt ein leeres
 * Konto, das der naechste Versuch (oder die Inaktivitaetsregel) entfernt.
 * Umgekehrt blieben Daten ohne Konto zurueck, an die niemand mehr herankommt -
 * auch nicht der Bewerber, der ihre Loeschung verlangt hat.
 *
 * `recursiveDelete` deckt bereits `privat/angaben` und
 * `privat/dokumente` ab (Subcollections von `konten/{uid}`) - dazu kommt
 * die Storage-Loeschung der eigentlichen Dateien unter `konten/{uid}/` (das
 * PDF-Formular aus `fuelle_formular` landet nicht hier - nur
 * hochgeladene Unterlagen und gebaute Pakete). `deleteFiles` auf einem Praefix ohne Treffer ist
 * ein No-Op (leere Ergebnisliste), kein Fehler - "kein Konto hat je eine
 * Unterlage hochgeladen" braucht keine eigene Fallunterscheidung.
 */
export async function loescheKonto(uid: string): Promise<void> {
  await getFirestore().recursiveDelete(kontoRef(uid));
  await getStorage().bucket().deleteFiles({ prefix: `konten/${uid}/` });
  try {
    await getAuth().deleteUser(uid);
  } catch (fehler) {
    if ((fehler as { code?: string }).code !== "auth/user-not-found") throw fehler;
  }
}

// ─── Normalisierung der privat-Datensaetze ──────────────────────────────────
//
// Wie `normalisiere()` fuer das Kontodokument: ein gelesenes Dokument wird nie
// blind gecastet. Fehlende Felder bekommen sichere Vorgaben, unbekannte Felder
// fallen weg, `angaben` wird auf die bekannten Schluessel gefiltert.

const ANGABEN_FELDER = Object.keys(angabenSchema.shape) as (keyof Angaben)[];

export function normalisiereAngaben(data: unknown): AngabenRecord {
  const roh = istObjekt(data) ? data : {};
  const angabenRoh = istObjekt(roh.angaben) ? roh.angaben : {};
  const angaben: Angaben = {};
  for (const feld of ANGABEN_FELDER) {
    const wert = angabenRoh[feld];
    if (typeof wert === "string" && wert !== "") angaben[feld] = wert;
  }
  const einwilligung = roh.einwilligungStaatsangehoerigkeit;
  return {
    schemaVersion: typeof roh.schemaVersion === "string" ? roh.schemaVersion : KONTO_ANGABEN_SCHEMA_VERSION,
    angaben,
    einwilligungStaatsangehoerigkeit:
      istObjekt(einwilligung) && einwilligung.erteiltAm instanceof Timestamp && typeof einwilligung.textVersion === "string"
        ? { erteiltAm: einwilligung.erteiltAm, textVersion: einwilligung.textVersion }
        : null,
    geaendertAm: roh.geaendertAm instanceof Timestamp ? roh.geaendertAm : Timestamp.fromMillis(0),
  };
}

export interface DokumenteNormalisiert {
  schemaVersion: string;
  eintraege: UnterlageEintrag[];
  ausstehend: Record<string, AusstehendeUnterlage>;
}

const istUnterlageArt = (wert: unknown): wert is UnterlageArt =>
  typeof wert === "string" && (UNTERLAGEN_ARTEN as readonly string[]).includes(wert);

/**
 * Ein Eintrag ohne `docId` ist nicht ansprechbar und faellt weg; fehlt sonst
 * etwas, greifen Vorgaben (die Datei bleibt so in Liste/Export sichtbar). Ein
 * `ausstehend`-Eintrag ohne gueltige Art faellt weg (er liesse sich nicht
 * korrekt registrieren); ohne numerisches `erstelltAm` wird er 0 und gilt
 * damit als abgelaufen.
 */
export function normalisiereDokumente(data: unknown): DokumenteNormalisiert {
  const roh = istObjekt(data) ? data : {};
  const eintraege: UnterlageEintrag[] = [];
  for (const e of Array.isArray(roh.eintraege) ? roh.eintraege : []) {
    if (!istObjekt(e) || typeof e.docId !== "string" || e.docId === "") continue;
    eintraege.push({
      docId: e.docId,
      art: istUnterlageArt(e.art) ? e.art : "sonstiges",
      dateiname: typeof e.dateiname === "string" && e.dateiname !== "" ? e.dateiname : "unterlage",
      contentType: typeof e.contentType === "string" ? e.contentType : "application/octet-stream",
      sizeBytes: typeof e.sizeBytes === "number" && Number.isFinite(e.sizeBytes) ? e.sizeBytes : 0,
      hochgeladenAm: e.hochgeladenAm instanceof Timestamp ? e.hochgeladenAm : Timestamp.fromMillis(0),
    });
  }
  const ausstehend: Record<string, AusstehendeUnterlage> = {};
  for (const [docId, a] of Object.entries(istObjekt(roh.ausstehend) ? roh.ausstehend : {})) {
    if (!istObjekt(a) || !istUnterlageArt(a.art)) continue;
    ausstehend[docId] = {
      art: a.art,
      dateiname: typeof a.dateiname === "string" && a.dateiname !== "" ? a.dateiname : "unterlage",
      contentType: typeof a.contentType === "string" ? a.contentType : "",
      erstelltAm: typeof a.erstelltAm === "number" && Number.isFinite(a.erstelltAm) ? a.erstelltAm : 0,
    };
  }
  return {
    schemaVersion: typeof roh.schemaVersion === "string" ? roh.schemaVersion : KONTO_ANGABEN_SCHEMA_VERSION,
    eintraege,
    ausstehend,
  };
}

// ─── Angaben ─────────────────────────────────────────────────────────────────

export async function ladeAngaben(uid: string): Promise<AngabenRecord | null> {
  const snap = await privatRef(uid, "angaben").get();
  return snap.exists ? normalisiereAngaben(snap.data()) : null;
}

/**
 * Prueft UND schreibt in derselben Transaktion (wie `aendereMerkliste`): die
 * Einwilligungspruefung (`pruefeAngabenAnfrage`) braucht den JEWEILS
 * aktuellen bestehenden Stand - gelesen und geschrieben in getrennten
 * Schritten koennte zwischen Pruefung und Schreiben eine zweite Anfrage die
 * Einwilligung widerrufen haben, und das Feld ginge trotzdem durch.
 *
 * Legt zusaetzlich das ELTERN-Dokument `konten/{uid}` an, falls es fehlt
 * - `privat/angaben` ist eine Subcollection davon;
 * ohne das Elterndokument sieht der Waisen-Sweep in `raeumeKontenAuf.ts`
 * (der ueber die TOP-LEVEL-Dokumente der `konten`-Collection iteriert) dieses
 * Konto nie, selbst wenn ein Auth-Nutzer dazu existiert. `normalisiere(undefined, jetzt)`
 * baut denselben Vorgabe-Datensatz wie `ladeOderLegeAn`.
 */
export async function speichereAngaben(uid: string, body: unknown, jetzt: number): Promise<Pruefung<AngabenSicht>> {
  const ref = privatRef(uid, "angaben");
  const elternRef = kontoRef(uid);
  return getFirestore().runTransaction(async (tx) => {
    const [snap, elternSnap] = await Promise.all([tx.get(ref), tx.get(elternRef)]);
    const bestehend = snap.exists ? normalisiereAngaben(snap.data()) : null;
    const pruefung = pruefeAngabenAnfrage(body, bestehend, jetzt);
    if (!pruefung.ok) return pruefung;
    const naechster = naechsterAngabenStand(bestehend, pruefung.wert, jetzt);
    tx.set(ref, naechster);
    if (!elternSnap.exists) tx.set(elternRef, normalisiere(undefined, jetzt));
    return { ok: true, wert: angabenSicht(naechster) };
  });
}

/**
 * Idempotent: ohne gespeicherte Staatsangehoerigkeit UND ohne Vermerk
 * passiert nichts - der Endpunkt antwortet in jedem Fall mit 204 (ein
 * zweiter Widerruf ist kein Fehlerfall).
 */
export async function widerrufeStaatsangehoerigkeit(uid: string): Promise<void> {
  const ref = privatRef(uid, "angaben");
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const roh = snap.data();
    const alt = normalisiereAngaben(roh);
    // Art. 9: auf dem ROHEN Dokument pruefen, ob irgendetwas zu entfernen ist -
    // ein kaputter Wert/Vermerk, den die Normalisierung verwirft, muss beim
    // Widerruf trotzdem aus Firestore verschwinden.
    const rohAngaben = istObjekt(roh) ? roh.angaben : undefined;
    const hatEtwasZuWiderrufen =
      (istObjekt(rohAngaben) && "staatsangehoerigkeit" in rohAngaben) ||
      (istObjekt(roh) && roh.einwilligungStaatsangehoerigkeit !== undefined && roh.einwilligungStaatsangehoerigkeit !== null);
    if (!hatEtwasZuWiderrufen) return;
    tx.set(ref, widerrufeStaatsangehoerigkeitReine(alt));
  });
}

/** Loescht alle gemerkten Angaben auf einmal ("Alle Angaben löschen"). */
export async function loescheAngaben(uid: string): Promise<void> {
  await privatRef(uid, "angaben").delete();
}

// ─── Unterlagen ──────────────────────────────────────────────────────────────

/**
 * `eintraege` fehlt, wenn das Dokument entweder gar nicht existiert ODER nur
 * ueber `ausstehend` (die Upload-URL-Bruecke, s. `merkeAusstehendeUnterlage`)
 * angelegt wurde, bevor je etwas registriert wurde - beides zaehlt als "noch
 * keine Unterlagen", nicht als kaputtes Dokument.
 */
function eintraegeAus(daten: unknown): UnterlageEintrag[] {
  return normalisiereDokumente(daten).eintraege;
}

export async function ladeUnterlagen(uid: string): Promise<UnterlageEintrag[]> {
  const snap = await privatRef(uid, "dokumente").get();
  return eintraegeAus(snap.exists ? snap.data() : undefined);
}

/**
 * Ersetzt einen etwaigen Eintrag mit derselben docId, statt ihn zu
 * verdoppeln (wie `registriereAtomar` in mappeHttp.ts) - eine zweite
 * Registrierung derselben Datei laesst das Verzeichnis damit nicht wachsen.
 * Die Mengengrenzen selbst prueft der Aufrufer VOR diesem Aufruf gegen den
 * Bucket-Bestand (nicht gegen dieses Verzeichnis) - hier wird
 * nur noch geschrieben. `tx.set(..., {merge:true})`, NICHT ein vollstaendiges
 * Ersetzen: das Dokument kann bereits ein `ausstehend`-Feld fuer eine ANDERE
 * docId tragen (von der Upload-URL-Bruecke), das hier unangetastet bleiben
 * muss - `kontoUnterlageRegistrieren` entfernt den EIGENEN `ausstehend`-
 * Eintrag separat (`vergissAusstehendeUnterlage`), erst NACH dieser Funktion.
 */
export async function registriereUnterlage(uid: string, eintrag: UnterlageEintrag): Promise<void> {
  const ref = privatRef(uid, "dokumente");
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const bestehend = eintraegeAus(snap.exists ? snap.data() : undefined);
    const rest = bestehend.filter((e) => e.docId !== eintrag.docId);
    tx.set(ref, { schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION, eintraege: [...rest, eintrag] }, { merge: true });
  });
}

/**
 * Erst das Verzeichnis (transaktional, wiederholbar), dann die Storage-Datei
 * (wie `entferneDokument` in mappe/mappeStore.ts) - eine Transaktion kann
 * wiederholt werden, eine geloeschte Datei nicht. Existiert der Eintrag
 * nicht (mehr), passiert nichts (weder Firestore- noch Storage-Zugriff).
 */
export async function entferneUnterlage(uid: string, docId: string): Promise<void> {
  const ref = privatRef(uid, "dokumente");
  const entfernt = await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const bestehend = eintraegeAus(snap.data());
    if (!bestehend.some((e) => e.docId === docId)) return false;
    tx.set(
      ref,
      { schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION, eintraege: bestehend.filter((e) => e.docId !== docId) },
      { merge: true },
    );
    return true;
  });
  if (!entfernt) return;
  await getStorage().bucket().file(unterlagenPfad(uid, docId)).delete({ ignoreNotFound: true });
}

// ─── Ausstehende Uploads ─────────────────────────────────────────────────────
//
// Bruecke zwischen `kontoUnterlageUploadUrl` (kennt art/dateiname/contentType)
// und `kontoUnterlageRegistrieren` (bekommt laut Vertrag nur `docId`). Liegt
// unter `ausstehend.<docId>` im selben Dokument wie `eintraege`, aber getrennt
// davon - ein angefordertes, nie hochgeladenes Upload taucht so nirgends als
// fertige Unterlage auf (GET kontoUnterlagen, Export). Beide Funktionen (hier
// und `vergissAusstehendeUnterlage`) werden sowohl von kontoHttp.ts als auch
// vom stuendlichen Sweep in raeumeUploadsAuf.ts verwendet - deshalb hier im
// Store statt lokal in einer der beiden Dateien.

/**
 * Legt zusaetzlich das ELTERN-Dokument `konten/{uid}` an, falls es fehlt
 * - dieselbe Ueberlegung wie bei `speichereAngaben`:
 * ohne das Elterndokument sieht der Waisen-Sweep dieses Konto nie. `jetzt`
 * dient zusaetzlich als `erstelltAm` des Eintrags selbst - der Aufrufer
 * liefert `art`/`dateiname`/`contentType`, den Zeitstempel
 * setzt diese Funktion, damit er nie vergessen werden kann.
 */
export async function merkeAusstehendeUnterlage(
  uid: string,
  docId: string,
  angabe: Omit<AusstehendeUnterlage, "erstelltAm">,
  jetzt: number,
): Promise<void> {
  const ref = privatRef(uid, "dokumente");
  const elternRef = kontoRef(uid);
  await getFirestore().runTransaction(async (tx) => {
    const [snap, elternSnap] = await Promise.all([tx.get(ref), tx.get(elternRef)]);
    const bestehend = normalisiereDokumente(snap.exists ? snap.data() : undefined);
    const vollstaendig: AusstehendeUnterlage = { ...angabe, erstelltAm: jetzt };
    // `merge: true` fuehrt die `ausstehend`-Map feldweise zusammen - Eintraege,
    // die die Normalisierung verworfen hat, bleiben dadurch unangetastet
    // liegen (kein stilles Loeschen), der Sweep raeumt sie ab.
    const neuesAusstehend = { ...bestehend.ausstehend, [docId]: vollstaendig };
    tx.set(ref, { schemaVersion: KONTO_ANGABEN_SCHEMA_VERSION, ausstehend: neuesAusstehend }, { merge: true });
    if (!elternSnap.exists) tx.set(elternRef, normalisiere(undefined, jetzt));
  });
}

export async function ladeAusstehendeUnterlage(uid: string, docId: string): Promise<AusstehendeUnterlage | null> {
  const snap = await privatRef(uid, "dokumente").get();
  return normalisiereDokumente(snap.exists ? snap.data() : undefined).ausstehend[docId] ?? null;
}

/**
 * ALLE ausstehenden Eintraege eines Kontos - fuer das
 * eigene Aufraeumen VOR jeder neuen Upload-URL (`kontoHttp.ts`): ein
 * ausstehend-Eintrag kann aelter als die Stundenfrist sein, OHNE dass (noch)
 * ein zugehoeriges Storage-Objekt existiert (z.B. nach einem gescheiterten
 * Best-Effort-Loeschversuch) - das rein Storage-basierte Aufraeumen findet
 * einen solchen Eintrag nie.
 */
export async function ladeAlleAusstehenden(uid: string): Promise<Record<string, AusstehendeUnterlage>> {
  const snap = await privatRef(uid, "dokumente").get();
  return normalisiereDokumente(snap.exists ? snap.data() : undefined).ausstehend;
}

/**
 * Entfernt GENAU diesen einen `ausstehend`-Eintrag ueber einen Dot-Pfad
 * (`FieldValue.delete()`), ohne den Rest des Dokuments zu lesen oder
 * anzufassen. Kann werfen (z.B. wenn das Dokument inzwischen komplett
 * geloescht wurde, `update()` verlangt ein existierendes Dokument) - beide
 * Aufrufer (kontoHttp.ts nach erfolgreicher Registrierung bzw. beim eigenen
 * Aufraeumen, raeumeUploadsAuf.ts im stuendlichen Sweep) behandeln einen
 * Fehlschlag hier als Best-Effort (fangen ihn selbst ab, loggen nur
 * den Fehlernamen) - ein liegen gebliebener `ausstehend`-Eintrag ist harmlos.
 */
export async function vergissAusstehendeUnterlage(uid: string, docId: string): Promise<void> {
  await privatRef(uid, "dokumente").update({ [`ausstehend.${docId}`]: FieldValue.delete() });
}
