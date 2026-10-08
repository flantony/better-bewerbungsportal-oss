import { NavGroup } from '@/types';

/**
 * Navigation configuration
 *
 * This configuration is used for both the sidebar navigation and Cmd+K bar.
 * Items are organized into groups, each rendered with a SidebarGroupLabel.
 * Items marked `nurAngemeldet` send guests to the sign-in first (see hooks/use-nav.ts).
 */
export const navGroups: NavGroup[] = [
  {
    label: 'Übersicht',
    items: [
      {
        title: 'Übersicht',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['d', 'd'],
        items: []
      },
      {
        title: 'Stellenangebote',
        url: '/dashboard/jobs',
        icon: 'jobs',
        shortcut: ['j', 'j'],
        isActive: false,
        items: []
      },
      {
        title: 'Mit deiner KI bewerben',
        url: '/dashboard/ki',
        icon: 'plug',
        shortcut: ['k', 'i'],
        isActive: false,
        items: []
      }
    ]
  },
  {
    label: 'Mein Bereich',
    items: [
      {
        title: 'Mein Konto',
        url: '/dashboard/konto',
        nurAngemeldet: true,
        icon: 'user',
        shortcut: ['m', 'k'],
        isActive: false,
        items: []
      },
      {
        title: 'Merkliste',
        url: '/dashboard/merkliste',
        nurAngemeldet: true,
        icon: 'bookmark',
        shortcut: ['m', 'l'],
        isActive: false,
        items: []
      }
    ]
  }
];
