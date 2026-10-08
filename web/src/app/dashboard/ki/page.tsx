import PageContainer from '@/components/layout/page-container';
import { KiAnbindungInhalt } from '@/features/ki-anbindung/components/ki-anbindung-inhalt';

export const metadata = {
  title: 'Mit deiner KI bewerben'
};

export default function Page() {
  return (
    <PageContainer
      pageTitle='Mit deiner KI bewerben'
      pageDescription='Ohne Konto: Kopier den Link zu einer Stelle in deinen Chat oder verbinde deine KI fest.'
      pageTitleAs='h1'
    >
      <div className='max-w-3xl'>
        <KiAnbindungInhalt />
      </div>
    </PageContainer>
  );
}
