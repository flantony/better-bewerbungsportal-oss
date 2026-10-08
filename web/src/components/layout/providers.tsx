'use client';
import React from 'react';
import { ActiveThemeProvider } from '@/components/themes/active-theme';
import QueryProvider from '@/components/layout/query-provider';
import { AuthProvider } from '@/features/auth/components/auth-provider';

export default function Providers({
  activeThemeValue,
  children
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <ActiveThemeProvider initialTheme={activeThemeValue}>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </ActiveThemeProvider>
    </>
  );
}
