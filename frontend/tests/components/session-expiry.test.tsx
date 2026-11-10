import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/lib/auth/auth-context';
import { disconnectAllRealtimeClients } from '../../src/lib/realtime/realtime-client';

jest.mock('../../src/lib/api/guest-sessions', () => ({
  fetchCurrentSession: jest.fn().mockResolvedValue({ bookingId: 'booking', roomNumber: '101' }),
  fetchDemoTokens: jest.fn(),
  logoutSession: jest.fn(),
  redeemQrToken: jest.fn(),
}));
jest.mock('../../src/lib/data-mode/data-mode', () => ({
  getDataMode: () => 'api',
  getSessionStorageKey: () => 'session-expiry-test',
  DATA_MODE_CHANGE_EVENT: 'data-mode-change',
  LEGACY_SESSION_STORAGE_KEY: 'legacy-token',
}));
jest.mock('../../src/lib/realtime/realtime-client', () => ({
  disconnectAllRealtimeClients: jest.fn(),
  FOSS_SESSION_EXPIRED_EVENT: 'foss:session-expired',
}));

function State() {
  const auth = useAuth();
  return <span>{auth.status}</span>;
}

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
