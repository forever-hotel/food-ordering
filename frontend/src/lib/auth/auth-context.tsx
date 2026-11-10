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
} from '../api/guest-sessions.ts';
import type { AuthStatus, GuestContext, GuestSessionResponse } from '../../types/guest-session.ts';
import {
  getDataMode,
  getSessionStorageKey,
  DATA_MODE_CHANGE_EVENT,
  LEGACY_SESSION_STORAGE_KEY,
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
    const partitionedKey = getSessionStorageKey(mode);
    const token = window.sessionStorage.getItem(partitionedKey);
    if (token) return token;

    // Check legacy unpartitioned key only if valid for mode
    const legacy = window.sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
    if (legacy) {
      const isDemoToken = legacy.startsWith('demo-token-');
      if ((mode === 'demo' && isDemoToken) || (mode === 'api' && !isDemoToken)) {
        window.sessionStorage.setItem(partitionedKey, legacy);
        window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
        return legacy;
      }
    }
    return null;
  } catch {
    return null;
  }
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

  const sessionToken = explicitToken ?? initialToken;

  useEffect(() => {
    const expire = (event: Event) => {
      const token = (event as CustomEvent<{ token?: unknown }>).detail?.token;
      if (!sessionToken || token !== sessionToken) return;
      ++requestIdRef.current;
      disconnectAllRealtimeClients();
      window.sessionStorage.removeItem(getSessionStorageKey(getDataMode()));
      window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      setExplicitToken(null);
      setGuest(null);
      setExpiresAt(null);
      setStatus('expired');
      setError('Your stay session has expired. Scan a fresh guest QR to continue.');
    };
    window.addEventListener(FOSS_SESSION_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(FOSS_SESSION_EXPIRED_EVENT, expire);
  }, [sessionToken]);

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

    const currentReqId = ++requestIdRef.current;

    fetchCurrentSession(sessionToken)
      .then((guestData) => {
        if (currentReqId !== requestIdRef.current) {
          // Stale hydration cancelled by subsequent user action
          return;
        }
        setGuest(guestData);
        setStatus('authenticated');
        setError(null);
      })
      .catch((err) => {
        if (currentReqId !== requestIdRef.current) {
          return;
        }
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(getSessionStorageKey(getDataMode()));
        }
        setExplicitToken(null);
        setGuest(null);
        setStatus('expired');
        setError(err instanceof Error ? err.message : 'Session expired or invalidated.');
      });
  }, [sessionToken]);

  const loginWithQr = useCallback(async (qrToken: string): Promise<boolean> => {
    const currentReqId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);

    try {
      const response: GuestSessionResponse = await redeemQrToken(qrToken);
      if (currentReqId !== requestIdRef.current) {
        return false;
      }

      setExplicitToken(response.sessionToken);
      setExpiresAt(response.expiresAt);
      setGuest({
        ...response.guest,
        active: true,
      });

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(getSessionStorageKey(getDataMode()), response.sessionToken);
      }

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
    disconnectAllRealtimeClients();

    const tokenToRevoke = sessionToken;

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(getSessionStorageKey(getDataMode()));
      window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    }

    setExplicitToken(null);
    setGuest(null);
    setExpiresAt(null);
    setError(null);
    setStatus('idle');

    if (tokenToRevoke) {
      try {
        await logoutSession(tokenToRevoke);
      } catch {
        // Safe fail-closed logout
      }
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

    try {
      const guestData = await fetchCurrentSession(sessionToken);
      if (currentReqId !== requestIdRef.current) return;
      setGuest(guestData);
      setStatus('authenticated');
    } catch {
      if (currentReqId !== requestIdRef.current) return;
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(getSessionStorageKey(getDataMode()));
      }
      setExplicitToken(null);
      setGuest(null);
      setStatus('expired');
      setError('Your stay session has expired or been checked out.');
    }
  }, [sessionToken]);

  const computedStatus = sessionToken && !guest && status === 'idle' ? 'loading' : status;

  return (
    <AuthContext.Provider
      value={{
        status: computedStatus,
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
