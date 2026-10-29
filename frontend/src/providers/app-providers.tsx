'use client';

import { ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';

import { appTheme } from '@/config/theme';
import { AuthProvider } from '@/lib/auth/auth-context';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConfigProvider theme={appTheme}>
      <AuthProvider>{children}</AuthProvider>
    </ConfigProvider>
  );
}
