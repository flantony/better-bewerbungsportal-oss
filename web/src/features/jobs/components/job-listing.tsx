import { JobsBrowser } from './jobs-table';

// Kein Server-Prefetch/HydrationBoundary hier (anders als bei den übrigen
// Feature-Listings) - die Stellenliste lädt rein client-seitig, siehe
// Kommentar in api/service.ts.
export default function JobListingPage() {
  return <JobsBrowser />;
}
