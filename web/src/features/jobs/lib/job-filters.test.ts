import { describe, expect, it } from 'vitest';
import type { Job } from '../api/types';
import {
  NONE_BUCKET,
  applyFilters,
  computeFacetCounts,
  countActiveFilters,
  countExpired,
  createDefaultFilterState,
  createEmptyFilterState,
  getFacetOptionLabel,
  getAllFacetOptionValues,
  getArtDerStelleGroup,
  getBeschaeftigungsumfang,
  haversineDistanceKm,
  isExpired,
  resolveOrtCenter,
  toggleFacetValue
} from './job-filters';

const DAY_MS = 24 * 60 * 60 * 1000;

function job(overrides: Partial<Job> = {}): Job {
  return {
    pinstGuid: 'guid-1',
    title: 'Anlagenmechanikerin / Anlagenmechaniker (m/w/d)',
    besOrt: 'Berlin',
    contractType: '',
    contractTypeLabel: 'unbefristet',
    applicationEnd: '01.09.2026',
    applicationEndSortKey: Date.now() + 30 * 24 * 60 * 60 * 1000,
    hotJob: false,
    reqIndustry: 2,
    reqType: 'K29',
    arbeitszeit: '100.00',
    besoldung: { von: 'E5', bis: 'E5', tabelle: 'E', vonStufe: 5, bisStufe: 5, quelle: 'ausschreibung' },
    latitude: '52.520008',
    longitude: '13.404954',
    ...overrides
  };
}

describe('applyFilters', () => {
  it('returns all jobs when no filter is active', () => {
    const jobs = [job(), job({ pinstGuid: 'guid-2', reqIndustry: 1 })];
    expect(applyFilters(jobs, createEmptyFilterState())).toHaveLength(2);
  });

  it('narrows by reqIndustry (militärisch/zivil)', () => {
    const jobs = [job({ pinstGuid: 'a', reqIndustry: 2 }), job({ pinstGuid: 'b', reqIndustry: 1 })];
    const state = createEmptyFilterState();
    state.reqIndustry.add('militaerisch');
    const result = applyFilters(jobs, state);
    expect(result.map((j) => j.pinstGuid)).toEqual(['b']);
  });

  it('narrows by free-text search across title and Ort', () => {
    const jobs = [
      job({ pinstGuid: 'a', title: 'Elektronikerin (m/w/d)', besOrt: 'Köln' }),
      job({ pinstGuid: 'b', title: 'Bürokraft (m/w/d)', besOrt: 'München' })
    ];
    const state = createEmptyFilterState();
    state.search = 'köln';
    expect(applyFilters(jobs, state).map((j) => j.pinstGuid)).toEqual(['a']);
  });

  // Per Teilstring faende "Sport" nur "Transport"-Stellen.
  it('matches search terms at word starts, not mid-word', () => {
    const jobs = [
      job({ pinstGuid: 'transport', title: 'Helferin / Helfer Lagerwirtschaft / Transport (m/w/d)' }),
      job({ pinstGuid: 'sport', title: 'Sportsoldatin / Sportsoldat (m/w/d)' })
    ];
    const state = createEmptyFilterState();
    state.search = 'Sport';
    expect(applyFilters(jobs, state).map((j) => j.pinstGuid)).toEqual(['sport']);
  });

  it('hides expired jobs only when hideExpired is set', () => {
    const jobs = [
      job({ pinstGuid: 'expired', applicationEndSortKey: Date.now() - 2 * DAY_MS }),
      job({ pinstGuid: 'open' })
    ];
    expect(applyFilters(jobs, createEmptyFilterState())).toHaveLength(2);

    const state = createEmptyFilterState();
    state.hideExpired = true;
    expect(applyFilters(jobs, state).map((j) => j.pinstGuid)).toEqual(['open']);
  });

  it('filters by Ort + Umkreis using Haversine distance', () => {
    const berlin = job({ pinstGuid: 'berlin', besOrt: 'Berlin', latitude: '52.520008', longitude: '13.404954' });
    // Potsdam ist ~25km von Berlin entfernt.
    const potsdam = job({ pinstGuid: 'potsdam', besOrt: 'Potsdam', latitude: '52.390569', longitude: '13.064473' });
    // München ist weit entfernt.
    const munich = job({ pinstGuid: 'munich', besOrt: 'München', latitude: '48.137154', longitude: '11.576124' });
    const jobs = [berlin, potsdam, munich];

    const state = createEmptyFilterState();
    state.ort = 'Berlin';
    state.radiusKm = 50;
    const result = applyFilters(jobs, state);
    expect(result.map((j) => j.pinstGuid).toSorted()).toEqual(['berlin', 'potsdam']);
  });
});

