import { describe, expect, it } from 'vitest';
import { abrufbareUrl } from './abrufbare-url';

describe('abrufbareUrl', () => {
  it('setzt die alte GCS-Adresse auf die Firebase-Download-URL um', () => {
    expect(
      abrufbareUrl(
        'https://storage.googleapis.com/better-bewerbungsportal.firebasestorage.app/jobDocuments/fdecdd42d88cd078414c8b01.pdf'
      )
    ).toBe(
      'https://firebasestorage.googleapis.com/v0/b/better-bewerbungsportal.firebasestorage.app/o/jobDocuments%2Ffdecdd42d88cd078414c8b01.pdf?alt=media'
    );
  });

  it('lässt andere Adressen unverändert', () => {
    expect(abrufbareUrl('')).toBe('');
    expect(abrufbareUrl('https://example.com/a.pdf')).toBe('https://example.com/a.pdf');
  });
});
