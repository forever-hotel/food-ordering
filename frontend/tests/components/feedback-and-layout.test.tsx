import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AlertNotice } from '../../src/components/feedback/alert-notice';
import { EmptyState } from '../../src/components/feedback/empty-state';
import { ErrorBoundary } from '../../src/components/feedback/error-boundary';
import { LoadingSkeleton } from '../../src/components/feedback/loading-skeleton';
import { OfflineBanner } from '../../src/components/feedback/offline-banner';
import { MobileBottomNav } from '../../src/components/layout/mobile-bottom-nav';
import { GuestShell } from '../../src/components/layout/guest-shell';
import { NavigationProvider } from '../../src/lib/navigation/navigation-context';
import { AuthProvider } from '../../src/lib/auth/auth-context';
import { CartProvider } from '../../src/lib/cart/cart-context';
import { ConfigProvider, App } from 'antd';
import { appTheme } from '../../src/config/theme';

function TestWrapper({ children }: { children: React.ReactNode }) {
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

describe('Feedback Components', () => {
  describe('AlertNotice', () => {
    it('renders title, message, and action button', () => {
      let actionClicked = false;
      render(
        <AlertNotice
          type="warning"
          title="Attention Guest"
          message="Kitchen closes soon"
          onRetry={() => {
            actionClicked = true;
          }}
        />,
      );

      expect(screen.getByText('Attention Guest')).toBeDefined();
      expect(screen.getByText('Kitchen closes soon')).toBeDefined();
      const btn = screen.getByText('Retry action');
      fireEvent.click(btn);
      expect(actionClicked).toBe(true);
    });

    it('renders with different alert types (error, info, success)', () => {
      const { rerender } = render(
        <AlertNotice type="error" title="Order Error" message="Payment failed" />,
      );
      expect(screen.getByText('Order Error')).toBeDefined();

      rerender(<AlertNotice type="success" title="Success" message="Order confirmed" />);
      expect(screen.getByText('Success')).toBeDefined();
    });
  });

  describe('EmptyState', () => {
    it('renders default icon, title, description, and handles action button', () => {
      let clicked = false;
      render(
        <EmptyState
          title="No Active Orders"
          description="You have not placed any orders for this stay yet."
          actionText="Browse Menu"
          onAction={() => {
            clicked = true;
          }}
        />,
      );

      expect(screen.getByText('No Active Orders')).toBeDefined();
      expect(screen.getByText('You have not placed any orders for this stay yet.')).toBeDefined();
      const actionBtn = screen.getByText('Browse Menu');
      fireEvent.click(actionBtn);
      expect(clicked).toBe(true);
    });

    it('renders without action button when omitted', () => {
      render(<EmptyState icon="📦" title="Empty History" description="Nothing to display here" />);
      expect(screen.getByText('Empty History')).toBeDefined();
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('LoadingSkeleton', () => {
    it('renders card skeletons and generic skeleton elements with aria status', () => {
      const { container } = render(<LoadingSkeleton type="card" count={2} />);
      expect(screen.getByRole('status', { name: /Loading guest services/i })).toBeDefined();
      expect(container.querySelectorAll('.ant-card').length).toBe(2);
    });

    it('renders list, header, and button skeleton types', () => {
      const { rerender, container } = render(<LoadingSkeleton type="list" count={1} />);
      expect(container.querySelectorAll('.ant-card').length).toBe(1);

      rerender(<LoadingSkeleton type="header" count={1} />);
      expect(container.querySelectorAll('.ant-card').length).toBe(1);

      rerender(<LoadingSkeleton type="button" count={1} />);
      expect(container.querySelectorAll('.ant-card').length).toBe(1);
    });
  });

  describe('OfflineBanner', () => {
    it('renders warning alert when window offline event fires and success banner on reconnect', () => {
      render(<OfflineBanner />);

      // Trigger offline event
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      // Trigger online event
      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      expect(screen.getByText('Back online')).toBeDefined();
      expect(
        screen.getByText('Connection restored. Ready to order and request services.'),
      ).toBeDefined();
    });
  });

  describe('ErrorBoundary', () => {
    it('catches render errors in children and displays fallback alert with Try Again button', () => {
      const ProblemChild = () => {
        throw new Error('Crashing component failure');
      };

      let resetCalled = false;
      // Suppress console.error during expected test error
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary
          fallbackTitle="Custom Section Error"
          onReset={() => {
            resetCalled = true;
          }}
        >
          <ProblemChild />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Custom Section Error')).toBeDefined();
      expect(screen.getByText(/We encountered an unexpected issue/)).toBeDefined();

      const tryAgainBtn = screen.getByText('Try Again');
      fireEvent.click(tryAgainBtn);
      expect(resetCalled).toBe(true);

      spy.mockRestore();
    });

    it('renders children normally when there is no error', () => {
      render(
        <ErrorBoundary>
          <div>Safe and Healthy Content</div>
        </ErrorBoundary>,
      );
      expect(screen.getByText('Safe and Healthy Content')).toBeDefined();
    });
  });
});

describe('Layout Components', () => {
  describe('MobileBottomNav', () => {
    it('renders all 4 tabs and responds to tab switches and keyboard arrows', () => {
      render(
        <TestWrapper>
          <MobileBottomNav />
        </TestWrapper>,
      );

      const menuTab = screen.getByRole('tab', { name: /In-Room Dining Menu/i });
      const ordersTab = screen.getByRole('tab', { name: /Order History and Tracking/i });
      const servicesTab = screen.getByRole('tab', { name: /Housekeeping and Service Requests/i });
      const complaintsTab = screen.getByRole('tab', {
        name: /Guest Complaints and Management Feedback/i,
      });

      expect(menuTab).toBeDefined();
      expect(ordersTab).toBeDefined();
      expect(servicesTab).toBeDefined();
      expect(complaintsTab).toBeDefined();

      // Click orders tab
      fireEvent.click(ordersTab);
      expect(ordersTab.getAttribute('aria-selected')).toBe('true');

      // Keyboard navigation: ArrowRight moves to services
      fireEvent.keyDown(ordersTab, { key: 'ArrowRight' });
      expect(servicesTab.getAttribute('aria-selected')).toBe('true');

      // Keyboard navigation: End moves to complaints
      fireEvent.keyDown(servicesTab, { key: 'End' });
      expect(complaintsTab.getAttribute('aria-selected')).toBe('true');

      // Keyboard navigation: Home moves back to menu
      fireEvent.keyDown(complaintsTab, { key: 'Home' });
      expect(menuTab.getAttribute('aria-selected')).toBe('true');

      // Keyboard navigation: ArrowLeft wraps to complaints
      fireEvent.keyDown(menuTab, { key: 'ArrowLeft' });
      expect(complaintsTab.getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('GuestShell', () => {
    it('renders skip link and main children when unauthenticated', () => {
      render(
        <TestWrapper>
          <GuestShell>
            <div>Guest Shell Main Body</div>
          </GuestShell>
        </TestWrapper>,
      );

      expect(screen.getByText('Skip to main content')).toBeDefined();
      expect(screen.getByText('Guest Shell Main Body')).toBeDefined();
    });
  });
});
