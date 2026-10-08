import { describe, expect, it } from 'vitest';
import { inBloecken } from './bloecke';

// WOZU: Firestore-`in` nimmt hoechstens 30 Werte. Eine Merkliste mit 31
// Stellen darf nicht still bei 30 aufhoeren.
describe('inBloecken', () => {
  it('teilt 61 Eintraege in 30, 30, 1', () => {
    const bloecke = inBloecken(Array.from({ length: 61 }, (_, i) => i), 30);
    expect(bloecke.map((b) => b.length)).toEqual([30, 30, 1]);
  });
  it('gibt fuer eine leere Liste keine Bloecke', () => {
    expect(inBloecken([], 30)).toEqual([]);
  });
});
