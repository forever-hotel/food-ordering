'use client';

import React from 'react';
import { Spin } from 'antd';

import { useAuth } from '@/lib/auth/auth-context';
import { useNavigation } from '@/lib/navigation/navigation-context';
import { QrScanCard } from '@/features/auth/components/qr-scan-card';
import { MenuTab } from '@/features/menu/components/menu-tab';
import { OrdersTab } from '@/features/orders/components/orders-tab';
import { ServicesTab } from '@/features/services/components/services-tab';
import { ComplaintsTab } from '@/features/complaints/components/complaints-tab';

export default function HomePage() {
  const { status } = useAuth();
  const { activeTab } = useNavigation();

  if (status === 'loading') {
    return (
      <div
        className="flex flex-col items-center justify-center py-20"
        role="status"
        aria-live="polite"
      >
        <Spin size="large" />
        <span className="mt-4 text-sm text-slate-500 font-medium">
          Verifying guest stay session...
        </span>
      </div>
    );
  }

  if (status === 'authenticated') {
    switch (activeTab) {
      case 'menu':
        return <MenuTab />;
      case 'orders':
        return <OrdersTab />;
      case 'services':
        return <ServicesTab />;
      case 'complaints':
        return <ComplaintsTab />;
      default:
        return <MenuTab />;
    }
  }

  return <QrScanCard />;
}
