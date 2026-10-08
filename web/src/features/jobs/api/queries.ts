import { queryOptions } from '@tanstack/react-query';
import { getAllActiveJobs, getUpcomingDeadlineJobs } from './service';

export type { Job } from './types';

export const jobKeys = {
  all: ['jobs'] as const,
  list: () => [...jobKeys.all, 'list'] as const,
  upcomingDeadline: (days: number) => [...jobKeys.all, 'upcoming-deadline', days] as const
};

/**
 * Alle aktiven Jobs für "Alle Stellenangebote" - langer `staleTime`, da der
 * Bestand nur einmal täglich per Sync aktualisiert wird (s. service.ts).
 */
export const jobsQueryOptions = () =>
  queryOptions({
    queryKey: jobKeys.list(),
    queryFn: () => getAllActiveJobs(),
    staleTime: 10 * 60 * 1000
  });

/** Last Chance: Jobs mit Bewerbungsschluss innerhalb der nächsten `days` Tage. */
export const upcomingDeadlineJobsQueryOptions = (days: number) =>
  queryOptions({
    queryKey: jobKeys.upcomingDeadline(days),
    queryFn: () => getUpcomingDeadlineJobs(days)
  });
