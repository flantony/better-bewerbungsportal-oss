'use client';

import type { MouseEvent } from 'react';
import { INHALT_ID } from './inhalt-id';

/**
 * Erster fokussierbarer Punkt jeder Seite: springt an Seitenleiste und Kopf
 * vorbei in den Hauptinhalt (WCAG 2.4.1) - ohne ihn liegen Dutzende Tab-Stopps
 * vor dem ersten Suchtreffer. Ziel ist `#inhalt`, sonst das erste `<main>` -
 * nicht jede Seite setzt die id, aber jede hat genau ein `<main>`.
 */
function handleClick(event: MouseEvent<HTMLAnchorElement>) {
  const ziel = document.getElementById(INHALT_ID) ?? document.querySelector('main');
  if (!ziel) return;
  event.preventDefault();
  if (!ziel.hasAttribute('tabindex')) ziel.setAttribute('tabindex', '-1');
  ziel.focus();
  ziel.scrollIntoView?.({ block: 'start' });
}

export function SkipLink() {
  return (
    <a
      href={`#${INHALT_ID}`}
      onClick={handleClick}
      className='bg-background text-foreground fixed top-2 left-2 z-[100] -translate-y-24 rounded-md border px-4 py-2 text-sm font-medium shadow-md transition-transform focus:translate-y-0'
    >
      Zum Inhalt springen
    </a>
  );
}
