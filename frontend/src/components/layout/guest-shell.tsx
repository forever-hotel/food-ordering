'use client';

import React from 'react';
import { Layout, Popconfirm, Tag } from 'antd';
import type { PropsWithChildren } from 'react';

import { useAuth } from '../../lib/auth/auth-context';
import { useNavigation } from '../../lib/navigation/navigation-context';
import { ErrorBoundary } from '../feedback/error-boundary';
import { OfflineBanner } from '../feedback/offline-banner';
import { MobileBottomNav } from './mobile-bottom-nav';

const { Header, Content } = Layout;

export function GuestShell({ children }: PropsWithChildren) {
  const { guest, status, logout } = useAuth();
  const { activeTab, pageHeader } = useNavigation();

  const isAuthenticated = status === 'authenticated' && !!guest;

  // Derive contextual subtitle based on active tab and guest details matching Figures 32, 37, 38, 39
  const derivedSubtitle = (() => {
    if (!guest) return 'In-Room Guest Services';
    if (pageHeader.subtitle) return pageHeader.subtitle;
    if (activeTab === 'menu') return `Room ${guest.roomNumber} · ${guest.guestName}`;
    if (activeTab === 'orders') return `Current stay — Room ${guest.roomNumber}`;
    if (activeTab === 'services') return `Room ${guest.roomNumber} — auto-attached`;
    if (activeTab === 'complaints') return `Room ${guest.roomNumber}`;
    return `Room ${guest.roomNumber}`;
  })();

  const showHeader = isAuthenticated && !pageHeader.hideHeader;
  const showBottomNav = isAuthenticated && !pageHeader.hideBottomNav;

  return (
    <Layout className="guest-shell min-h-screen !bg-[#F8FAFC] flex flex-col">
      {/* Skip to Content for Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Network Status Offline Banner */}
      <OfflineBanner />

      {/* Top Header - Dark Navy #1D3557 when authenticated per approved Figures 32, 36, 37, 38, 39 */}
      {showHeader && (
        <Header className="guest-shell__header !px-4 !h-16 flex items-center justify-between sticky top-0 z-50 shadow-sm !bg-[#1D3557] !border-b !border-[#162A45]">
          <div className="flex items-center gap-2.5 min-w-0">
            {pageHeader.showBackButton && pageHeader.onBack && (
              <button
                type="button"
                aria-label="Go back"
                onClick={pageHeader.onBack}
                className="touch-target w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition-all mr-1"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            )}

            <div className="flex flex-col min-w-0">
              <h1 className="guest-shell__title !m-0 !text-base !font-bold leading-tight truncate !text-white">
                {pageHeader.title}
              </h1>
              <span className="text-xs leading-tight truncate text-slate-200">
                {derivedSubtitle}
              </span>
            </div>
          </div>

          {guest && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Popconfirm
                title="Sign out of room session?"
                description="You will need to scan your room QR code again to access services."
                onConfirm={logout}
                okText="Sign out"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Tag
                  role="button"
                  tabIndex={0}
                  aria-label={`Room ${guest.roomNumber}. Click to sign out.`}
                  className="!bg-[#F5A623] !text-white !border-none !font-bold !px-3 !py-1 !text-xs !rounded-full shadow-xs cursor-pointer select-none hover:opacity-90 active:scale-95 transition-all"
                >
                  Rm {guest.roomNumber}
                </Tag>
              </Popconfirm>
            </div>
          )}
        </Header>
      )}

      {/* Main Content with Error Boundary */}
      <Content
        className={`guest-shell__content flex-1 w-full max-w-md mx-auto flex flex-col justify-start ${
          showHeader ? 'p-4' : 'p-0'
        }`}
      >
        <ErrorBoundary>
          <main id="main-content" className="w-full">
            {children}
          </main>
        </ErrorBoundary>
      </Content>

      {/* Mobile Bottom Navigation for Authenticated Guest */}
      {showBottomNav && <MobileBottomNav />}
    </Layout>
  );
}
