import { describe, expect, it } from 'vitest';
import { EYEBROW_CLASSNAME } from './eyebrow';

describe('EYEBROW_CLASSNAME', () => {
  it('is uppercase, accent-colored, and small', () => {
    expect(EYEBROW_CLASSNAME).toContain('uppercase');
    expect(EYEBROW_CLASSNAME).toContain('text-brand');
    expect(EYEBROW_CLASSNAME).toContain('text-[13px]');
  });
});
