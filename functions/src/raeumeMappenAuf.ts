import { getFirestore, type DocumentSnapshot } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { istAbgelaufen } from "./mappe/ablauf";
import { loescheMappe } from "./mappe/mappeStore";
import { MAPPEN_COLLECTION } from "./mappe/mappeTypen";

export function waehleAbgelaufene(
  mappen: { mappenId: string; zipGebautAm: number | null; letzteAktivitaetAm: number }[],
  jetzt: number,
): string[] {
  return mappen.filter((mappe) => istAbgelaufen(mappe, jetzt)).map((mappe) => mappe.mappenId);
}

/** Mappen je Abfrage - die Seitengroesse, keine Obergrenze eines Laufs. */
export const SEITENGROESSE = 200;
/** Gleichzeitige Loeschungen - jede ist ein Storage-Praefix plus ein Firestore-Dokument. */
export const PARALLELE_LOESCHUNGEN = 10;
/** Zeitbudget eines Laufs, mit Abstand unter `timeoutSeconds` (300 s). */
export const ZEITBUDGET_MS = 240_000;

export interface MappenSeite<C> {
  mappen: { mappenId: string; zipGebautAm: number | null; letzteAktivitaetAm: number }[];
  /** Wo die naechste Seite beginnt; `null`, wenn diese Seite die letzte war. */
  weiter: C | null;
}

export interface AufraeumErgebnis {
  geprueft: number;
  geloescht: number;
  fehlgeschlagen: number;
  /** `true`, wenn das Zeitbudget vor dem Ende der faelligen Mappen ablief. */
  restOffen: boolean;
}

/**
 * Raeumt seitenweise auf, bis keine faellige Mappe mehr uebrig ist oder das
 * Zeitbudget ablaeuft.
 *
 * WOZU: endete ein Lauf nach einer festen Zahl Mappen, koennte jemand, der
 * schneller Mappen anlegt, als je Viertelstunde abfliessen, die Loeschung
 * aller Mappen - auch der echten Bewerber - beliebig weit hinter die
 * zugesagte Stunde schieben. Deshalb arbeitet ein Lauf die ganze faellige
 * Menge ab, in Seiten und mit begrenzter Parallelitaet.
 *
 * Geblaettert wird ueber einen Cursor, nicht durch erneutes Abfragen von vorn:
 * eine Mappe, deren Loeschung scheitert, steht sonst bei jeder Abfrage wieder
 * vorn, und der Lauf dreht sich bis zum Zeitbudget um sie.
 */
export async function raeumeAbgelaufeneAuf<C>(
  ladeSeite: (weiter: C | null) => Promise<MappenSeite<C>>,
  loesche: (mappenId: string) => Promise<void>,
  jetzt: number,
  budgetUm: () => boolean,
): Promise<AufraeumErgebnis> {
  const ergebnis: AufraeumErgebnis = { geprueft: 0, geloescht: 0, fehlgeschlagen: 0, restOffen: false };
  let weiter: C | null = null;
  do {
    if (budgetUm()) {
      ergebnis.restOffen = true;
      break;
    }
    const seite = await ladeSeite(weiter);
    ergebnis.geprueft += seite.mappen.length;
    // waehleAbgelaufene prueft noch einmal auf den Original-Zeitstempeln, s.
    // Kommentar im Aufrufer.
    const abgelaufen = waehleAbgelaufene(seite.mappen, jetzt);
    for (let i = 0; i < abgelaufen.length; i += PARALLELE_LOESCHUNGEN) {
      // Auch innerhalb der Seite: 20 Gruppen bei langsamem Storage koennen
      // sonst ueber das Timeout der Function laufen.
      if (budgetUm()) {
        ergebnis.restOffen = true;
        return ergebnis;
      }
      const ausgang = await Promise.allSettled(abgelaufen.slice(i, i + PARALLELE_LOESCHUNGEN).map(loesche));
      // Jede Mappe einzeln: eine einzelne fehlschlagende Loeschung (z.B. eine
      // Storage-Race) darf die uebrigen nicht von der Aufraeumung ausschliessen.
      // Weder mappenId noch Fehlertext - die Kennung ist der Zugriffsschluessel.
      ergebnis.geloescht += ausgang.filter((a) => a.status === "fulfilled").length;
      ergebnis.fehlgeschlagen += ausgang.filter((a) => a.status === "rejected").length;
    }
    weiter = seite.weiter;
  } while (weiter !== null);
  return ergebnis;
}

