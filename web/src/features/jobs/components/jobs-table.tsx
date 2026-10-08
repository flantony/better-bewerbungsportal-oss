'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseAsString, useQueryState } from 'nuqs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Icons } from '@/components/icons';
import { jobsQueryOptions, type Job } from '../api/queries';
import {
  applyFilters,
  countActiveFilters,
  createDefaultFilterState,
  toggleFacetValue,
  type JobFilterState,
  type MultiSelectFacet
} from '../lib/job-filters';
import { JobsActiveFilterChips } from './jobs-active-filter-chips';
import { JobsFilterSidebar } from './jobs-filter-sidebar';
import { JobsResultRow } from './jobs-result-row';

type SortOption = 'relevanz' | 'bewerbungsschluss' | 'titel';

const SORT_LABELS: Record<SortOption, string> = {
  relevanz: 'Zuletzt aktualisiert',
  bewerbungsschluss: 'Bewerbungsschluss (bald zuerst)',
  titel: 'Titel (A–Z)'
};

const SORT_OPTIONS = Object.keys(SORT_LABELS) as SortOption[];

// Jobs kommen bereits nach `lastSeenAt` absteigend aus Firestore (s. service.ts)
// - "Zuletzt aktualisiert" braucht daher keine eigene Neusortierung.
function sortJobs(jobs: Job[], sort: SortOption): Job[] {
  if (sort === 'relevanz') return jobs;
  const sorted = [...jobs];
  if (sort === 'bewerbungsschluss') {
    sorted.sort((a, b) => a.applicationEndSortKey - b.applicationEndSortKey);
  } else if (sort === 'titel') {
    sorted.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  }
  return sorted;
}

const RESULTS_PAGE_SIZE = 30;

function JobsBrowserSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]'>
      <Skeleton className='hidden h-[32rem] w-full md:block' />
      <div className='space-y-3'>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    </div>
  );
}

function formatTrefferzahl(anzahl: number): string {
  return `${anzahl.toLocaleString('de-DE')} ${anzahl === 1 ? 'Stelle' : 'Stellen'}`;
}

