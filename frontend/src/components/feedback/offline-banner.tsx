'use client';

import React, { useEffect, useState } from 'react';
import { Alert } from 'antd';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined') {
      return !navigator.onLine;
    }
    return false;
  });
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOffline = () => {
      setIsOffline(true);
      setJustReconnected(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setJustReconnected(true);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        setJustReconnected(false);
      }, 4000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (isOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-16 z-40 w-full max-w-md mx-auto px-4 pt-2"
      >
        <Alert
          type="warning"
          showIcon
          banner
          className="!rounded-xl !border-amber-200 !bg-amber-50 text-xs font-medium text-amber-900 shadow-sm"
          message="You are currently offline"
          description="Check your internet connection. In-room dining and service requests will resume once reconnected."
        />
      </div>
    );
  }

  if (justReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-16 z-40 w-full max-w-md mx-auto px-4 pt-2"
      >
        <Alert
          type="success"
          showIcon
          banner
          className="!rounded-xl !border-emerald-200 !bg-emerald-50 text-xs font-medium text-emerald-900 shadow-sm"
          message="Back online"
          description="Connection restored. Ready to order and request services."
        />
      </div>
    );
  }

  return null;
}
