import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { NavigationProvider, useNavigation } from '../../src/lib/navigation/navigation-context';
import { CartProvider, useCart } from '../../src/lib/cart/cart-context';
import { AuthProvider, useAuth } from '../../src/lib/auth/auth-context';
import type { GuestMenuItem } from '../../src/types/menu';

const mockMenuItem: GuestMenuItem = {
  id: 'item-101',
  name: 'Chicken Rice',
  description: 'Fragrant seasoned rice with tender chicken',
  price: 850,
  category: 'MAINS',
  available: true,
  isOrderable: true,
  isCutoff: false,
  secondsRemainingUntilCutoff: 3600,
  estimatedPrepMinutes: 15,
  imageUrl: null,
  dietaryFlags: [],
  allergens: [],
  mealPeriods: ['LUNCH', 'DINNER'],
  portionCap: 5,
};

const mockFetchCurrentSession = jest.fn().mockResolvedValue({
  bookingId: 'BK-CTX-1',
  roomNumber: '101',
  guestName: 'Jane Context',
  checkInDate: '2026-11-09T10:00:00Z',
  checkOutDate: '2026-11-12T10:00:00Z',
});
const mockFetchDemoTokens = jest.fn().mockResolvedValue({});
const mockLogoutSession = jest.fn().mockResolvedValue(undefined);
const mockRedeemQrToken = jest.fn();
const mockRenewSession = jest.fn().mockRejectedValue(new Error('renew disabled by default'));

jest.mock('../../src/lib/api/guest-sessions', () => ({
  fetchCurrentSession: (...args: unknown[]) => mockFetchCurrentSession(...args),
  fetchDemoTokens: (...args: unknown[]) => mockFetchDemoTokens(...args),
  logoutSession: (...args: unknown[]) => mockLogoutSession(...args),
  redeemQrToken: (...args: unknown[]) => mockRedeemQrToken(...args),
  renewSession: (...args: unknown[]) => mockRenewSession(...args),
}));

describe('NavigationProvider', () => {
  it('throws error when useNavigation is used outside provider', () => {
    // Suppress console.error for expected thrown error
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useNavigation())).toThrow(
      'useNavigation must be used within a NavigationProvider',
    );
    spy.mockRestore();
  });

  it('manages activeTab, selectedOrderId, and page headers', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationProvider>{children}</NavigationProvider>
    );

    const { result } = renderHook(() => useNavigation(), { wrapper });

    expect(result.current.activeTab).toBe('menu');
    expect(result.current.pageHeader.title).toBe('Order Food');

    act(() => {
      result.current.setSelectedOrderId('ord-999');
      result.current.setActiveTab('orders');
    });

    expect(result.current.activeTab).toBe('orders');
    expect(result.current.selectedOrderId).toBeNull(); // Reset by default

    act(() => {
      result.current.setSelectedOrderId('ord-keep');
      result.current.setActiveTab('orders', { keepSelectedOrder: true });
    });

    expect(result.current.selectedOrderId).toBe('ord-keep');

    act(() => {
      result.current.setPageHeader({
        title: 'Custom Header',
        subtitle: 'Custom Subtitle',
        showBackButton: true,
      });
    });

    expect(result.current.pageHeader.title).toBe('Custom Header');
    expect(result.current.pageHeader.subtitle).toBe('Custom Subtitle');
    expect(result.current.pageHeader.showBackButton).toBe(true);

    act(() => {
      result.current.resetHeaderForTab('complaints', '103', 'John Doe');
    });

    expect(result.current.pageHeader.title).toBe('File a Complaint');
    expect(result.current.pageHeader.subtitle).toContain('Room 103');
  });
});

