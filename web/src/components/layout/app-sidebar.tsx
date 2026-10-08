'use client';
import { useQueryClient } from '@tanstack/react-query';
import { signOut } from 'firebase/auth';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from '@/components/ui/sidebar';
import { Wordmark } from '@/components/wordmark';
import { navGroups } from '@/config/nav-config';
import { useAuthUser } from '@/features/auth/components/auth-provider';
import { merkeAbmeldung } from '@/features/auth/lib/abmeldung-laeuft';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useFilteredNavGroups } from '@/hooks/use-nav';
import { clientAuth } from '@/lib/firebase/client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { Icons } from '@/components/icons';

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isOpen } = useMediaQuery();
  const filteredGroups = useFilteredNavGroups(navGroups);
  const user = useAuthUser();

  const handleSignOut = async () => {
    // Cache leeren, bevor der Auth-State kippt, damit nach einem
    // Konto-Wechsel im selben Tab keine gecachten Daten des vorigen Nutzers
    // sichtbar bleiben. Navigiert wird VOR dem signOut, damit KontoGuard auf
    // einer geschuetzten Seite nicht mit einem eigenen Redirect nach
    // /anmelden gewinnt - das Signal (ein kurzes Zeitfenster,
    // s. abmeldung-laeuft.ts) deckt den spaeten Render ab.
    queryClient.clear();
    merkeAbmeldung();
    router.push('/');
    await signOut(clientAuth());
  };

  React.useEffect(() => {
    // Side effects based on sidebar state changes
  }, [isOpen]);

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <Wordmark className='truncate px-2 py-1.5 text-sm group-data-[collapsible=icon]:hidden' />
      </SidebarHeader>
      <SidebarContent className='overflow-x-hidden'>
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label || 'ungrouped'} className='py-0'>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon ? Icons[item.icon] : Icons.logo;
                return item?.items && item?.items?.length > 0 ? (
                  <Collapsible
                    key={item.title}
                    defaultOpen={item.isActive}
                    render={<SidebarMenuItem />}
                  >
                    <CollapsibleTrigger
                      render={
                        <SidebarMenuButton
                          tooltip={item.title}
                          isActive={pathname === item.url}
                          className='group/collapsible'
                        />
                      }
                    >
                      {item.icon && <Icon />}
                      <span>{item.title}</span>
                      <Icons.chevronRight className='ml-auto transition-transform duration-200 group-data-panel-open/collapsible:rotate-90' />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              render={<Link href={subItem.url} aria-label={subItem.title} />}
                              isActive={pathname === subItem.url}
                            >
                              <span>{subItem.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={
                        <Link
                          href={item.url}
                          aria-label={item.hinweis ? `${item.title} (${item.hinweis})` : item.title}
                        />
                      }
                      tooltip={item.hinweis ? `${item.title} (${item.hinweis})` : item.title}
                      isActive={pathname === item.url}
                    >
                      <Icon />
                      <span>{item.title}</span>
                      {item.hinweis && (
                        <span className='text-muted-foreground ml-auto text-xs'>{item.hinweis}</span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size='lg'
                      className='data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground'
                    />
                  }
                >
                  <span className='truncate'>{user.email}</span>
                  <Icons.chevronsDown className='ml-auto size-4' />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className='w-(--anchor-width) min-w-56 rounded-lg'
                  side='bottom'
                  align='end'
                  sideOffset={4}
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className='p-0 font-normal'>
                      <div className='text-muted-foreground px-1 py-1.5 text-sm'>{user.email}</div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={handleSignOut}>
                      <Icons.logout className='mr-2 size-4' />
                      Abmelden
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <SidebarMenuButton render={<Link href='/anmelden' aria-label='Anmelden' />}>
                <Icons.login />
                <span>Anmelden</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
