import type { Metadata } from 'next';
import { ladeMappeFuerSeite } from '@/features/mappe/api/mappe-server';
import { MappePage } from '@/features/mappe/components/mappe-page';

// noindex ist Pflicht: die Kennung in der URL IST die Berechtigung (kein
// Login) - ein Fähigkeitsschlüssel darf nicht in einem Suchindex landen.
export const metadata: Metadata = {
  title: 'Unterlagen für deine Bewerbung',
  robots: { index: false, follow: false }
};

export default async function MappeRoute({ params }: { params: Promise<{ mappenId: string }> }) {
  const { mappenId } = await params;
  const mappe = await ladeMappeFuerSeite(mappenId);
  return <MappePage mappenId={mappenId} mappe={mappe} />;
}
