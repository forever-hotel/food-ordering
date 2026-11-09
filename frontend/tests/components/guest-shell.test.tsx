import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigProvider, App } from 'antd';
import { appTheme } from '../../src/config/theme';
import { GuestShell } from '../../src/components/layout/guest-shell';
import type { NavTabId, PageHeaderConfig } from '../../src/lib/navigation/navigation-context';

let mockAuth = {
  status: 'authenticated',
  guest: {
    bookingId: 'BK-101',
    roomNumber: '101',
    guestName: 'John Doe',
  } as unknown,
  logout: jest.fn(),
};

let mockNav = {
  activeTab: 'menu' as NavTabId,
  pageHeader: {
    title: 'Order Food',
    subtitle: undefined as string | undefined,
    showBackButton: false,
    onBack: null as (() => void) | null,
    hideHeader: false,
    hideBottomNav: false,
  } as PageHeaderConfig,
  setActiveTab: jest.fn(),
};

jest.mock('../../src/lib/auth/auth-context', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('../../src/lib/navigation/navigation-context', () => ({
  useNavigation: () => mockNav,
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={appTheme}>
      <App>{children}</App>
    </ConfigProvider>
  );
}

describe('GuestShell Layout Component', () => {
  beforeEach(() => {
    mockAuth = {
      status: 'authenticated',
      guest: {
        bookingId: 'BK-101',
        roomNumber: '101',
        guestName: 'John Doe',
      },
      logout: jest.fn(),
    };
    mockNav = {
      activeTab: 'menu',
      pageHeader: {
        title: 'Order Food',
        subtitle: undefined,
        showBackButton: false,
        onBack: null,
        hideHeader: false,
        hideBottomNav: false,
      },
      setActiveTab: jest.fn(),
    };
  });

  it('renders menu tab header with room and guest name subtitle', () => {
    mockNav.activeTab = 'menu';
    render(
      <Wrapper>
        <GuestShell>
          <div>Main Page Content</div>
        </GuestShell>
      </Wrapper>,
    );

    expect(screen.getByText('Order Food')).toBeDefined();
    expect(screen.getByText('Room 101 · John Doe')).toBeDefined();
    expect(screen.getByText('Rm 101')).toBeDefined();
    expect(screen.getByText('Main Page Content')).toBeDefined();
  });

  it('renders orders tab contextual subtitle', () => {
    mockNav.activeTab = 'orders';
    mockNav.pageHeader.title = 'Order History';
    render(
      <Wrapper>
        <GuestShell>
          <div>Orders Page Content</div>
        </GuestShell>
      </Wrapper>,
    );

    expect(screen.getByText('Current stay — Room 101')).toBeDefined();
  });

  it('renders services tab contextual subtitle', () => {
    mockNav.activeTab = 'services';
    mockNav.pageHeader.title = 'Service Requests';
    render(
      <Wrapper>
        <GuestShell>
          <div>Services Content</div>
        </GuestShell>
      </Wrapper>,
    );

    expect(screen.getByText('Room 101 — auto-attached')).toBeDefined();
  });

  it('renders complaints tab contextual subtitle', () => {
    mockNav.activeTab = 'complaints';
    mockNav.pageHeader.title = 'Complaints';
    render(
      <Wrapper>
        <GuestShell>
          <div>Complaints Content</div>
        </GuestShell>
      </Wrapper>,
    );

    expect(screen.getByText('Room 101')).toBeDefined();
  });

  it('renders custom header subtitle when explicitly provided', () => {
    mockNav.pageHeader.subtitle = 'Special Custom Subtitle';
    render(
      <Wrapper>
        <GuestShell>
          <div>Custom Subtitle Content</div>
        </GuestShell>
      </Wrapper>,
    );

    expect(screen.getByText('Special Custom Subtitle')).toBeDefined();
  });

  it('renders and fires back button when showBackButton is enabled', () => {
    const onBackMock = jest.fn();
    mockNav.pageHeader.showBackButton = true;
    mockNav.pageHeader.onBack = onBackMock;

    render(
      <Wrapper>
        <GuestShell>
          <div>Detail Screen Content</div>
        </GuestShell>
      </Wrapper>,
    );

    const backBtn = screen.getByRole('button', { name: /Go back/i });
    expect(backBtn).toBeDefined();
    fireEvent.click(backBtn);
    expect(onBackMock).toHaveBeenCalledTimes(1);
  });

  it('hides header and bottom nav when flags are set', () => {
    mockNav.pageHeader.hideHeader = true;
    mockNav.pageHeader.hideBottomNav = true;

    render(
      <Wrapper>
        <GuestShell>
          <div>Fullscreen Checkout View</div>
        </GuestShell>
      </Wrapper>,
    );

    expect(screen.queryByText('Order Food')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('allows guest to sign out through room tag Popconfirm', async () => {
    render(
      <Wrapper>
        <GuestShell>
          <div>Page with Logout Tag</div>
        </GuestShell>
      </Wrapper>,
    );

    const roomTag = screen.getByText('Rm 101');
    fireEvent.click(roomTag);

    await waitFor(() => {
      expect(screen.getByText('Sign out of room session?')).toBeDefined();
    });

    const signoutConfirmBtn = screen.getByRole('button', { name: /^Sign out$/i });
    fireEvent.click(signoutConfirmBtn);

    expect(mockAuth.logout).toHaveBeenCalledTimes(1);
  });
});