describe('computeFacetCounts', () => {
  it('excludes the facet itself so its own options keep their unfiltered counts', () => {
    const jobs = [
      job({ pinstGuid: 'a', reqIndustry: 2, reqType: 'K29' }),
      job({ pinstGuid: 'b', reqIndustry: 1, reqType: 'K80' }),
      job({ pinstGuid: 'c', reqIndustry: 1, reqType: 'K80' })
    ];
    const state = createEmptyFilterState();
    state.reqIndustry.add('zivil');

    // Die reqIndustry-Facette selbst soll trotzdem beide Optionen mit ihren
    // vollen (ungefilterten) Zählungen zeigen, nicht nur die aktive Auswahl.
    const reqIndustryCounts = computeFacetCounts(jobs, state, 'reqIndustry');
    expect(reqIndustryCounts.get('zivil')).toBe(1);
    expect(reqIndustryCounts.get('militaerisch')).toBe(2);

    // Eine ANDERE Facette (artDerStelle) muss dagegen die reqIndustry=zivil-Auswahl berücksichtigen.
    const artDerStelleCounts = computeFacetCounts(jobs, state, 'artDerStelle');
    expect(artDerStelleCounts.get('zivil')).toBe(1);
    expect(artDerStelleCounts.has('reserve')).toBe(false);
  });

  it('buckets jobs without a value under NONE_BUCKET', () => {
    const jobs = [job({ pinstGuid: 'a', contractTypeLabel: null }), job({ pinstGuid: 'b', contractTypeLabel: 'befristet' })];
    const counts = computeFacetCounts(jobs, createEmptyFilterState(), 'contractTypeLabel');
    expect(counts.get(NONE_BUCKET)).toBe(1);
    expect(counts.get('befristet')).toBe(1);
  });
});

describe('getAllFacetOptionValues', () => {
  it('excludes contractTypeLabel values that duplicate an Art-der-Stelle group', () => {
    const jobs = [
      job({ pinstGuid: 'a', reqType: 'K20', contractTypeLabel: 'Ausbildungsvertrag' }),
      job({ pinstGuid: 'b', reqType: 'K80', contractTypeLabel: 'Reservedienst' }),
      job({ pinstGuid: 'c', reqType: 'K25', contractTypeLabel: 'Stipendium' }),
      job({ pinstGuid: 'd', reqType: 'K29', contractTypeLabel: 'unbefristet' })
    ];
    const values = getAllFacetOptionValues(jobs, 'contractTypeLabel');
    expect(values).not.toContain('Ausbildungsvertrag');
    expect(values).not.toContain('Reservedienst');
    expect(values).not.toContain('Stipendium');
    expect(values).toContain('unbefristet');
  });

  it('keeps the same values in artDerStelle unaffected', () => {
    const jobs = [job({ reqType: 'K20' }), job({ reqType: 'K80' }), job({ reqType: 'K25' })];
    const values = getAllFacetOptionValues(jobs, 'artDerStelle');
    expect(values.toSorted()).toEqual(['ausbildung', 'praktikum', 'reserve'].toSorted());
  });
});

describe('isExpired / countExpired', () => {
  it('treats past applicationEndSortKey as expired and future as not', () => {
    expect(isExpired(job({ applicationEndSortKey: Date.now() - 2 * DAY_MS }))).toBe(true);
    expect(isExpired(job({ applicationEndSortKey: Date.now() + DAY_MS }))).toBe(false);
  });

  it('keeps the deadline day itself open', () => {
    // applicationEndSortKey ist Mitternacht ZU BEGINN des Stichtags - wer heute
    // Frist hat, kann sich bis 23:59 bewerben. Ein naives `sortKey < now` hat
    // solche Stellen einen ganzen Tag zu frueh als abgelaufen markiert.
    const heuteMitternacht = new Date();
    heuteMitternacht.setHours(0, 0, 0, 0);
    const stichtagHeute = job({ applicationEndSortKey: heuteMitternacht.getTime() });
    expect(isExpired(stichtagHeute, heuteMitternacht.getTime() + DAY_MS - 1)).toBe(false);
    expect(isExpired(stichtagHeute, heuteMitternacht.getTime() + DAY_MS)).toBe(true);
  });

  it('counts expired jobs in a list', () => {
    const jobs = [
      job({ pinstGuid: 'a', applicationEndSortKey: Date.now() - 2 * DAY_MS }),
      job({ pinstGuid: 'b', applicationEndSortKey: Date.now() - 2 * DAY_MS }),
      job({ pinstGuid: 'c', applicationEndSortKey: Date.now() + DAY_MS })
    ];
    expect(countExpired(jobs)).toBe(2);
  });
});

describe('getBeschaeftigungsumfang', () => {
  it('classifies >=100% as vollzeit and below as teilzeit', () => {
    expect(getBeschaeftigungsumfang(job({ arbeitszeit: '100.00' }))).toBe('vollzeit');
    expect(getBeschaeftigungsumfang(job({ arbeitszeit: '50.00' }))).toBe('teilzeit');
  });
});

