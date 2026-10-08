import 'server-only';

import { type App, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Auf App Hosting/Cloud Run übernimmt initializeApp() automatisch die
// Runtime-Service-Identity (Application Default Credentials) - kein Key-File.
const adminApp: App = getApps()[0] ?? initializeApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
