/**
 * Firebase-Admin-Initialisierung für die lokalen Dev-/Einmal-Skripte.
 *
 * WARUM ZENTRAL: in der Cloud Function genügt `initializeApp()` - Projekt-ID
 * und Storage-Bucket kommen aus der Laufzeitumgebung. Lokal kommen sie das
 * NICHT, und ein fehlender Bucket fällt erst auf, wenn ein Skript das erste Mal
 * eine Datei schreibt - im schlimmsten Fall mit Datenverlust (hält eine
 * Migration den fehlgeschlagenen Upload für "keine Anhänge", löscht sie die
 * Rohliste).
 *
 * Deshalb: jedes Skript ruft `initDevApp()` statt `initializeApp({...})` und
 * bekommt die vollständige Konfiguration, ohne daran denken zu müssen.
 */
import { initializeApp } from "firebase-admin/app";

export const PROJECT_ID = "better-bewerbungsportal";
export const STORAGE_BUCKET = "better-bewerbungsportal.firebasestorage.app";

export function initDevApp(): void {
  initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
}