describe('CartProvider', () => {
  it('throws error when useCart is used outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCart())).toThrow('useCart must be used within a CartProvider');
    spy.mockRestore();
  });

  it('handles item additions, portion caps, quantity steppers, and allergy notes', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <CartProvider>{children}</CartProvider>
      </AuthProvider>
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.items).toEqual([]);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.totalAmount).toBe(0);

    // 1. Add item
    act(() => {
      const res = result.current.addItem(mockMenuItem, 2, 'Extra chili');
      expect(res.success).toBe(true);
    });

    expect(result.current.totalCount).toBe(2);
    expect(result.current.totalAmount).toBe(1700);
    expect(result.current.getItemQuantity('item-101')).toBe(2);

    // 2. Portion cap and quantity range enforcement
    act(() => {
      const underMinRes = result.current.addItem(mockMenuItem, 0);
      expect(underMinRes.success).toBe(false);

      const overMaxRes = result.current.addItem(mockMenuItem, 25);
      expect(overMaxRes.success).toBe(false);

      const overCapRes = result.current.addItem(mockMenuItem, 10);
      expect(overCapRes.success).toBe(false);
      expect(overCapRes.reason).toContain('portion limit');
    });

    // 2b. Add same item again to exercise index > -1 update branch
    act(() => {
      const res = result.current.addItem(mockMenuItem, 1, 'Updated notes');
      expect(res.success).toBe(true);
    });
    expect(result.current.getItemQuantity('item-101')).toBe(3);

    // 3. Unavailable / Cutoff rejection
    const unavailableItem: GuestMenuItem = {
      ...mockMenuItem,
      id: 'item-unavail',
      available: false,
    };
    act(() => {
      const failRes = result.current.addItem(unavailableItem);
      expect(failRes.success).toBe(false);
      expect(failRes.reason).toContain('sold out');
    });

    const cutoffItem: GuestMenuItem = {
      ...mockMenuItem,
      id: 'item-cutoff',
      isCutoff: true,
    };
    act(() => {
      const failRes = result.current.addItem(cutoffItem);
      expect(failRes.success).toBe(false);
      expect(failRes.reason).toContain('Ordering cutoff');
    });

    // 4. Update quantity
    act(() => {
      const overPortionRes = result.current.updateQuantity('item-101', 99);
      expect(overPortionRes).toBe(false);

      const nonExistentRes = result.current.updateQuantity('item-none', 2);
      expect(nonExistentRes).toBe(false);

      result.current.updateQuantity('item-101', 4);
    });
    expect(result.current.getItemQuantity('item-101')).toBe(4);
    expect(result.current.totalAmount).toBe(3400);

    // 5. Update quantity to 0 removes item
    act(() => {
      result.current.updateQuantity('item-101', 0);
    });
    expect(result.current.totalCount).toBe(0);

    // 6. Add and remove item
    act(() => {
      result.current.addItem(mockMenuItem, 1);
    });
    expect(result.current.totalCount).toBe(1);

    act(() => {
      result.current.removeItem('item-101');
    });
    expect(result.current.totalCount).toBe(0);

    // 7. Allergy note with 300 char clamp
    act(() => {
      result.current.setAllergyNote('Peanut allergy');
    });
    expect(result.current.allergyNote).toBe('Peanut allergy');

    act(() => {
      result.current.setAllergyNote('A'.repeat(350));
    });
    expect(result.current.allergyNote.length).toBe(300);

    // 8. Drawer visibility & clearCart
    act(() => {
      result.current.setIsCartOpen(true);
      result.current.clearCart();
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.allergyNote).toBe('');
  });
});

