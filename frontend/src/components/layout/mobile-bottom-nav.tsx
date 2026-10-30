'use client';

import React, { useCallback, useRef } from 'react';

import { useNavigation, type NavTabId } from '../../lib/navigation/navigation-context';

interface TabItem {
  id: NavTabId;
  label: string;
  ariaLabel: string;
  icon: React.ReactNode;
}

const TABS: TabItem[] = [
  {
    id: 'menu',
    label: 'Menu',
    ariaLabel: 'In-Room Dining Menu',
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 2v20" />
        <path d="M4 2v4a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3V2" />
        <path d="M7 2v20" />
      </svg>
    ),
  },
  {
    id: 'orders',
    label: 'Orders',
    ariaLabel: 'Order History and Tracking',
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    id: 'services',
    label: 'Service',
    ariaLabel: 'Housekeeping and Service Requests',
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    id: 'complaints',
    label: 'Complaints',
    ariaLabel: 'Guest Complaints and Management Feedback',
    icon: (
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M12 8v3" />
        <path d="M12 14h.01" />
      </svg>
    ),
  },
];

export function MobileBottomNav() {
  const { activeTab, setActiveTab } = useNavigation();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let nextIndex = index;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (index + 1) % TABS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (index - 1 + TABS.length) % TABS.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = TABS.length - 1;
      } else {
        return;
      }

      const nextTab = TABS[nextIndex];
      setActiveTab(nextTab.id);
      tabRefs.current[nextTab.id]?.focus();
    },
    [setActiveTab],
  );

  return (
    <nav
      role="tablist"
      aria-label="Guest Services Navigation"
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200/90 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]"
    >
      <div className="w-full max-w-md mx-auto px-2 py-1.5 pb-safe flex items-center justify-around">
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`nav-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              aria-label={tab.ariaLabel}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`touch-target flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-1.5 transition-all focus-visible:outline-2 focus-visible:outline-[#1D3557] focus-visible:outline-offset-1 select-none ${
                isActive
                  ? 'bg-[#1D3557] text-white shadow-xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 active:scale-95'
              }`}
            >
              <span className={`transition-transform ${isActive ? 'scale-105' : ''}`}>
                {tab.icon}
              </span>
              <span className="text-[11px] leading-none tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
