import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google';

import { cn } from '@/lib/utils';

// Better Bewerbungsportal fährt ein einziges Theme (vercel.css) - nur die
// dort tatsächlich referenzierten Google Fonts werden geladen (s. theme.config.ts).
const fontSans = Geist({
  subsets: ['latin'],
  variable: '--font-sans'
});

const fontMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono'
});

const fontSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  fallback: ['Georgia', 'serif']
});

export const fontVariables = cn(fontSans.variable, fontMono.variable, fontSerif.variable);
