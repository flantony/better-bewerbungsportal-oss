import { KiAnbindungPage } from '@/features/ki-anbindung/components/ki-anbindung-page';

export const metadata = {
  title: 'Mit deiner KI bewerben',
  description:
    'Verbinde Claude, ChatGPT oder ein anderes KI-Tool mit Better Bewerbungsportal. Deine KI findet Bundeswehr-Ausschreibungen und füllt den offiziellen Bewerbungsbogen aus.'
};

export default function KiPage() {
  return <KiAnbindungPage />;
}
