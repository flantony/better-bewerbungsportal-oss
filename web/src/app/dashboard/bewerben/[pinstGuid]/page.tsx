import PageContainer from '@/components/layout/page-container';
import { KontoGuard } from '@/features/auth/components/konto-guard';
import { BewerbenSeite } from '@/features/bewerben/components/bewerben-seite';

export const metadata = { title: 'Bewerben', robots: { index: false } };

type Params = { params: Promise<{ pinstGuid: string }> };

// Ob die gefuehrte Bewerbung angeboten wird, sagt erst der Server nach der
// Anmeldung (kontoLaden) - die Beschreibung steht deshalb in BewerbenSeite.
export default async function Page({ params }: Params) {
  const { pinstGuid } = await params;
  return (
    <PageContainer pageTitle='Bewerben'>
      <KontoGuard>
        <BewerbenSeite pinstGuid={pinstGuid} />
      </KontoGuard>
    </PageContainer>
  );
}