/**
 * Viertelstuendlich, damit die Stundenfrist auch bei einem verpassten Lauf
 * haelt. Die zweite, unabhaengige Garantie ist die Lifecycle-Regel des Buckets:
 * eine Frist, die an einem funktionierenden Cronjob
 * haengt, ist keine Frist.
 */
export const raeumeMappenAufScheduled = onSchedule(
  {
    schedule: "*/15 * * * *",
    timeZone: "Europe/Berlin",
    region: "europe-west3",
    // Loeschen ist I/O je Mappe (Storage-Prefix, dann Firestore). Mit dem
    // Standardwert von 60 Sekunden bricht ein Lauf mit vielen abgelaufenen
    // Mappen mitten in der Schleife ab - und genau dann haelt die Stundenfrist
    // nicht, fuer die diese Function existiert.
    timeoutSeconds: 300,
  },
  async () => {
    // Fragt direkt gegen verfaelltAm ab (Stichzeit + Frist, s. mappe/ablauf.ts
    // aktivitaetsFelder) statt gegen den Stellvertreter letzteAktivitaetAm:
    // eine Mappe, bei der nach dem Paketbau noch ein Dokument angefasst wurde,
    // hat eine juengere Aktivitaet als ihre wahre Faelligkeit - unter Last
    // koennte sie damit hinter das Abfragelimit rutschen und spaeter geloescht
    // werden als zugesagt. Aeltestes zuerst, damit bei einem
    // abgelaufenen Zeitbudget die am laengsten faelligen schon weg sind.
    //
    // waehleAbgelaufene prueft anschliessend noch einmal auf den
    // Original-Zeitstempeln. Das ist aber KEIN Netz gegen ein zu hohes
    // verfaelltAm: die Query entscheidet, was dieser Lauf ueberhaupt zu
    // sehen bekommt - eine Mappe mit zu spaetem verfaelltAm taucht gar
    // nicht auf. Die Nachpruefung faengt nur die andere Richtung ab (zu
    // frueh/fehlerhaft faellig) und verhindert damit eine verfruehte Loeschung.
    // Dass verfaelltAm stimmt, muss beim SCHREIBEN sichergestellt sein - dort
    // liegen Lesen und Schreiben deshalb in einer Transaktion (s.
    // mappe/mappeStore.ts, `schreibeMitAblauf`).
    const start = Date.now();
    const jetzt = start;
    const ergebnis = await raeumeAbgelaufeneAuf<DocumentSnapshot>(
      async (weiter) => {
        let abfrage = getFirestore()
          .collection(MAPPEN_COLLECTION)
          .where("verfaelltAm", "<=", jetzt)
          .orderBy("verfaelltAm", "asc")
          // verfaelltAm muss in der Projektion stehen: `startAfter(snapshot)`
          // liest den Cursorwert des Sortierfelds aus dem Schnappschuss.
          .select("verfaelltAm", "zipGebautAm", "letzteAktivitaetAm");
        if (weiter) abfrage = abfrage.startAfter(weiter);
        const snap = await abfrage.limit(SEITENGROESSE).get();
        return {
          mappen: snap.docs.map((doc) => ({
            mappenId: doc.id,
            zipGebautAm: (doc.get("zipGebautAm") as number | null) ?? null,
            letzteAktivitaetAm: (doc.get("letzteAktivitaetAm") as number) ?? 0,
          })),
          weiter: snap.size === SEITENGROESSE ? (snap.docs.at(-1) ?? null) : null,
        };
      },
      loescheMappe,
      jetzt,
      () => Date.now() - start > ZEITBUDGET_MS,
    );
    // Anzahl ja, Kennungen nein. `restOffen` heisst: der naechste Lauf in
    // einer Viertelstunde macht weiter - und es kamen in dieser Zeit mehr
    // Mappen herein, als ein Lauf loeschen kann (Missbrauch, s.
    // MAX_OFFENE_MAPPEN in mappe/mappeStore.ts).
    if (ergebnis.restOffen) logger.warn("Mappen aufgeraeumt, Zeitbudget erschoepft", { ...ergebnis });
    else logger.info("Mappen aufgeraeumt", { ...ergebnis });
  },
);
