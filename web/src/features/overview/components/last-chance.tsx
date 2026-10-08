'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { upcomingDeadlineJobsQueryOptions } from '@/features/jobs/api/queries';
import { TaetigkeitsbereichBadge } from '@/features/jobs/components/taetigkeitsbereich-badge';

const LAST_CHANCE_DAYS = 3;

export function LastChance() {
  const { data } = useQuery(upcomingDeadlineJobsQueryOptions(LAST_CHANCE_DAYS));

  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last Chance</CardTitle>
        <CardDescription>Bewerbungsschluss in weniger als {LAST_CHANCE_DAYS} Tagen.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-2'>
        {data.map((job) => (
          <Link
            key={job.pinstGuid}
            href={`/dashboard/jobs/${job.pinstGuid}`}
            className='hover:bg-accent flex flex-col gap-1 rounded-md border p-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2'
          >
            <span className='min-w-0 w-full truncate font-medium sm:w-auto'>{job.title}</span>
            <div className='flex shrink-0 items-center gap-2'>
              <span className='text-muted-foreground truncate'>{job.besOrt || '—'}</span>
              <TaetigkeitsbereichBadge reqIndustry={job.reqIndustry} className='shrink-0' />
              <Badge variant='destructive' className='shrink-0'>
                bis {job.applicationEnd}
              </Badge>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