export function JobsBrowser() {
  const { data, isLoading, isError } = useQuery(jobsQueryOptions());
  const jobs = useMemo(() => data ?? [], [data]);

  // Der Suchbegriff steht in der URL (?suche=), damit Neuladen, Zurück und
  // geteilte Links ihn behalten; die übrigen Filter bleiben Seitenzustand.
  // Bewusst kein searchParamsCache (lib/searchparams.ts): die Liste laedt rein
  // clientseitig, es gibt keinen Server-Prefetch, der den Parameter braeuchte.
  const [suche, setSuche] = useQueryState('suche', parseAsString.withDefault('').withOptions({ throttleMs: 300 }));
  const [filter, setFilter] = useState<JobFilterState>(createDefaultFilterState);
  const state = useMemo<JobFilterState>(() => ({ ...filter, search: suche }), [filter, suche]);
  // Immer der neueste Stand, auch zwischen zwei Updates im selben Tick (z. B.
  // Facette plus Schalter) - sonst rechnete das zweite vom veralteten `state`.
  const stateRef = useRef(state);
  stateRef.current = state;
  const setState = useCallback(
    (updater: (prev: JobFilterState) => JobFilterState) => {
      const vorher = stateRef.current;
      const next = updater(vorher);
      stateRef.current = next;
      setFilter(next);
      if (next.search !== vorher.search) void setSuche(next.search || null);
    },
    [setSuche]
  );
  const [sort, setSort] = useState<SortOption>('relevanz');
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);

  const filtered = useMemo(() => applyFilters(jobs, state), [jobs, state]);
  const sorted = useMemo(() => sortJobs(filtered, sort), [filtered, sort]);

  // Standard-Verhalten für gefilterte Ergebnislisten: sobald sich Filter oder
  // Sortierung ändern, zurück auf die erste "Seite" der inkrementell
  // gerenderten Ergebnisse (sonst könnte visibleCount größer sein als die
  // neue, kleinere Trefferzahl - harmlos hier, aber inkonsistent mit der
  // Erwartung "neue Filterung startet oben").
  useEffect(() => {
    setVisibleCount(RESULTS_PAGE_SIZE);
  }, [state, sort]);

  if (isLoading) {
    return <JobsBrowserSkeleton />;
  }

  if (isError) {
    return (
      <p className='text-destructive text-sm'>
        Die Stellen ließen sich nicht laden. Lade die Seite bitte neu.
      </p>
    );
  }

  const onToggleFacet = (facet: MultiSelectFacet, value: string) =>
    setState((prev) => toggleFacetValue(prev, facet, value));

  const visible = sorted.slice(0, visibleCount);
  const activeFilterCount = countActiveFilters(state);

  return (
    <div className='space-y-4'>
      <div role='search' className='max-w-xl space-y-2'>
        <Label htmlFor='jobs-search'>Stellen suchen (Titel oder Ort)</Label>
        <Input
          id='jobs-search'
          type='search'
          placeholder='z. B. Elektroniker, Berlin…'
          value={suche}
          onChange={(e) => void setSuche(e.target.value || null)}
        />
      </div>

      <a
        href='#suchergebnisse'
        className='bg-background sr-only rounded-md border px-3 py-2 text-sm focus:not-sr-only focus:inline-block'
      >
        Filter überspringen, zu den Suchergebnissen
      </a>

      <div className='grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]'>
        <aside className='hidden md:block' aria-labelledby='filter-ueberschrift'>
          <div className='sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2'>
            <h2 id='filter-ueberschrift' className='sr-only'>
              Filter
            </h2>
            <JobsFilterSidebar jobs={jobs} state={state} onToggleFacet={onToggleFacet} onChange={setState} />
          </div>
        </aside>

        <section
          id='suchergebnisse'
          tabIndex={-1}
          aria-labelledby='suchergebnisse-ueberschrift'
          className='min-w-0 space-y-4 outline-none'
        >
          <h2 id='suchergebnisse-ueberschrift' className='sr-only'>
            Suchergebnisse
          </h2>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              <Sheet>
                <SheetTrigger
                  render={
                    <Button variant='outline' size='sm' className='md:hidden'>
                      <Icons.adjustments className='mr-2 h-4 w-4' />
                      Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </Button>
                  }
                />
                <SheetContent side='left' className='w-80 overflow-y-auto'>
                  <SheetHeader>
                    <SheetTitle>Filter</SheetTitle>
                  </SheetHeader>
                  <JobsFilterSidebar jobs={jobs} state={state} onToggleFacet={onToggleFacet} onChange={setState} />
                </SheetContent>
              </Sheet>
              {/* Live-Region: die Trefferzahl ändert sich bei jedem Filter, ohne dass der Fokus wandert (WCAG 4.1.3). */}
              <p role='status' className='text-muted-foreground text-sm'>
                {formatTrefferzahl(sorted.length)}
              </p>
            </div>

            <div className='flex items-center gap-2'>
              <span id='jobs-sortierung-label' className='text-muted-foreground text-sm'>
                Sortieren nach
              </span>
              <Select items={SORT_LABELS} value={sort} onValueChange={(value) => setSort(value as SortOption)}>
                <SelectTrigger
                  id='jobs-sortierung'
                  aria-labelledby='jobs-sortierung-label jobs-sortierung'
                  className='w-60'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {SORT_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <JobsActiveFilterChips state={state} onChange={setState} />

          {visible.length ? (
            <ul className='space-y-2'>
              {visible.map((job) => (
                <li key={job.pinstGuid}>
                  <JobsResultRow job={job} />
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-muted-foreground rounded-md border p-8 text-center text-sm'>
              Keine Stelle passt. Ändere die Suche oder die Filter, oder setz sie zurück.
            </p>
          )}

          {visibleCount < sorted.length && (
            <div className='flex justify-center'>
              <Button variant='outline' onClick={() => setVisibleCount((c) => c + RESULTS_PAGE_SIZE)}>
                Weitere Stellen anzeigen ({sorted.length - visibleCount} weitere)
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
