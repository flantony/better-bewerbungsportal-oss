import KBar from '@/components/kbar';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { INHALT_ID } from '@/components/layout/inhalt-id';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: {
    index: false,
    follow: false
  }
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Persisting the sidebar state in the cookie. Ohne Cookie (erster Besuch)
  // ist sie ausgeklappt - eingeklappt zeigt sie nur Symbole ohne Beschriftung.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';

  return (
    <KBar>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar />
          <SidebarInset>
            <Header />
            <main id={INHALT_ID} tabIndex={-1} className='flex min-w-0 flex-1 flex-col outline-none'>
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
    </KBar>
  );
}