describe('toggleFacetValue', () => {
  it('adds a value when not selected and returns a new state', () => {
    const state = createEmptyFilterState();
    const next = toggleFacetValue(state, 'reqIndustry', 'zivil');
    expect(next).not.toBe(state);
    expect(next.reqIndustry.has('zivil')).toBe(true);
    expect(state.reqIndustry.has('zivil')).toBe(false);
  });

  it('removes a value when already selected', () => {
    const state = createEmptyFilterState();
    state.reqIndustry.add('zivil');
    const next = toggleFacetValue(state, 'reqIndustry', 'zivil');
    expect(next.reqIndustry.has('zivil')).toBe(false);
  });
});

describe('getArtDerStelleGroup', () => {
  it('maps known reqType codes to their group', () => {
    expect(getArtDerStelleGroup('K20')).toBe('ausbildung');
    expect(getArtDerStelleGroup('K80')).toBe('reserve');
  });

  it('falls back to NONE_BUCKET for unknown codes', () => {
    expect(getArtDerStelleGroup('unknown')).toBe(NONE_BUCKET);
  });
});

describe('haversineDistanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceKm({ lat: 52.52, lng: 13.4 }, { lat: 52.52, lng: 13.4 })).toBeCloseTo(0, 5);
  });

  it('returns roughly the known distance between Berlin and Munich (~500km)', () => {
    const berlin = { lat: 52.520008, lng: 13.404954 };
    const munich = { lat: 48.137154, lng: 11.576124 };
    const distance = haversineDistanceKm(berlin, munich);
    expect(distance).toBeGreaterThan(480);
    expect(distance).toBeLessThan(520);
  });
});

describe('resolveOrtCenter', () => {
  it('averages coordinates of jobs matching the Ort query', () => {
    const jobs = [
      job({ pinstGuid: 'a', besOrt: 'Berlin', latitude: '52.0', longitude: '13.0' }),
      job({ pinstGuid: 'b', besOrt: 'Berlin-Spandau', latitude: '52.5', longitude: '13.2' }),
      job({ pinstGuid: 'c', besOrt: 'München', latitude: '48.0', longitude: '11.0' })
    ];
    const center = resolveOrtCenter(jobs, 'berlin');
    expect(center).not.toBeNull();
    expect(center?.lat).toBeCloseTo(52.25, 5);
    expect(center?.lng).toBeCloseTo(13.1, 5);
  });

  it('returns null when nothing matches', () => {
    expect(resolveOrtCenter([job({ besOrt: 'Berlin' })], 'Nirgendwo')).toBeNull();
  });
});

// Leere Strings duerfen nicht als eigene, unbeschriftete Option neben
// "Ohne Angabe" landen (eine Checkbox ohne Label, nur mit Trefferzahl).
describe('leere Facettenwerte', () => {
  it('fasst leere und fehlende Vertragsart unter einer "Ohne Angabe"-Option zusammen', () => {
    const jobs = [
      job({ pinstGuid: 'a', contractTypeLabel: null }),
      job({ pinstGuid: 'b', contractTypeLabel: '' }),
      job({ pinstGuid: 'c', contractTypeLabel: '  ' }),
      job({ pinstGuid: 'd', contractTypeLabel: 'befristet' })
    ];
    const values = getAllFacetOptionValues(jobs, 'contractTypeLabel');
    expect(values).toEqual([NONE_BUCKET, 'befristet']);
    expect(values.every((value) => getFacetOptionLabel('contractTypeLabel', value).trim() !== '')).toBe(true);
    expect(computeFacetCounts(jobs, createEmptyFilterState(), 'contractTypeLabel').get(NONE_BUCKET)).toBe(3);
  });

  it('findet beim Filtern auf "Ohne Angabe" auch Stellen mit leerer Vertragsart', () => {
    const jobs = [job({ pinstGuid: 'leer', contractTypeLabel: '' }), job({ pinstGuid: 'x', contractTypeLabel: 'befristet' })];
    const state = toggleFacetValue(createEmptyFilterState(), 'contractTypeLabel', NONE_BUCKET);
    expect(applyFilters(jobs, state).map((j) => j.pinstGuid)).toEqual(['leer']);
  });

  it('behandelt eine leere Besoldungsangabe wie keine Angabe', () => {
    const jobs = [
      job({ pinstGuid: 'a', besoldung: { von: '', bis: '', tabelle: 'A', vonStufe: 0, bisStufe: 0, quelle: 'ausschreibung' } }),
      job({ pinstGuid: 'b', besoldung: null })
    ];
    expect(getAllFacetOptionValues(jobs, 'tarifgruppe')).toEqual([NONE_BUCKET]);
  });
});

describe('Voreinstellung der Filter', () => {
  it('blendet abgelaufene Fristen von Anfang an aus', () => {
    expect(createDefaultFilterState().hideExpired).toBe(true);
  });

  it('zaehlt die Voreinstellung nicht als aktiven Filter, das Abweichen davon schon', () => {
    expect(countActiveFilters(createDefaultFilterState())).toBe(0);
    expect(countActiveFilters({ ...createDefaultFilterState(), hideExpired: false })).toBe(1);
  });
});
