// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';

afterEach(cleanup);

describe('Button', () => {
  // Ein natives `disabled` waehrend des Ladens nimmt dem gerade gedrueckten
  // Knopf den Fokus - der faellt auf <body>.
  it('bleibt beim Laden fokussierbar und ist nur per aria-disabled gesperrt', () => {
    render(<Button isLoading>Speichern</Button>);
    const knopf = screen.getByRole('button');
    expect(knopf.hasAttribute('disabled')).toBe(false);
    expect(knopf.getAttribute('aria-disabled')).toBe('true');
  });

  it('löst beim Laden weder onClick noch ein Absenden aus', () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type='submit' isLoading onClick={onClick}>
          Speichern
        </Button>
      </form>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sperrt ohne Laden weiter nativ', () => {
    render(
      <Button isLoading={false} disabled>
        Speichern
      </Button>
    );
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });
});
