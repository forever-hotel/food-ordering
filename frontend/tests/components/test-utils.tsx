import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ConfigProvider, App } from 'antd';
import { appTheme } from '../../src/config/theme';
import { AuthProvider } from '../../src/lib/auth/auth-context';
import { NavigationProvider } from '../../src/lib/navigation/navigation-context';
import { CartProvider } from '../../src/lib/cart/cart-context';

export function AllTheProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={appTheme}>
      <App>
        <AuthProvider>
          <NavigationProvider>
            <CartProvider>{children}</CartProvider>
          </NavigationProvider>
        </AuthProvider>
      </App>
    </ConfigProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

export * from '@testing-library/react';
