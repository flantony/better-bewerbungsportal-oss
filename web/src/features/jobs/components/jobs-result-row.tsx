import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { fristAnzeige } from '../lib/frist-anzeige';
import { HOT_JOB_ERKLAERUNG, HOT_JOB_LABEL } from '../lib/hot-job';
import type { Job } from '../api/types';
import { TaetigkeitsbereichBadge } from './taetigkeitsbereich-badge';

function FristBadge({ job }: { job: Job }) {
  const frist = fristAnzeige(job);
  switch (frist.art) {
    case 'abgelaufen':
      return (
        <Badge variant='outline' className='text-muted-foreground'>
          Bewerbungsfrist abgelaufen
        </Badge>
      );
    case 'bald':
      return <Badge variant='destructive'>{frist.text}</Badge>;
    case 'offen':
      return <Badge variant='outline'>{frist.text}</Badge>;
    case 'ohne':
      // Ohne Datum weiss die Liste nicht, ob "jederzeit" oder "nicht genannt" -
      // das steht nur im Volltext, den die Liste nicht laedt (s.
      // lib/bewerbungsschluss.ts). "offen" las sich wie "keine Frist".
      return <span className='text-muted-foreground text-xs'>Frist: siehe Stelle</span>;
  }
}

export function JobsResultRow({ job }: { job: Job }) {
  return (
    <Link
      href={`/dashboard/jobs/${job.pinstGuid}`}
      className='hover:bg-accent flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4'
    >
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          {/* Umbrechen statt abschneiden: bei 320 px oder Zoom war sonst jeder dritte Titel "Ausbild…". */}
          <h3 className='font-medium break-words hyphens-auto'>{job.title}</h3>
          {job.hotJob && (
            <Badge variant='brand' className='shrink-0' title={HOT_JOB_ERKLAERUNG}>
              {HOT_JOB_LABEL}
            </Badge>
          )}
        </div>
        <p className='text-muted-foreground mt-1 text-xs break-words'>{job.besOrt || '—'}</p>
      </div>
      <div className='flex shrink-0 flex-wrap items-center gap-2'>
        <TaetigkeitsbereichBadge reqIndustry={job.reqIndustry} />
        {job.contractTypeLabel?.trim() && <Badge variant='outline'>{job.contractTypeLabel}</Badge>}
        <FristBadge job={job} />
      </div>
    </Link>
  );
}
