'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { beschrifteBreadcrumbSegment } from '@/lib/pfad-segment';

type BreadcrumbItem = {
  title: string;
  link: string;
};

// This allows to add custom title as well
const routeMapping: Record<string, BreadcrumbItem[]> = {
  '/dashboard': [{ title: 'Übersicht', link: '/dashboard' }],
  // /dashboard leitet auf /overview um - zweimal "Übersicht" hintereinander waere nur Rauschen.
  '/dashboard/overview': [{ title: 'Übersicht', link: '/dashboard/overview' }],
  '/dashboard/employee': [
    { title: 'Dashboard', link: '/dashboard' },
    { title: 'Employee', link: '/dashboard/employee' }
  ],
  '/dashboard/product': [
    { title: 'Dashboard', link: '/dashboard' },
    { title: 'Product', link: '/dashboard/product' }
  ]
  // Add more custom mappings as needed
};

export function useBreadcrumbs() {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    // Check if we have a custom mapping for this exact path
    if (routeMapping[pathname]) {
      return routeMapping[pathname];
    }

    // If no exact match, fall back to generating breadcrumbs from the path
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      return {
        title: beschrifteBreadcrumbSegment(segment, segments[index - 1]),
        link: path
      };
    });
  }, [pathname]);

  return breadcrumbs;
}
