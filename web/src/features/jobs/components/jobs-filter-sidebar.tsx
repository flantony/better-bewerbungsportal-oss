'use client';

import { useMemo, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { slugifyId } from '@/lib/dom-id';
import { EYEBROW_CLASSNAME } from '@/lib/eyebrow';
import { cn } from '@/lib/utils';
import type { Job } from '../api/types';
import { HOT_JOB_FILTER_ERKLAERUNG } from '../lib/hot-job';
import {
  applyFilters,
  computeFacetCounts,
  countExpired,
  getAllFacetOptionValues,
  getFacetOptionLabel,
  type JobFilterState,
  type MultiSelectFacet
} from '../lib/job-filters';

const PROGRESSIVE_DISCLOSURE_LIMIT = 6;
const RADIUS_OPTIONS_KM = [25, 50, 100, 200];
// Reihenfolge als Array: in einem Objekt stuenden die Zahlen-Schluessel ('25', ...)
// vor 'exact', und die Voreinstellung 'Nur genauer Ort' rutschte ans Ende.
const UMKREIS_OPTIONEN: { value: string; label: string }[] = [
  { value: 'exact', label: 'Nur genauer Ort' },
  ...RADIUS_OPTIONS_KM.map((km) => ({ value: String(km), label: `Umkreis ${km} km` }))
];
const UMKREIS_LABELS: Record<string, string> = Object.fromEntries(
  UMKREIS_OPTIONEN.map(({ value, label }) => [value, label])
);

// Keine Beträge - die stehen in den amtlichen Tabellen und ändern sich; hier
// nur, was die Kürzel überhaupt bedeuten.
const BESOLDUNG_HINWEIS =
  'A = Besoldung für Beamtinnen, Beamte, Soldatinnen und Soldaten. E = Entgelt für Tarifbeschäftigte. Innerhalb von A oder E gilt: höhere Zahl, höheres Gehalt.';

const FACET_GROUPS: { facet: MultiSelectFacet; title: string; hinweis?: string }[] = [
  { facet: 'reqIndustry', title: 'Bereich' },
  { facet: 'artDerStelle', title: 'Art der Stelle' },
  { facet: 'contractTypeLabel', title: 'Vertragsart' },
  { facet: 'beschaeftigungsumfang', title: 'Beschäftigungsumfang' },
  { facet: 'tarifgruppe', title: 'Besoldung / Entgelt', hinweis: BESOLDUNG_HINWEIS }
];

function FacetCheckboxGroup({
  facet,
  title,
  hinweis,
  jobs,
  state,
  onToggle
}: {
  facet: MultiSelectFacet;
  title: string;
  hinweis?: string;
  jobs: Job[];
  state: JobFilterState;
  onToggle: (facet: MultiSelectFacet, value: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const allValues = useMemo(() => getAllFacetOptionValues(jobs, facet), [jobs, facet]);
  const counts = useMemo(() => computeFacetCounts(jobs, state, facet), [jobs, state, facet]);
  const selected = state[facet] as Set<string>;

  if (allValues.length === 0) return null;

  const visibleValues = showAll ? allValues : allValues.slice(0, PROGRESSIVE_DISCLOSURE_LIMIT);
  const hiddenCount = allValues.length - PROGRESSIVE_DISCLOSURE_LIMIT;

  return (
    <AccordionItem value={facet}>
      <AccordionTrigger className={EYEBROW_CLASSNAME}>{title}</AccordionTrigger>
      <AccordionContent>
        {hinweis && (
          <p id={`${facet}-hinweis`} className='text-muted-foreground mb-2 text-xs leading-relaxed'>
            {hinweis}
          </p>
        )}
        <div role='group' aria-label={title} aria-describedby={hinweis ? `${facet}-hinweis` : undefined}>
          {visibleValues.map((value, index) => {
            const count = counts.get(value) ?? 0;
            const isSelected = selected.has(value);
            const isDisabled = count === 0 && !isSelected;
            const id = `${facet}-${slugifyId(value, index)}`;
            return (
              <Label
                key={value}
                htmlFor={id}
                // Die ganze Zeile ist Klickfläche; die Mindesthöhe hält die
                // Checkboxen weit genug auseinander (WCAG 2.5.8, 24 px).
                className={cn(
                  'flex min-h-11 items-center justify-between gap-2 py-1 font-normal md:min-h-8',
                  isDisabled ? 'text-muted-foreground opacity-50' : 'cursor-pointer'
                )}
              >
                <span className='flex min-w-0 items-center gap-2 leading-snug'>
                  <Checkbox
                    id={id}
                    checked={isSelected}
                    disabled={isDisabled}
                    onCheckedChange={() => onToggle(facet, value)}
                  />
                  <span className='break-words'>{getFacetOptionLabel(facet, value)}</span>
                </span>
                <span className='text-muted-foreground shrink-0 text-xs'>
                  {count}
                  <span className='sr-only'> {count === 1 ? 'Stelle' : 'Stellen'}</span>
                </span>
              </Label>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type='button'
              onClick={() => setShowAll((s) => !s)}
              className='text-primary mt-1 min-h-8 text-xs underline-offset-4 hover:underline'
            >
              {showAll ? 'Weniger anzeigen' : `${hiddenCount} weitere anzeigen`}
            </button>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function JobsFilterSidebar({
  jobs,
  state,
  onToggleFacet,
  onChange
}: {
  jobs: Job[];
  state: JobFilterState;
  onToggleFacet: (facet: MultiSelectFacet, value: string) => void;
  onChange: (updater: (prev: JobFilterState) => JobFilterState) => void;
}) {
  const expiredCount = useMemo(
    () => countExpired(applyFilters(jobs, { ...state, hideExpired: false })),
    [jobs, state]
  );

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='jobs-ort'>Ort + Umkreis</Label>
        <Input
          id='jobs-ort'
          placeholder='Stadt eingeben…'
          value={state.ort}
          onChange={(e) => onChange((prev) => ({ ...prev, ort: e.target.value, radiusKm: null }))}
        />
        {state.ort.trim() && (
          <Select
            items={UMKREIS_LABELS}
            value={state.radiusKm === null ? 'exact' : String(state.radiusKm)}
            onValueChange={(value) =>
              onChange((prev) => ({ ...prev, radiusKm: value === 'exact' ? null : Number(value) }))
            }
          >
            <SelectTrigger className='w-full' aria-label='Umkreis'>
              <SelectValue placeholder='Umkreis' />
            </SelectTrigger>
            <SelectContent>
              {UMKREIS_OPTIONEN.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Accordion defaultValue={FACET_GROUPS.map((g) => g.facet)}>
        {FACET_GROUPS.map(({ facet, title, hinweis }) => (
          <FacetCheckboxGroup
            key={facet}
            facet={facet}
            title={title}
            hinweis={hinweis}
            jobs={jobs}
            state={state}
            onToggle={onToggleFacet}
          />
        ))}
      </Accordion>

      <div className='space-y-3 border-t pt-4'>
        <div className='flex items-center justify-between gap-2'>
          <Label htmlFor='hide-expired' className='font-normal leading-snug'>
            Abgelaufene Fristen ausblenden
            {expiredCount > 0 && <span className='text-muted-foreground'>({expiredCount})</span>}
          </Label>
          <Switch
            id='hide-expired'
            checked={state.hideExpired}
            onCheckedChange={(checked) => onChange((prev) => ({ ...prev, hideExpired: Boolean(checked) }))}
          />
        </div>
        <div className='flex items-center justify-between gap-2'>
          <div className='space-y-1'>
            <Label htmlFor='only-hot' className='font-normal leading-snug'>
              Nur besonders gesuchte Stellen
            </Label>
            <p id='only-hot-hinweis' className='text-muted-foreground text-xs leading-snug'>
              {HOT_JOB_FILTER_ERKLAERUNG}
            </p>
          </div>
          <Switch
            id='only-hot'
            aria-describedby='only-hot-hinweis'
            checked={state.onlyHot}
            onCheckedChange={(checked) => onChange((prev) => ({ ...prev, onlyHot: Boolean(checked) }))}
          />
        </div>
      </div>
    </div>
  );
}
