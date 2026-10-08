import { describe, expect, it } from 'vitest';
import { parseGermanDate } from './format';

describe('parseGermanDate', () => {
  it('parses a valid DD.MM.YYYY date', () => {
    const date = parseGermanDate('05.03.2026');
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2); // 0-indiziert -> März
    expect(date?.getDate()).toBe(5);
  });

  it('returns null for an empty string', () => {
    expect(parseGermanDate('')).toBeNull();
  });

  it('returns null for an ISO-formatted date (wrong format)', () => {
    expect(parseGermanDate('2026-03-05')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseGermanDate('not a date')).toBeNull();
    expect(parseGermanDate('5.3.2026')).toBeNull(); // fehlende führende Nullen
  });
});
