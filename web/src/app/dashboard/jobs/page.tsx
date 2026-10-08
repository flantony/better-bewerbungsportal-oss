import PageContainer from '@/components/layout/page-container';
import JobListingPage from '@/features/jobs/components/job-listing';

export const metadata = {
  title: 'Stellenangebote'
};

export default function Page() {
  return (
    <PageContainer
      pageTitle='Stellenangebote'
      pageDescription='Offene Ausschreibungen der Bundeswehr, jede Nacht aktualisiert.'
    >
      <JobListingPage />
    </PageContainer>
  );
}
