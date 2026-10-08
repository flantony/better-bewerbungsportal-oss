'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import {
  MULTI_SELECT_FACETS,
  createDefaultFilterState,
  getFacetOptionLabel,
  toggleFacetValue,
  type JobFilterState,
  type MultiSelectFacet
} from '../lib/job-filters';

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

function buildChips(
  state: JobFilterState,
  onChange: (updater: (prev: JobFilterState) => JobFilterState) => void,
  onToggleFacet: (facet: MultiSelectFacet, value: string) => void
): Chip[] {
  const chips: Chip[] = [];

  if (state.search.trim()) {
    chips.push({
      key: 'search',
      label: `"${state.search.trim()}"`,
      onRemove: () => onChange((prev) => ({ ...prev, search: '' }))
    });
  }

  if (state.ort.trim()) {
    chips.push({
      key: 'ort',
      label: state.radiusKm ? `${state.ort.trim()} (Umkreis ${state.radiusKm} km)` : state.ort.trim(),
      onRemove: () => onChange((prev) => ({ ...prev, ort: '', radiusKm: null }))
    });
  }

  for (const facet of MULTI_SELECT_FACETS) {
    for (const value of state[facet]) {
      chips.push({
        key: `${facet}:${value}`,
        label: getFacetOptionLabel(facet, value),
        onRemove: () => onToggleFacet(facet, value)
      });
    }
  }

  // Abgelaufene Fristen sind voreingestellt ausgeblendet - ein Chip erscheint
  // nur, wenn jemand sie wieder einblendet.
  if (!state.hideExpired) {
    chips.push({
      key: 'hideExpired',
      label: 'Mit abgelaufenen Fristen',
      onRemove: () => onChange((prev) => ({ ...prev, hideExpired: true }))
    });
  }
  if (state.onlyHot) {
    chips.push({
      key: 'onlyHot',
      label: 'Nur besonders gesuchte',
      onRemove: () => onChange((prev) => ({ ...prev, onlyHot: false }))
    });
  }

  return chips;
}

export function JobsActiveFilterChips({
  state,
  onChange
}: {
  state: JobFilterState;
  onChange: (updater: (prev: JobFilterState) => JobFilterState) => void;
}) {
  const onToggleFacet = (facet: MultiSelectFacet, value: string) =>
    onChange((prev) => toggleFacetValue(prev, facet, value));

  const chips = buildChips(state, onChange, onToggleFacet);

  if (chips.length === 0) return null;

  return (
    <div className='flex flex-wrap items-center gap-2'>
      {chips.map((chip) => (
        <Badge key={chip.key} variant='secondary' className='gap-1 pr-1'>
          {chip.label}
          <button
            type='button'
            onClick={chip.onRemove}
            aria-label={`Filter "${chip.label}" entfernen`}
            className='hover:bg-muted-foreground/20 -my-1 inline-flex size-6 items-center justify-center rounded-full'
          >
            <Icons.close className='size-3' aria-hidden='true' />
          </button>
        </Badge>
      ))}
      <Button variant='ghost' size='sm' className='h-7 text-xs' onClick={() => onChange(() => createDefaultFilterState())}>
        Alle zurücksetzen
      </Button>
    </div>
  );
}
