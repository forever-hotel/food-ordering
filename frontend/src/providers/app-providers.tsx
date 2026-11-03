'use client';

import { App, ConfigProvider } from 'antd';
import type { PropsWithChildren } from 'react';

import { appTheme } from '@/config/theme';
import { AuthProvider } from '@/lib/auth/auth-context';
import { NavigationProvider } from '@/lib/navigation/navigation-context';
import { CartProvider } from '@/lib/cart/cart-context';
import { DemoModeToolbar } from '@/components/demo/demo-mode-toolbar';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConfigProvider theme={appTheme}>
      <App>
        <AuthProvider>
          <NavigationProvider>
            <CartProvider>
              {children}
              <DemoModeToolbar />
            </CartProvider>
          </NavigationProvider>
        </AuthProvider>
      </App>
    </ConfigProvider>
  );
}
