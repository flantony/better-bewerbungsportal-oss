'use client';

import { useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { clientAuth } from '@/lib/firebase/client';

/**
 * Die beiden Schritte, mit denen ein Bewerber seine E-Mail-Adresse bestaetigt,
 * bevor wir ihm schreiben duerfen - einmal fuer „Mein Konto"
 * (benachrichtigungen.tsx) und die Uebernahmeseite fuer KI-Suchfilter.
 * `status` bleibt sichtbar stehen (anders als ein Toast), damit nach einem
 * Klick klar ist, was passiert ist.
 */
export function useEmailBestaetigung() {
  const [sendet, setSendet] = useState(false);
  const [prueft, setPrueft] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function erneutSenden() {
    const nutzer = clientAuth().currentUser;
    if (!nutzer) return;
    setSendet(true);
    try {
      await sendEmailVerification(nutzer);
      setStatus(
        `Wir haben die Bestätigungsmail an ${nutzer.email ?? 'deine Adresse'} geschickt. Schau auch im Spam-Ordner nach.`
      );
    } catch {
      setStatus(
        'Die Mail ging gerade nicht raus. Nach mehreren Versuchen kurz hintereinander sperrt der Mailversand eine Weile. Versuch es in ein paar Minuten noch einmal.'
      );
    } finally {
      setSendet(false);
    }
  }

  /**
   * `true`, wenn die Adresse jetzt bestaetigt ist. Ohne den erzwungenen
   * Token-Refresh saehe der Server weiter das `email_verified` vom alten Token -
   * die Mail waere bestaetigt, das Konto wuerde es nicht merken (s.
   * kontoBenachrichtigungSetzen).
   */
  async function pruefen(): Promise<boolean> {
    const nutzer = clientAuth().currentUser;
    if (!nutzer) return false;
    setPrueft(true);
    try {
      await nutzer.reload();
      if (!nutzer.emailVerified) {
        setStatus(
          'Deine Adresse ist noch nicht bestätigt. Öffne den Link in der Bestätigungsmail und klick danach noch einmal hier.'
        );
        return false;
      }
      await nutzer.getIdToken(true);
      setStatus(null);
      return true;
    } catch {
      setStatus('Das hat gerade nicht geklappt. Bitte versuch es noch einmal.');
      return false;
    } finally {
      setPrueft(false);
    }
  }

  return { sendet, prueft, status, erneutSenden, pruefen };
}
