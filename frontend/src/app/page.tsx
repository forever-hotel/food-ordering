'use client';

import React from 'react';
import { Spin } from 'antd';

import { useAuth } from '@/lib/auth/auth-context';
import { QrScanCard } from '@/features/auth/components/qr-scan-card';
import { ActiveSessionView } from '@/features/guest/components/active-session-view';

export default function HomePage() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Spin size="large" />
        <span className="mt-4 text-sm text-slate-500 font-medium">
          Verifying guest stay session...
        </span>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <ActiveSessionView />;
  }

  return <QrScanCard />;
}
