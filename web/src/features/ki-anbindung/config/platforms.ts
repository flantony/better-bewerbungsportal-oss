// Anleitungen pro KI-Tool. Bewusst ein flaches Array statt einer Adapter-
// Abstraktion: es gibt genau ein Produkt, eine vierte Plattform ist ein
// Objekt mehr.
//
// Die Menüpfade der Anbieter ändern sich erfahrungsgemäß ohne Ankündigung.
//
// Nutzersichtbarer Text hier MUSS jargonfrei sein — kein „MCP", „Server",
// „Endpoint", „Transport", „JSON-RPC". Durchgesetzt von platforms.test.ts.

import { Icons } from '@/components/icons';

export type PlatformId = 'claude' | 'chatgpt' | 'andere';

export interface PlatformStep {
  title: string;
  detail: string;
  /** Zeigt das Adressfeld mit Kopier-Button unter diesem Schritt. */
  showsUrl?: boolean;
}

export interface PlatformGuide {
  id: PlatformId;
  label: string;
  icon: keyof typeof Icons;
  intro: string;
  /** Weiche Voraussetzung, z.B. Tarif-Einschränkungen. */
  requirement?: string;
  steps: PlatformStep[];
  /** Ehrlicher Hinweis auf Umstände, die wir nicht wegzaubern können. */
  note?: string;
}

export const PLATFORMS: PlatformGuide[] = [
  {
    id: 'claude',
    label: 'Claude',
    icon: 'sparkles',
    intro: 'Funktioniert im Browser, in der Desktop- und in der Handy-App.',
    requirement:
      'Falls du den Punkt „Connectors“ nicht findest, unterstützt dein Claude-Tarif eigene Verbindungen noch nicht.',
    steps: [
      {
        title: 'Claude öffnen und anmelden',
        detail: 'Im Browser unter claude.ai oder in der App.'
      },
      {
        title: 'Zu den Verbindungen wechseln',
        detail: 'Unten links auf deinen Namen klicken, dann „Einstellungen“ und dort „Connectors“.'
      },
      {
        title: 'Eigene Verbindung hinzufügen',
        detail: 'Auf „Eigenen Connector hinzufügen“ klicken.'
      },
      {
        title: 'Adresse einfügen und bestätigen',
        detail: 'Diese Adresse in das Feld einfügen und speichern:',
        showsUrl: true
      },
      {
        title: 'Fertig: Stell deine erste Frage',
        detail:
          'Zum Beispiel: „Such mir zivile Stellen bei der Bundeswehr in Köln und hilf mir beim Bewerbungsbogen.“'
      }
    ]
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    icon: 'chat',
    intro:
      'Die feste Verbindung geht bei ChatGPT nur mit einem bezahlten Tarif (etwa Plus) und mit eingeschaltetem Entwicklermodus.',
    note: 'Mit kostenlosem ChatGPT nimm den Link-Weg oben: Kopier den Text auf der Seite einer Stelle und füg ihn in den Chat ein. Den Entwicklermodus verlangt ChatGPT für jede eigene Verbindung. Geht das dort einmal einfacher, passen wir die Anleitung an.',
    steps: [
      {
        title: 'ChatGPT öffnen und anmelden',
        detail: 'Im Browser unter chatgpt.com oder in der App.'
      },
      {
        title: 'Entwicklermodus einschalten',
        detail:
          'In den Einstellungen unter „Connectors“ (teils „Apps & Connectors“) den Entwicklermodus aktivieren.'
      },
      {
        title: 'Eigene Verbindung hinzufügen',
        detail: 'Dort „Hinzufügen“ wählen und diese Adresse eintragen:',
        showsUrl: true
      },
      {
        title: 'Fertig: Stell deine erste Frage',
        detail:
          'Zum Beispiel: „Welche Bundeswehr-Stellen in Hamburg gibt es gerade und was brauche ich für die Bewerbung?“'
      }
    ]
  },
  {
    id: 'andere',
    label: 'Anderes KI-Tool',
    icon: 'plug',
    intro:
      'Viele KI-Tools können externe Dienste einbinden. Wenn deins das kann, funktioniert es hier genauso.',
    steps: [
      {
        title: 'Einstellungen deines KI-Tools öffnen',
        detail:
          'Such nach einem Punkt wie „Connectors“, „Integrationen“, „Erweiterungen“ oder „Verbindungen“.'
      },
      {
        title: 'Adresse eintragen',
        detail: 'Dort diese Adresse hinterlegen:',
        showsUrl: true
      },
      {
        title: 'Ausprobieren',
        detail:
          'Frag anschließend nach Bundeswehr-Stellen. Findet dein Tool die Funktionen nicht, unterstützt es diese Art von Verbindung vermutlich nicht.'
      }
    ]
  }
];
