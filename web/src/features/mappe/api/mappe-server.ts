import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import { istMappenId } from '../lib/mappen-id';

export interface MappenDokumentAnsicht {
  docId: string;
  /** z.B. "anschreiben" | "lebenslauf" | "zeugnis" | "formular" | "sonstiges" - s. functions/src/mappe/mappeTypen.ts DOKUMENT_ARTEN. */
  art: string;
  dateiname: string;
  sizeBytes: number;
}

export interface MappenAnsicht {
  titel: string;
  refCode: string;
  dokumente: MappenDokumentAnsicht[];
  abgelaufen: boolean;
}

const STUNDE_MS = 3_600_000;

/**
 * Kein Login: die Mappen-Kennung aus der URL IST die Berechtigung.
 * Deshalb liest die Seite mit dem Admin SDK und zeigt nur, was zu genau dieser
 * einen Kennung gehört - keine Session, kein Auth-Check.
 *
 * Liefert `null`, wenn die Kennung unbekannt ist. Die Ablauf-Berechnung
 * spiegelt bewusst `functions/src/mappe/ablauf.ts` (istAbgelaufen): zwei
 * Lagen mit derselben Frist - nach dem Paketbau hat die Mappe ihren Zweck
 * erfüllt, eine Mappe ohne Paket ist liegengeblieben. web/ und functions/
 * teilen kein Paket, deshalb steht die Regel hier noch einmal.
 */
export async function ladeMappeFuerSeite(mappenId: string): Promise<MappenAnsicht | null> {
  if (!istMappenId(mappenId)) return null;
  const snap = await adminDb.collection('bewerbungsmappen').doc(mappenId).get();
  if (!snap.exists) return null;

  const daten = snap.data() as {
    titel: string;
    refCode: string;
    dokumente?: MappenDokumentAnsicht[];
    zipGebautAm: number | null;
    letzteAktivitaetAm: number;
  };

  const stichzeit = daten.zipGebautAm ?? daten.letzteAktivitaetAm;
  return {
    titel: daten.titel,
    refCode: daten.refCode,
    dokumente: daten.dokumente ?? [],
    abgelaufen: Date.now() - stichzeit > STUNDE_MS
  };
}
