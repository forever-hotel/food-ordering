'use client';

import React, { useSyncExternalStore } from 'react';
import { Button, Dropdown, Space, Tag, message } from 'antd';
import {
  getDataMode,
  isDemoAllowed,
  isProduction,
  setDataMode,
  type DataMode,
  DATA_MODE_CHANGE_EVENT,
} from '@/lib/data-mode/data-mode';
import { DemoStateStore, DEMO_STAYS } from '@/lib/data-mode/demo/demo-state-store';
import { useAuth } from '@/lib/auth/auth-context';

function subscribeToDataMode(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(DATA_MODE_CHANGE_EVENT, callback);
  return () => window.removeEventListener(DATA_MODE_CHANGE_EVENT, callback);
}

export function DemoModeToolbar() {
  const [messageApi, contextHolder] = message.useMessage();

  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const mode = useSyncExternalStore(
    subscribeToDataMode,
    () => getDataMode(),
    () => 'api',
  );

  const { guest, loginWithQr, logout } = useAuth();

  // Strict multi-tier deployment safety: never render in staging or production builds
  if (!isMounted || !isDemoAllowed() || isProduction()) {
    return null;
  }

  const handleToggleMode = () => {
    const nextMode: DataMode = mode === 'demo' ? 'api' : 'demo';
    setDataMode(nextMode);
    messageApi.info(`Switched to ${nextMode.toUpperCase()} Mode`);
    window.location.reload();
  };

  const handleResetDemo = () => {
    DemoStateStore.getInstance().reset();
    messageApi.success('Demo state reset to initial fixtures.');
    window.location.reload();
  };

  const handleSelectStay = async (shortCode: string) => {
    const stay = DEMO_STAYS.find((s) => s.shortCode === shortCode);
    if (!stay) return;

    if (stay.isExpired) {
      await logout();
      messageApi.warning('Switched to Expired Session demo state.');
      return;
    }

    const success = await loginWithQr(stay.qrToken);
    if (success) {
      messageApi.success(`Logged into Room ${stay.roomNumber} (${stay.guestName})`);
    }
  };

  const roomMenuItems = DEMO_STAYS.map((stay) => ({
    key: stay.shortCode,
    label: (
      <span>
        <strong>Room {stay.roomNumber}</strong> — {stay.guestName}{' '}
        {stay.isExpired && <Tag color="error">Expired</Tag>}
      </span>
    ),
    onClick: () => handleSelectStay(stay.shortCode),
  }));

  return (
    <>
      {contextHolder}
      <aside
        aria-label="Development Data Mode Toolbar"
        className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 bg-slate-900/90 text-white backdrop-blur-md rounded-full shadow-lg border border-slate-700/80 flex items-center gap-2 text-xs select-none max-w-[95vw] overflow-x-auto"
      >
        <Tag
          color={mode === 'demo' ? 'gold' : 'blue'}
          className="!m-0 !font-semibold !px-2 !rounded-full !text-[10px]"
        >
          {mode === 'demo' ? '🎭 DEMO MODE' : '🌐 API MODE'}
        </Tag>

        {mode === 'demo' && (
          <>
            <Dropdown menu={{ items: roomMenuItems }} placement="top" arrow>
              <Button
                type="text"
                size="small"
                className="!text-slate-200 !text-xs !h-6 !px-2 hover:!text-white hover:!bg-slate-800 !rounded-full"
              >
                <Space orientation="horizontal" size={4}>
                  <span>Stay: {guest ? `Rm ${guest.roomNumber}` : 'None'}</span>
                  <span className="text-[10px] text-slate-400">▾</span>
                </Space>
              </Button>
            </Dropdown>

            <Button
              type="text"
              size="small"
              onClick={handleResetDemo}
              className="!text-amber-300 !text-xs !h-6 !px-2 hover:!text-amber-200 hover:!bg-slate-800 !rounded-full"
            >
              Reset
            </Button>
          </>
        )}

        <Button
          type="text"
          size="small"
          onClick={handleToggleMode}
          className="!text-slate-300 !text-xs !h-6 !px-2 hover:!text-white hover:!bg-slate-800 !rounded-full"
        >
          Switch to {mode === 'demo' ? 'API' : 'Demo'}
        </Button>
      </aside>
    </>
  );
}