describe('AuthProvider', () => {
  it('throws error when useAuth is used outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider',
    );
    spy.mockRestore();
  });

  it('initializes in unauthenticated state when no session token exists and clears errors', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(['idle', 'unauthenticated']).toContain(result.current.status);
    expect(result.current.guest).toBeNull();
    expect(result.current.sessionToken).toBeNull();

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it('handles loginWithQr success, session hydration, and logout', async () => {
    const mockGuest = {
      bookingId: 'BK-CTX-1',
      roomNumber: '101',
      guestName: 'Jane Context',
      checkInDate: '2026-11-09T10:00:00Z',
      checkOutDate: '2026-11-12T10:00:00Z',
    };

    mockRedeemQrToken.mockResolvedValueOnce({
      sessionToken: 'token-ctx-101',
      expiresAt: '2026-11-10T12:00:00Z',
      guest: mockGuest,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = false;
    await act(async () => {
      success = await result.current.loginWithQr('qr-token-raw');
    });

    expect(success).toBe(true);
    expect(result.current.status).toBe('authenticated');
    expect(result.current.sessionToken).toBe('token-ctx-101');
    expect(result.current.guest?.roomNumber).toBe('101');

    // Logout
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.sessionToken).toBeNull();
    expect(result.current.guest).toBeNull();
  });

  it('handles loginWithQr rejection and sets error status', async () => {
    mockRedeemQrToken.mockRejectedValueOnce(new Error('Invalid or expired QR token'));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    let success = true;
    await act(async () => {
      success = await result.current.loginWithQr('invalid-token');
    });

    expect(success).toBe(false);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('Invalid or expired QR token');
  });

  it('handles refreshSession success and expiration failure', async () => {
    const mockGuest = {
      bookingId: 'BK-CTX-2',
      roomNumber: '102',
      guestName: 'Bob Context',
      checkInDate: '2026-11-09T10:00:00Z',
      checkOutDate: '2026-11-12T10:00:00Z',
    };

    mockRedeemQrToken.mockResolvedValueOnce({
      sessionToken: 'token-ctx-102',
      expiresAt: '2026-11-10T12:00:00Z',
      guest: mockGuest,
    });
    mockFetchCurrentSession.mockResolvedValueOnce(mockGuest);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.loginWithQr('qr-token-bob');
    });

    // Refresh success
    await act(async () => {
      await result.current.refreshSession();
    });
    expect(result.current.status).toBe('authenticated');

    // Refresh failure (e.g. checkout revocation)
    mockFetchCurrentSession.mockRejectedValueOnce(new Error('Stay expired'));
    await act(async () => {
      await result.current.refreshSession();
    });
    expect(result.current.status).toBe('expired');
  });

  it('supports stay-bounded renewal in refreshSession and session hydration', async () => {
    const mockGuest = {
      bookingId: 'BK-RENEW-1',
      roomNumber: '202',
      guestName: 'Renew Guest',
      checkInDate: '2026-11-09T10:00:00Z',
      checkOutDate: '2026-11-15T10:00:00Z',
      stayEnd: '2026-11-15T10:00:00Z',
    };

    mockRedeemQrToken.mockResolvedValueOnce({
      sessionToken: 'token-initial-202',
      expiresAt: '2026-11-10T12:00:00Z',
      guest: mockGuest,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result, unmount } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.loginWithQr('qr-token-renew');
    });

    expect(result.current.sessionToken).toBe('token-initial-202');

    // Test refreshSession with successful renewal
    mockRenewSession.mockResolvedValueOnce({
      sessionToken: 'token-initial-202',
      expiresAt: '2026-11-12T12:00:00Z',
      guest: mockGuest,
    });
    await act(async () => {
      await result.current.refreshSession();
    });

    expect(result.current.status).toBe('authenticated');
    expect(result.current.sessionToken).toBe('token-initial-202');
    expect(result.current.expiresAt).toBe('2026-11-12T12:00:00Z');
    unmount();

    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('migrates legacy unpartitioned session tokens according to data mode', () => {
    // Legacy demo token in demo mode
    window.localStorage.setItem('foss_data_mode', 'demo');
    window.sessionStorage.setItem('foss_guest_session_token', 'demo-token-legacy-101');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.sessionToken).toBe('demo-token-legacy-101');
    expect(window.sessionStorage.getItem('foss_guest_session_token_demo')).toBe(
      'demo-token-legacy-101',
    );
    expect(window.sessionStorage.getItem('foss_guest_session_token')).toBeNull();

    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('handles DATA_MODE_CHANGE_EVENT and updates state', async () => {
    mockFetchDemoTokens.mockResolvedValueOnce({
      'Room 303': 'demo-token-303',
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      window.dispatchEvent(new Event('foss:data-mode-changed'));
    });

    expect(result.current.status).toBe('idle');
  });

  it('handles session hydration rejection and sets expired status', async () => {
    window.localStorage.setItem('foss_data_mode', 'demo');
    window.sessionStorage.setItem('foss_guest_session_token_demo', 'token-will-fail');
    mockFetchCurrentSession.mockRejectedValueOnce(new Error('Guest checked out'));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe('expired');
    });

    // clearError resets expired to idle
    act(() => {
      result.current.clearError();
    });
    expect(result.current.status).toBe('idle');

    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('returns early in refreshSession when no sessionToken exists', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.refreshSession();
    });

    expect(result.current.status).toBe('idle');
  });

  it('migrates legacy api token in api mode and ignores mismatched legacy tokens', () => {
    // 1. API mode with real API token
    window.localStorage.setItem('foss_data_mode', 'api');
    window.sessionStorage.setItem('foss_guest_session_token', 'jwt-real-api-token-xyz');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result, unmount } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.sessionToken).toBe('jwt-real-api-token-xyz');
    expect(window.sessionStorage.getItem('foss_guest_session_token_api')).toBe(
      'jwt-real-api-token-xyz',
    );
    unmount();

    // 2. API mode with demo token (mismatch, should not migrate)
    window.sessionStorage.clear();
    window.sessionStorage.setItem('foss_guest_session_token', 'demo-token-should-not-migrate');

    const { result: res2 } = renderHook(() => useAuth(), { wrapper });
    expect(res2.current.sessionToken).toBeNull();
    expect(window.sessionStorage.getItem('foss_guest_session_token_api')).toBeNull();

    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('handles non-Error rejection in loginWithQr and logout network failure', async () => {
    mockRedeemQrToken.mockRejectedValueOnce('Raw string rejection');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const ok = await result.current.loginWithQr('test-qr');
      expect(ok).toBe(false);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Failed to authenticate QR code. Please try again.');

    // Logout when logoutSession rejects
    mockLogoutSession.mockRejectedValueOnce(new Error('Network offline during logout'));
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.status).toBe('idle');
  });

  it('authenticates successfully with loginWithQr and updates state', async () => {
    mockRedeemQrToken.mockResolvedValueOnce({
      sessionToken: 'valid-session-jwt-123',
      expiresAt: '2026-11-12T12:00:00Z',
      guest: {
        bookingId: 'BK-QR-1',
        roomNumber: '302',
        guestName: 'Verified Guest',
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      const success = await result.current.loginWithQr('qr-valid-token');
      expect(success).toBe(true);
    });

    expect(result.current.status).toBe('authenticated');
    expect(result.current.sessionToken).toBe('valid-session-jwt-123');
    expect(result.current.guest?.guestName).toBe('Jane Context');
  });
});
