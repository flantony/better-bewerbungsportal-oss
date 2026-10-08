import PageContainer from '@/components/layout/page-container';
import { KontoGuard } from '@/features/auth/components/konto-guard';
import { MerklisteSeite } from '@/features/konto/components/merkliste-seite';

export const metadata = { title: 'Merkliste', robots: { index: false } };

export default function Page() {
  return (
    <PageContainer pageTitle='Merkliste' pageDescription='Deine gemerkten Stellen, auch die aus deinen Treffer-Mails. Stellen, die nicht mehr ausgeschrieben sind, entfernen wir automatisch.'>
      <KontoGuard>
        <MerklisteSeite />
      </KontoGuard>
    </PageContainer>
  );
}
