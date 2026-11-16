import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/lib/auth/auth-context';
import { fetchCurrentSession, redeemQrToken, renewSession } from '../../src/lib/api/guest-sessions';
import { disconnectAllRealtimeClients } from '../../src/lib/realtime/realtime-client';

jest.mock('../../src/lib/api/guest-sessions', () => ({
  fetchCurrentSession: jest.fn().mockResolvedValue({ bookingId: 'booking', roomNumber: '101' }),
  fetchDemoTokens: jest.fn(),
  logoutSession: jest.fn(),
  redeemQrToken: jest.fn(),
  renewSession: jest.fn(),
}));
jest.mock('../../src/lib/data-mode/data-mode', () => ({
  getDataMode: () => 'api',
  getSessionStorageKey: () => 'session-expiry-test',
  DATA_MODE_CHANGE_EVENT: 'data-mode-change',
  LEGACY_SESSION_STORAGE_KEY: 'legacy-token',
  savePersistentSession: jest.fn(),
  loadPersistentSession: jest.fn(),
  clearPersistentSession: jest.fn(),
}));
jest.mock('../../src/lib/realtime/realtime-client', () => ({
  disconnectAllRealtimeClients: jest.fn(),
  FOSS_SESSION_EXPIRED_EVENT: 'foss:session-expired',
}));

function State() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="booking">{auth.guest?.bookingId ?? ''}</span>
      <button onClick={() => void auth.loginWithQr('fresh-qr-token')}>login</button>
    </div>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  (fetchCurrentSession as jest.Mock).mockResolvedValue({ bookingId: 'booking', roomNumber: '101' });
  (renewSession as jest.Mock).mockRejectedValue(new Error('fallback'));
});

it('expires only the current session and disconnects live clients', async () => {
  sessionStorage.setItem('session-expiry-test', 'current-token');
  render(
    <AuthProvider>
      <State />
    </AuthProvider>,
  );
  await waitFor(() => expect(screen.getByText('authenticated')).toBeTruthy());
  act(() => {
    window.dispatchEvent(
      new CustomEvent('foss:session-expired', { detail: { token: 'old-token' } }),
    );
  });
  expect(screen.getByText('authenticated')).toBeTruthy();
  act(() => {
    window.dispatchEvent(
      new CustomEvent('foss:session-expired', { detail: { token: 'current-token' } }),
    );
  });
  await waitFor(() => expect(screen.getByText('expired')).toBeTruthy());
  expect(sessionStorage.getItem('session-expiry-test')).toBeNull();
  expect(disconnectAllRealtimeClients).toHaveBeenCalled();
});

it('prevents stale hydration 401, redundant renew after QR login, and cross-booking cookie expiry events', async () => {
  sessionStorage.setItem('session-expiry-test', '__COOKIE_SESSION__');

  let rejectStaleRestore!: (reason?: unknown) => void;
  (renewSession as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectStaleRestore = reject;
      }),
  );
  (fetchCurrentSession as jest.Mock).mockRejectedValueOnce(new Error('401 stale'));
  (redeemQrToken as jest.Mock).mockResolvedValueOnce({
    sessionToken: '__COOKIE_SESSION__',
    expiresAt: '2026-11-13T11:00:00.000Z',
    guest: {
      guestId: 'guest-202',
      bookingId: 'new-booking-202',
      roomNumber: '202',
      guestName: 'New Guest',
      role: 'GUEST',
      stayEnd: '2026-11-13T11:00:00.000Z',
    },
  });

  render(
    <AuthProvider>
      <State />
    </AuthProvider>,
  );

  // Trigger fresh QR login while stale cookie restoration is still in flight
  fireEvent.click(screen.getByText('login'));

  await waitFor(() => {
    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    expect(screen.getByTestId('booking').textContent).toBe('new-booking-202');
  });

  // Old hydration fails with 401 after QR login succeeded -> must NOT wipe new session
  await act(async () => {
    rejectStaleRestore(new Error('401 stale'));
  });
  expect(screen.getByTestId('status').textContent).toBe('authenticated');
  expect(screen.getByTestId('booking').textContent).toBe('new-booking-202');

  // Hydration effect must not trigger an immediate redundant renew after QR login
  expect(renewSession).toHaveBeenCalledTimes(1);

  // Stale realtime 401 from an old stay sharing __COOKIE_SESSION__ sentinel must be ignored
  act(() => {
    window.dispatchEvent(
      new CustomEvent('foss:session-expired', {
        detail: {
          token: '__COOKIE_SESSION__',
          bookingId: 'old-booking-101',
          roomNumber: '101',
        },
      }),
    );
  });
  expect(screen.getByTestId('status').textContent).toBe('authenticated');

  // Matching current stay cookie expiry event DOES expire the session
  act(() => {
    window.dispatchEvent(
      new CustomEvent('foss:session-expired', {
        detail: {
          token: '__COOKIE_SESSION__',
          bookingId: 'new-booking-202',
          roomNumber: '202',
        },
      }),
    );
  });
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('expired'));
});
