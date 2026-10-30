'use client';

import React from 'react';
import { Button, Layout, Popconfirm, Tag, Typography } from 'antd';
import type { PropsWithChildren } from 'react';

import { useAuth } from '../../lib/auth/auth-context';
import { useNavigation } from '../../lib/navigation/navigation-context';
import { ErrorBoundary } from '../feedback/error-boundary';
import { OfflineBanner } from '../feedback/offline-banner';
import { MobileBottomNav } from './mobile-bottom-nav';

const { Header, Content, Footer } = Layout;

export function GuestShell({ children }: PropsWithChildren) {
  const { guest, status, logout } = useAuth();
  const { activeTab, pageHeader } = useNavigation();

  const isAuthenticated = status === 'authenticated' && !!guest;

  // Derive contextual subtitle based on active tab and guest details
  const derivedSubtitle = (() => {
    if (!guest) return 'In-Room Guest Services';
    if (pageHeader.subtitle) return pageHeader.subtitle;
    if (activeTab === 'menu') return `Room ${guest.roomNumber} · ${guest.guestName}`;
    if (activeTab === 'orders') return `Current stay — Room ${guest.roomNumber}`;
    if (activeTab === 'services') return `Room ${guest.roomNumber} — auto-attached`;
    if (activeTab === 'complaints') return `Room ${guest.roomNumber}`;
    return `Room ${guest.roomNumber}`;
  })();

  return (
    <Layout className="guest-shell min-h-screen !bg-slate-50 flex flex-col">
      {/* Skip to Content for Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Network Status Offline Banner */}
      <OfflineBanner />

      {/* Top Header - Dark Navy #1D3557 when authenticated per approved Figures 32, 36, 37, 38, 39 */}
      <Header
        className={`guest-shell__header !px-4 !h-16 flex items-center justify-between sticky top-0 z-50 shadow-sm transition-colors ${
          isAuthenticated
            ? '!bg-[#1D3557] !border-b !border-[#162A45]'
            : '!bg-white !border-b !border-slate-100'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isAuthenticated && pageHeader.showBackButton && pageHeader.onBack && (
            <button
              type="button"
              aria-label="Go back"
              onClick={pageHeader.onBack}
              className="touch-target w-9 h-9 rounded-lg flex items-center justify-center text-white hover:bg-white/10 active:scale-95 transition-all mr-1"
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

          {!isAuthenticated && <span className="text-xl">🏨</span>}

          <div className="flex flex-col min-w-0">
            <Typography.Title
              level={1}
              className={`guest-shell__title !mb-0 !text-base !font-bold leading-tight truncate ${
                isAuthenticated ? '!text-white' : '!text-[#1D3557]'
              }`}
            >
              {isAuthenticated ? pageHeader.title : 'Forever Hotel'}
            </Typography.Title>
            <span
              className={`text-xs leading-tight truncate ${
                isAuthenticated ? 'text-slate-200' : 'text-slate-500'
              }`}
            >
              {derivedSubtitle}
            </span>
          </div>
        </div>

        {isAuthenticated && guest && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Tag className="!bg-[#F5A623] !text-white !border-none !font-bold !px-2.5 !py-1 !text-xs !rounded-full shadow-xs">
              Rm {guest.roomNumber}
            </Tag>
            <Popconfirm
              title="Sign out of room session?"
              description="You will need to scan your room QR code again to access services."
              onConfirm={logout}
              okText="Sign out"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                size="small"
                aria-label="Sign out"
                className="text-xs text-slate-300 hover:text-white hover:bg-white/10 !px-2 !py-1"
              >
                Sign out
              </Button>
            </Popconfirm>
          </div>
        )}
      </Header>

      {/* Main Content with Error Boundary */}
      <Content className="guest-shell__content flex-1 w-full max-w-md mx-auto p-4 flex flex-col justify-start">
        <ErrorBoundary>
          <main id="main-content" className="w-full">
            {children}
          </main>
        </ErrorBoundary>
      </Content>

      {/* Mobile Bottom Navigation for Authenticated Guest */}
      {isAuthenticated && <MobileBottomNav />}

      {/* Footer when unauthenticated */}
      {!isAuthenticated && (
        <Footer className="guest-shell__footer !bg-transparent !py-4 text-center">
          <Typography.Text type="secondary" className="text-xs">
            Forever Hotel FOSS — In-Room Guest Services
          </Typography.Text>
        </Footer>
      )}
    </Layout>
  );
}
