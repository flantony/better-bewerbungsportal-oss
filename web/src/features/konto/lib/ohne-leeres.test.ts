import { describe, expect, it } from 'vitest';
import { ohneLeeres } from './ohne-leeres';

// WOZU: Ein leeres Array ist in queryJobs kein "egal", sondern je nach Feld
// ein Filter auf nichts - der Nutzer bekaeme nie eine Mail.
describe('ohneLeeres', () => {
  it('wirft leere Listen und leere Texte weg, behaelt den Rest', () => {
    expect(ohneLeeres({ bundesland: [], wunschort: '', vertragsarten: ['Reservedienst'] })).toEqual({
      vertragsarten: ['Reservedienst']
    });
  });
});
