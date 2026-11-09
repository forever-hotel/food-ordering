import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider, App } from 'antd';
import { appTheme } from '../../src/config/theme';
import HomePage from '../../src/app/page';
import ActivatePage from '../../src/app/activate/page';
import { AppProviders } from '../../src/providers/app-providers';
import { NavigationProvider } from '../../src/lib/navigation/navigation-context';
import { CartProvider } from '../../src/lib/cart/cart-context';

let mockAuth = {
  status: 'idle',
  sessionToken: null as string | null,
  guest: null as unknown,
  error: null as string | null,
  demoTokens: {},
  loginWithQr: jest.fn().mockResolvedValue(true),
  logout: jest.fn(),
  clearError: jest.fn(),
  refreshSession: jest.fn(),
};

let mockActiveTab = 'menu';

jest.mock('../../src/lib/auth/auth-context', () => {
  const actual = jest.requireActual('../../src/lib/auth/auth-context');
  return {
    ...actual,
    useAuth: () => mockAuth,
  };
});

jest.mock('../../src/lib/navigation/navigation-context', () => {
  const actual = jest.requireActual('../../src/lib/navigation/navigation-context');
  return {
    ...actual,
    useNavigation: () => ({
      activeTab: mockActiveTab,
      selectedOrderId: null,
      pageHeader: { title: 'Order Food', showBackButton: false },
      setActiveTab: jest.fn(),
      setSelectedOrderId: jest.fn(),
      setPageHeader: jest.fn(),
      resetHeaderForTab: jest.fn(),
    }),
  };
});

jest.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'mock-geist' }),
  Geist_Mono: () => ({ variable: 'mock-geist-mono' }),
}));

import RootLayout from '../../src/app/layout';
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  useServerInsertedHTML: (fn: any) => (typeof fn === 'function' ? fn() : null),
}));

// Mock sub-tabs to keep HomePage lightweight
jest.mock('../../src/features/menu/components/menu-tab', () => ({
  MenuTab: () => <div data-testid="mock-menu-tab">Menu Tab Content</div>,
}));

jest.mock('../../src/features/orders/components/orders-tab', () => ({
  OrdersTab: () => <div data-testid="mock-orders-tab">Orders Tab Content</div>,
}));

jest.mock('../../src/features/services/components/services-tab', () => ({
  ServicesTab: () => <div data-testid="mock-services-tab">Services Tab Content</div>,
}));

jest.mock('../../src/features/complaints/components/complaints-tab', () => ({
  ComplaintsTab: () => <div data-testid="mock-complaints-tab">Complaints Tab Content</div>,
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={appTheme}>
      <App>
        <NavigationProvider>
          <CartProvider>{children}</CartProvider>
        </NavigationProvider>
      </App>
    </ConfigProvider>
  );
}

describe('HomePage Component', () => {
  beforeEach(() => {
    mockActiveTab = 'menu';
  });

  it('renders loading spinner when auth status is loading', () => {
    mockAuth = {
      ...mockAuth,
      status: 'loading',
    };

    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );

    expect(screen.getByText(/Verifying guest stay session/i)).toBeDefined();
  });

  it('renders QrScanCard when unauthenticated', () => {
    mockAuth = {
      ...mockAuth,
      status: 'idle',
      guest: null,
    };

    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );

    expect(screen.getByText('FOREVER HOTEL')).toBeDefined();
  });

  it('renders MenuTab when authenticated and activeTab is menu', () => {
    mockAuth = {
      ...mockAuth,
      status: 'authenticated',
      guest: { roomNumber: '101' },
    };
    mockActiveTab = 'menu';

    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );

    expect(screen.getByTestId('mock-menu-tab')).toBeDefined();
  });

  it('renders OrdersTab when authenticated and activeTab is orders', () => {
    mockAuth = {
      ...mockAuth,
      status: 'authenticated',
      guest: { roomNumber: '101' },
    };
    mockActiveTab = 'orders';

    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );

    expect(screen.getByTestId('mock-orders-tab')).toBeDefined();
  });

  it('renders ServicesTab when authenticated and activeTab is services', () => {
    mockAuth = {
      ...mockAuth,
      status: 'authenticated',
      guest: { roomNumber: '101' },
    };
    mockActiveTab = 'services';

    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );

    expect(screen.getByTestId('mock-services-tab')).toBeDefined();
  });

  it('renders ComplaintsTab when authenticated and activeTab is complaints', () => {
    mockAuth = {
      ...mockAuth,
      status: 'authenticated',
      guest: { roomNumber: '101' },
    };
    mockActiveTab = 'complaints';

    render(
      <Wrapper>
        <HomePage />
      </Wrapper>,
    );

    expect(screen.getByTestId('mock-complaints-tab')).toBeDefined();
  });
});

describe('ActivatePage Component', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
  });

  it('renders missing token guidance when no token in URL search params', () => {
    mockSearchParams = new URLSearchParams();

    render(
      <Wrapper>
        <ActivatePage />
      </Wrapper>,
    );

    expect(screen.getByText(/Missing Activation Code/i)).toBeDefined();
    expect(screen.getByText(/Open Camera Scanner/i)).toBeDefined();
  });

  it('redeems token from search params and shows success confirmation', async () => {
    mockSearchParams = new URLSearchParams('token=valid-qr-slip-1234');
    mockAuth.loginWithQr = jest.fn().mockResolvedValue(true);

    render(
      <Wrapper>
        <ActivatePage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(mockAuth.loginWithQr).toHaveBeenCalledWith('valid-qr-slip-1234');
    });

    await waitFor(() => {
      expect(screen.getByText(/Continue to Dining Menu/i)).toBeDefined();
    });
  });

  it('shows error state when token redemption fails', async () => {
    mockSearchParams = new URLSearchParams('token=invalid-qr-slip');
    mockAuth.loginWithQr = jest.fn().mockResolvedValue(false);
    mockAuth.error = 'Token already redeemed';

    render(
      <Wrapper>
        <ActivatePage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Activation Failed/i)).toBeDefined();
    });
  });
});

describe('AppProviders Component', () => {
  it('renders children within full provider hierarchy', () => {
    render(
      <AppProviders>
        <div data-testid="child-node">Child Content</div>
      </AppProviders>,
    );

    expect(screen.getByTestId('child-node')).toBeDefined();
  });
});

describe('RootLayout Component', () => {
  it('renders root html structure with providers and children', () => {
    const { container } = render(
      <RootLayout params={Promise.resolve({}) as any}>
        <div data-testid="layout-child">Test Child Inside Layout</div>
      </RootLayout>,
    );

    expect(container).toBeDefined();
    expect(screen.getByText('Test Child Inside Layout')).toBeDefined();
  });
});
