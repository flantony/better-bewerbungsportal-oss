import PageContainer from '@/components/layout/page-container';
import { OverviewContent } from '@/features/overview/components/overview-content';

export const metadata = {
  title: 'Übersicht'
};

export default function Page() {
  return (
    <PageContainer>
      <OverviewContent />
    </PageContainer>
  );
}
