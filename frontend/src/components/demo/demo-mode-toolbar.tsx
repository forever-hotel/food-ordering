'use client';

import React, { useSyncExternalStore } from 'react';
import { Button, Dropdown, Space, Tag, message } from 'antd';
import { getDataMode, isDemoAllowed, isProduction } from '@/lib/data-mode/data-mode';
import { useAuth } from '@/lib/auth/auth-context';
import { resetBackendDemo } from '@/lib/api/guest-sessions';

export function DemoModeToolbar() {
  const [messageApi, contextHolder] = message.useMessage();
  const [expanded, setExpanded] = React.useState(false);

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const { guest, demoTokens, loginWithQr, logout } = useAuth();

  // Strict multi-tier deployment safety: never render in staging or production builds
  if (!isMounted || !isDemoAllowed() || isProduction()) {
    return null;
  }

  const mode = getDataMode();
  const isMockMode = mode === 'demo';

  const handleResetDemo = async () => {
    try {
      await resetBackendDemo();
      messageApi.success(
        isMockMode
          ? 'In-memory demo state reset to initial fixtures.'
          : 'Demo state reset complete.',
      );
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset demo state';
      messageApi.error(msg);
    }
  };

  const handleSelectStay = async (label: string, token: string) => {
    try {
      const isExpiredScenario = label.toLowerCase().includes('expired');
      const success = await loginWithQr(token);
      if (success) {
        messageApi.success(`Logged into ${label}`);
      } else if (isExpiredScenario) {
        messageApi.warning('Session rejected as expired (expected).');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to authenticate stay';
      messageApi.error(msg);
    }
  };

  // Convert demo tokens from in-memory mock store into menu items (operational ONLY in mock mode)
  const stayEntries = Object.entries(demoTokens).filter(([key]) => key.startsWith('Room '));
  const roomMenuItems = stayEntries.map(([label, token]) => {
    const isExpired = label.toLowerCase().includes('expired');
    return {
      key: label,
      label: (
        <span>
          <strong>{label}</strong> {isExpired && <Tag color="error">Expired</Tag>}
        </span>
      ),
      onClick: () => handleSelectStay(label, token),
    };
  });

  if (!expanded) {
    return (
      <aside className="fixed top-2 right-2 z-50 pointer-events-auto">
        <button
          type="button"
          aria-label="Toggle developer toolbar"
          onClick={() => setExpanded(true)}
          className="opacity-30 hover:opacity-100 transition-opacity bg-slate-900/80 text-[10px] text-blue-300 px-2 py-0.5 rounded-full border border-slate-700/80 shadow-xs"
        >
          ⚙️ Dev
        </button>
      </aside>
    );
  }

  return (
    <>
      {contextHolder}
      <aside
        aria-label="Development Toolbar"
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 bg-slate-900/95 text-white backdrop-blur-md rounded-full shadow-xl border border-slate-700 flex items-center gap-2 text-xs select-none max-w-[95vw] overflow-x-auto"
      >
        <Tag
          color={isMockMode ? 'gold' : 'blue'}
          className="!m-0 !font-semibold !px-2 !rounded-full !text-[10px]"
        >
          {isMockMode ? '🎨 MOCK DEMO' : '🌐 LIVE API'}
        </Tag>

        {isMockMode && roomMenuItems.length > 0 ? (
          <Dropdown menu={{ items: roomMenuItems }} placement="top" arrow>
            <Button
              type="text"
              size="small"
              className="!text-slate-200 !text-xs !h-6 !px-2 hover:!text-white hover:!bg-slate-800 !rounded-full"
            >
              <Space orientation="horizontal" size={4}>
                <span>
                  Stay: {guest ? `Rm ${guest.roomNumber} (${guest.guestName})` : 'Select Mock Stay'}
                </span>
                <span className="text-[10px] text-slate-400">▾</span>
              </Space>
            </Button>
          </Dropdown>
        ) : (
          <span className="text-slate-300 text-xs px-2">
            Stay: {guest ? `Rm ${guest.roomNumber} (${guest.guestName})` : 'QR Scan Required'}
          </span>
        )}

        {guest && (
          <Button
            type="text"
            size="small"
            onClick={logout}
            className="!text-slate-300 !text-xs !h-6 !px-2 hover:!text-white hover:!bg-slate-800 !rounded-full"
          >
            Logout
          </Button>
        )}

        {isMockMode && (
          <Button
            type="text"
            size="small"
            onClick={handleResetDemo}
            className="!text-amber-300 !text-xs !h-6 !px-2 hover:!text-amber-200 hover:!bg-slate-800 !rounded-full"
          >
            Reset Demo
          </Button>
        )}

        <button
          type="button"
          aria-label="Close developer toolbar"
          onClick={() => setExpanded(false)}
          className="text-slate-400 hover:text-white ml-1 px-1.5 py-0.5 rounded-full hover:bg-white/10"
        >
          ✕
        </button>
      </aside>
    </>
  );
}
