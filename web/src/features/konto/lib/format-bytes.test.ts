import { describe, expect, it } from 'vitest';
import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
  it('zeigt kleine Groessen in KB', () => {
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('zeigt grosse Groessen in MB mit einer Nachkommastelle', () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});
