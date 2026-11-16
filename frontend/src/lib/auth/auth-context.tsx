'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  fetchCurrentSession,
  fetchDemoTokens,
  logoutSession,
  redeemQrToken,
  renewSession,
} from '../api/guest-sessions.ts';
import type { AuthStatus, GuestContext, GuestSessionResponse } from '../../types/guest-session.ts';
import {
  getDataMode,
  getSessionStorageKey,
  DATA_MODE_CHANGE_EVENT,
  LEGACY_SESSION_STORAGE_KEY,
  loadPersistentSession,
  savePersistentSession,
  clearPersistentSession,
  type DataMode,
} from '../data-mode/data-mode.ts';
import {
  disconnectAllRealtimeClients,
  FOSS_SESSION_EXPIRED_EVENT,
} from '../realtime/realtime-client.ts';

function subscribeStorage(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(DATA_MODE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(DATA_MODE_CHANGE_EVENT, callback);
  };
}

function getStoredToken(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const mode = getDataMode();
    return (
      loadPersistentSession(mode) ??
      window.sessionStorage?.getItem(getSessionStorageKey(mode)) ??
      null
    );
  } catch {
    return null;
  }
}

function safelySaveSession(
  token: string,
  mode: DataMode,
  expiresAt?: string,
  stayEnd?: string,
): void {
  try {
    savePersistentSession(token, mode, expiresAt, stayEnd);
  } catch {}
}

function safelyClearSession(mode?: DataMode): void {
  const targetMode = mode ?? getDataMode();
  try {
    clearPersistentSession(targetMode);
  } catch {}
  try {
    window.sessionStorage?.removeItem(getSessionStorageKey(targetMode));
    window.sessionStorage?.removeItem(LEGACY_SESSION_STORAGE_KEY);
  } catch {}
}

function getServerStoredToken(): string | null {
  return null;
}

interface AuthContextType {
  status: AuthStatus;
  sessionToken: string | null;
  guest: GuestContext | null;
  expiresAt: string | null;
  error: string | null;
  demoTokens: Record<string, string>;
  loginWithQr: (qrToken: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialToken = useSyncExternalStore(subscribeStorage, getStoredToken, getServerStoredToken);
  const [explicitToken, setExplicitToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => (getStoredToken() ? 'loading' : 'idle'));
  const [guest, setGuest] = useState<GuestContext | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoTokens, setDemoTokens] = useState<Record<string, string>>({});

  // Generation counter to eliminate asynchronous race conditions
  const requestIdRef = useRef<number>(0);
  const skipHydrationReqIdRef = useRef<number | null>(null);

  const sessionToken = explicitToken ?? initialToken;

