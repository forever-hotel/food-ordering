'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import {
  fetchCurrentSession,
  fetchDemoTokens,
  logoutSession,
  redeemQrToken,
} from '../api/guest-sessions';
import type { AuthStatus, GuestContext, GuestSessionResponse } from '../../types/guest-session';

const SESSION_STORAGE_KEY = 'foss_guest_session_token';

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
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    }
    return null;
  });

  const [status, setStatus] = useState<AuthStatus>(() => {
    if (typeof window !== 'undefined') {
      const token = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (token) return 'loading';
    }
    return 'idle';
  });

  const [guest, setGuest] = useState<GuestContext | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoTokens, setDemoTokens] = useState<Record<string, string>>({});

  // Load demo tokens in background
  useEffect(() => {
    fetchDemoTokens().then((tokens) => {
      if (tokens && Object.keys(tokens).length > 0) {
        setDemoTokens(tokens);
      }
    });
  }, []);

  // Hydrate session if stored token was found
  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    fetchCurrentSession(sessionToken)
      .then((guestData) => {
        setGuest(guestData);
        setStatus('authenticated');
      })
      .catch((err) => {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
        setSessionToken(null);
        setGuest(null);
        setStatus('expired');
        setError(err instanceof Error ? err.message : 'Session expired or invalidated.');
      });
  }, [sessionToken]);

  const loginWithQr = useCallback(async (qrToken: string): Promise<boolean> => {
    setStatus('loading');
    setError(null);

    try {
      const response: GuestSessionResponse = await redeemQrToken(qrToken);
      setSessionToken(response.sessionToken);
      setExpiresAt(response.expiresAt);
      setGuest({
        ...response.guest,
        active: true,
      });

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, response.sessionToken);
      }

      setStatus('authenticated');
      return true;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to authenticate QR code. Please try again.';
      setError(errorMsg);
      setStatus('error');
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    if (sessionToken) {
      try {
        await logoutSession(sessionToken);
      } catch {
        // Safe fail-closed logout
      }
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }

    setSessionToken(null);
    setGuest(null);
    setExpiresAt(null);
    setError(null);
    setStatus('idle');
  }, [sessionToken]);

  const clearError = useCallback(() => {
    setError(null);
    if (status === 'error' || status === 'expired') {
      setStatus('idle');
    }
  }, [status]);

  const refreshSession = useCallback(async () => {
    if (!sessionToken) return;

    try {
      const guestData = await fetchCurrentSession(sessionToken);
      setGuest(guestData);
      setStatus('authenticated');
    } catch {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
      setSessionToken(null);
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
