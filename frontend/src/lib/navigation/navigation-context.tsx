'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type NavTabId = 'menu' | 'orders' | 'services' | 'complaints';

export interface PageHeaderConfig {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBack?: (() => void) | null;
  hideHeader?: boolean;
  hideBottomNav?: boolean;
}

interface NavigationContextType {
  activeTab: NavTabId;
  pageHeader: PageHeaderConfig;
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
  setActiveTab: (tab: NavTabId, options?: { keepSelectedOrder?: boolean }) => void;
  setPageHeader: (config: PageHeaderConfig) => void;
  resetHeaderForTab: (tab: NavTabId, roomNumber?: string, guestName?: string) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

const DEFAULT_TITLES: Record<NavTabId, { title: string; subtitlePrefix: string }> = {
  menu: { title: 'Order Food', subtitlePrefix: 'In-Room Dining' },
  orders: { title: 'Order History', subtitlePrefix: 'Current stay' },
  services: { title: 'Service Request', subtitlePrefix: 'Guest services' },
  complaints: { title: 'File a Complaint', subtitlePrefix: 'Direct to management' },
};

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTabState] = useState<NavTabId>('menu');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [pageHeader, setPageHeaderState] = useState<PageHeaderConfig>({
    title: DEFAULT_TITLES.menu.title,
    subtitle: DEFAULT_TITLES.menu.subtitlePrefix,
    showBackButton: false,
    onBack: null,
  });

  const setPageHeader = useCallback((config: PageHeaderConfig) => {
    setPageHeaderState((prev) => {
      if (
        prev.title === config.title &&
        prev.subtitle === config.subtitle &&
        prev.showBackButton === config.showBackButton &&
        prev.onBack === config.onBack &&
        prev.hideHeader === config.hideHeader &&
        prev.hideBottomNav === config.hideBottomNav
      ) {
        return prev;
      }
      return config;
    });
  }, []);

  const resetHeaderForTab = useCallback(
    (tab: NavTabId, roomNumber?: string, guestName?: string) => {
      const config = DEFAULT_TITLES[tab];
      let subtitle = config.subtitlePrefix;

      if (roomNumber && guestName) {
        if (tab === 'menu') {
          subtitle = `Room ${roomNumber} · ${guestName}`;
        } else if (tab === 'orders') {
          subtitle = `Current stay — Room ${roomNumber}`;
        } else if (tab === 'services') {
          subtitle = `Room ${roomNumber} — auto-attached`;
        } else if (tab === 'complaints') {
          subtitle = `Room ${roomNumber}`;
        }
      } else if (roomNumber) {
        subtitle = `Room ${roomNumber}`;
      }

      setPageHeader({
        title: config.title,
        subtitle,
        showBackButton: false,
        onBack: null,
        hideHeader: false,
        hideBottomNav: false,
      });
    },
    [setPageHeader],
  );

  const setActiveTab = useCallback(
    (tab: NavTabId, options?: { keepSelectedOrder?: boolean }) => {
      setActiveTabState(tab);
      resetHeaderForTab(tab);
      if (!options?.keepSelectedOrder) {
        setSelectedOrderId(null);
      }
    },
    [resetHeaderForTab],
  );

  const value = useMemo(
    () => ({
      activeTab,
      pageHeader,
      selectedOrderId,
      setSelectedOrderId,
      setActiveTab,
      setPageHeader,
      resetHeaderForTab,
    }),
    [activeTab, pageHeader, selectedOrderId, setActiveTab, setPageHeader, resetHeaderForTab],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextType {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
