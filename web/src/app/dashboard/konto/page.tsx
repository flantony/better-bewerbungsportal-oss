import PageContainer from '@/components/layout/page-container';
import { KontoGuard } from '@/features/auth/components/konto-guard';
import { KontoSeite } from '@/features/konto/components/konto-seite';

export const metadata = { title: 'Mein Konto', robots: { index: false } };

export default function Page() {
  return (
    <PageContainer pageTitle='Mein Konto' pageDescription='Suchfilter, Benachrichtigungen und was wir über dich gespeichert haben.'>
      <KontoGuard>
        <KontoSeite />
      </KontoGuard>
    </PageContainer>
  );
}
