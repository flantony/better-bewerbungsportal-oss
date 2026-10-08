import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button';
import { badgeVariants } from './badge';

describe('brand variant', () => {
  it('buttonVariants brand includes bg-brand and text-brand-foreground', () => {
    const className = buttonVariants({ variant: 'brand' });
    expect(className).toContain('bg-brand');
    expect(className).toContain('text-brand-foreground');
  });

  it('badgeVariants brand includes bg-brand and text-brand-foreground', () => {
    const className = badgeVariants({ variant: 'brand' });
    expect(className).toContain('bg-brand');
    expect(className).toContain('text-brand-foreground');
  });

  it('badgeVariants destructive (Hot badge path) is unaffected and still uses bg-destructive', () => {
    const className = badgeVariants({ variant: 'destructive' });
    expect(className).toContain('bg-destructive');
    expect(className).not.toContain('bg-brand');
  });
});
