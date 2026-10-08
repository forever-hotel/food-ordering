'use client';

import { ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';

import { appTheme } from '@/config/theme';

export function AppProviders({ children }: PropsWithChildren) {
  return <ConfigProvider theme={appTheme}>{children}</ConfigProvider>;
}
