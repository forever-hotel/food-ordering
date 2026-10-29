'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert } from 'antd';

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getOnlineSnapshot(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

function getServerOnlineSnapshot(): boolean {
  return true;
}

export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getServerOnlineSnapshot,
  );
  const isOffline = !isOnline;
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => {
      setJustReconnected(true);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        setJustReconnected(false);
      }, 4000);
    };

    window.addEventListener('online', handleOnline);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
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
          title="You are currently offline"
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
          title="Back online"
          description="Connection restored. Ready to order and request services."
        />
      </div>
    );
  }

  return null;
}
