// ============================================================
// Glossary Service — Data Access Layer
// ============================================================
// Liest direkt aus Firestore (Client-SDK), befüllt durch ein einmaliges
// Dev-Skript. Die Job-Volltexte sind bereits beim Sync mit
// `data-glossary-term`-Spans annotiert (s.
// functions/src/lib/glossaryAnnotate.ts) - hier wird nur noch slug ->
// definition aufgelöst, kein eigenes Text-Scanning im Client.
// ============================================================

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { GlossaryTerm } from './types';

export async function getGlossary(): Promise<GlossaryTerm[]> {
  const snapshot = await getDocs(collection(db, 'glossary'));
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      slug: doc.id,
      term: data.term,
      definition: data.definition,
      aliases: data.aliases ?? []
    } satisfies GlossaryTerm;
  });
}
