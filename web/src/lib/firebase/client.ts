'use client';

import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, getAuth } from 'firebase/auth';
import { type Firestore, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export const firebaseApp: FirebaseApp =
  getApps()[0] ?? initializeApp(firebaseConfig);
// Firestore nur fuer oeffentliche Ausschreibungsdaten. Kontodaten liest der
// Browser NIE direkt (Rules deny-all), sondern ueber die Konto-Functions mit
// dem ID-Token aus `clientAuth()`.
export const db: Firestore = getFirestore(firebaseApp);

let authInstanz: Auth | undefined;

/**
 * `getAuth()` validiert die Firebase-Konfiguration (u.a. `apiKey`) sofort beim
 * ersten Aufruf. Als Modul-Top-Level-Konstante wirft das ueberall, wo diese
 * Konfiguration fehlt - z.B. in Tests/CI ohne `.env.local` und beim
 * Next-Build, der Client-Module fuers Prerendering auswertet. Deshalb hier
 * memoized erst bei tatsaechlicher Nutzung (Formular-Submit, Auth-Listener).
 */
export function clientAuth(): Auth {
  if (!authInstanz) {
    authInstanz = getAuth(firebaseApp);
    // Bestaetigungs- und Passwort-Mails von Firebase sonst auf Englisch
    // (Projekt-Standard `en`).
    authInstanz.languageCode = 'de';
  }
  return authInstanz;
}