  useEffect(() => {
    const expire = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          token?: unknown;
          bookingId?: unknown;
          roomNumber?: unknown;
          sessionId?: unknown;
        }>
      ).detail;
      const token = detail?.token;
      if (!sessionToken || token !== sessionToken || status !== 'authenticated' || !guest) return;
      if (detail?.bookingId && guest.bookingId && detail.bookingId !== guest.bookingId) return;
      if (detail?.roomNumber && guest.roomNumber && detail.roomNumber !== guest.roomNumber) return;
      if (detail?.sessionId && guest.sessionId && detail.sessionId !== guest.sessionId) return;
      ++requestIdRef.current;
      skipHydrationReqIdRef.current = null;
      disconnectAllRealtimeClients();
      safelyClearSession();
      setExplicitToken(null);
      setGuest(null);
      setExpiresAt(null);
      setStatus('expired');
      setError('Your stay session has expired. Scan a fresh guest QR to continue.');
    };
    window.addEventListener(FOSS_SESSION_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(FOSS_SESSION_EXPIRED_EVENT, expire);
  }, [sessionToken, status, guest]);

  // Load demo tokens in background only in demo mode
  useEffect(() => {
    if (getDataMode() !== 'demo') {
      return;
    }
    const reqId = requestIdRef.current;
    fetchDemoTokens().then((tokens) => {
      if (reqId === requestIdRef.current && tokens && Object.keys(tokens).length > 0) {
        setDemoTokens(tokens);
      }
    });
  }, []);

  // Listen for data mode change events: invalidate in-flight requests, disconnect realtime, and reset state
  useEffect(() => {
    const handleModeChange = () => {
      const reqId = ++requestIdRef.current;
      disconnectAllRealtimeClients();
      setExplicitToken(null);
      setGuest(null);
      setExpiresAt(null);
      setError(null);
      setStatus('idle');

      // Re-read stored token for new mode
      const newStoredToken = getStoredToken();
      if (newStoredToken) {
        setExplicitToken(newStoredToken);
      }

      if (getDataMode() === 'demo') {
        fetchDemoTokens()
          .then((tokens) => {
            if (reqId === requestIdRef.current) {
              setDemoTokens(tokens || {});
            }
          })
          .catch(() => {});
      } else {
        setDemoTokens({});
      }
    };

    window.addEventListener(DATA_MODE_CHANGE_EVENT, handleModeChange);
    return () => window.removeEventListener(DATA_MODE_CHANGE_EVENT, handleModeChange);
  }, []);

  // Hydrate session if stored token was found
  useEffect(() => {
    if (!sessionToken) {
      return;
    }
    if (skipHydrationReqIdRef.current === requestIdRef.current) {
      return;
    }

    let isSubscribed = true;
    const currentReqId = ++requestIdRef.current;
    const effectiveToken = sessionToken === '__COOKIE_SESSION__' ? undefined : sessionToken;

    // Prefer stay-bounded renewal to support multi-day stays (> 24 hours) without re-scanning QR
    const restoreAction =
      typeof renewSession === 'function'
        ? Promise.resolve()
            .then(() => renewSession(effectiveToken))
            .catch(() => fetchCurrentSession(effectiveToken))
        : fetchCurrentSession(effectiveToken);

    restoreAction
      .then((result) => {
        if (!isSubscribed || currentReqId !== requestIdRef.current) return;
        const isRenewed = Boolean(
          result && typeof result === 'object' && 'sessionToken' in result && 'guest' in result,
        );
        const resObj = result as GuestSessionResponse &
          GuestContext & { sessionToken?: string; expiresAt?: string };
        const guestData: GuestContext = isRenewed ? resObj.guest : resObj;
        const token = resObj.sessionToken || effectiveToken || '__COOKIE_SESSION__';
        const expiry = resObj.expiresAt ?? null;

        setExplicitToken(token);
        setExpiresAt(expiry);
        setGuest({
          ...guestData,
          active: true,
        });
        safelySaveSession(token, getDataMode(), expiry || undefined, guestData.stayEnd);
        setStatus('authenticated');
        setError(null);
      })
      .catch((err) => {
        if (!isSubscribed || currentReqId !== requestIdRef.current) return;
        safelyClearSession();
        setExplicitToken(null);
        setGuest(null);
        setStatus('expired');
        setError(err instanceof Error ? err.message : 'Session expired or invalidated.');
      });

    return () => {
      isSubscribed = false;
    };
  }, [sessionToken]);

  const loginWithQr = useCallback(async (qrToken: string): Promise<boolean> => {
    const currentReqId = ++requestIdRef.current;
    disconnectAllRealtimeClients?.();
    setStatus('loading');
    setError(null);

    try {
      const response: GuestSessionResponse = await redeemQrToken(qrToken);
      if (currentReqId !== requestIdRef.current) {
        return false;
      }

      skipHydrationReqIdRef.current = currentReqId;
      setExplicitToken(response.sessionToken);
      setExpiresAt(response.expiresAt);
      setGuest({
        ...response.guest,
        active: true,
      });

      safelySaveSession(
        response.sessionToken,
        getDataMode(),
        response.expiresAt,
        response.guest?.stayEnd,
      );

      setStatus('authenticated');
      return true;
    } catch (err: unknown) {
      if (currentReqId !== requestIdRef.current) {
        return false;
      }
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to authenticate QR code. Please try again.';
      setError(errorMsg);
      setStatus('error');
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    ++requestIdRef.current;
    disconnectAllRealtimeClients?.();

    const tokenToRevoke = sessionToken === '__COOKIE_SESSION__' ? undefined : sessionToken;

    safelyClearSession();

    setExplicitToken(null);
    setGuest(null);
    setExpiresAt(null);
    setError(null);
    setStatus('idle');

    try {
      await logoutSession(tokenToRevoke || undefined);
    } catch {
      // Safe fail-closed logout
    }
  }, [sessionToken]);

  const clearError = useCallback(() => {
    setError(null);
    if (status === 'error' || status === 'expired') {
      setStatus('idle');
    }
  }, [status]);

  const refreshSession = useCallback(async () => {
    if (!sessionToken) return;
    const currentReqId = ++requestIdRef.current;
    const effectiveToken = sessionToken === '__COOKIE_SESSION__' ? undefined : sessionToken;

    try {
      const tryRenew =
        typeof renewSession === 'function'
          ? Promise.resolve()
              .then(() => renewSession(effectiveToken))
              .catch(() => null)
          : Promise.resolve(null);
      const renewed = await tryRenew;
      if (currentReqId !== requestIdRef.current) return;
      if (renewed) {
        setExplicitToken(renewed.sessionToken);
        setExpiresAt(renewed.expiresAt);
        setGuest({
          ...renewed.guest,
          active: true,
        });
        safelySaveSession(
          renewed.sessionToken,
          getDataMode(),
          renewed.expiresAt,
          renewed.guest?.stayEnd,
        );
        setStatus('authenticated');
        return;
      }
      const guestData = await fetchCurrentSession(effectiveToken);
      if (currentReqId !== requestIdRef.current) return;
      const token = (guestData as { sessionToken?: string }).sessionToken ?? effectiveToken;
      if (token) setExplicitToken(token);
      setGuest(guestData);
      setStatus('authenticated');
    } catch {
      if (currentReqId !== requestIdRef.current) return;
      safelyClearSession();
      setExplicitToken(null);
      setGuest(null);
      setStatus('expired');
      setError('Your stay session has expired or been checked out.');
    }
  }, [sessionToken]);

  return (
    <AuthContext.Provider
      value={{
        status,
        sessionToken,
        guest,
        expiresAt,
        error,
        demoTokens,
        loginWithQr,
        logout,
        clearError,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
