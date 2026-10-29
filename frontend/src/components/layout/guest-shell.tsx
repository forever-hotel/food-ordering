'use client';

import React from 'react';
import { Button, Layout, Tag, Typography } from 'antd';
import type { PropsWithChildren } from 'react';

import { useAuth } from '../../lib/auth/auth-context';

const { Header, Content, Footer } = Layout;

export function GuestShell({ children }: PropsWithChildren) {
  const { guest, logout } = useAuth();

  return (
    <Layout className="guest-shell min-h-screen !bg-slate-50 flex flex-col">
      <Header className="guest-shell__header !bg-white !border-b !border-slate-100 !px-4 !h-14 flex items-center justify-between sticky top-0 z-50 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏨</span>
          <Typography.Title
            level={1}
            className="guest-shell__title !mb-0 !text-base !font-bold !text-[#1D3557]"
          >
            Forever Hotel
          </Typography.Title>
        </div>

        {guest && (
          <div className="flex items-center gap-2">
            <Tag color="#1D3557" className="font-semibold !px-2.5 !py-0.5">
              Room {guest.roomNumber}
            </Tag>
            <Button
              type="text"
              size="small"
              onClick={logout}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Sign out
            </Button>
          </div>
        )}
      </Header>

      <Content className="guest-shell__content flex-1 w-full max-w-md mx-auto p-4 flex flex-col justify-center">
        <main className="w-full">{children}</main>
      </Content>

      <Footer className="guest-shell__footer !bg-transparent !py-4 text-center">
        <Typography.Text type="secondary" className="text-xs">
          Forever Hotel FOSS — In-Room Guest Services
        </Typography.Text>
      </Footer>
    </Layout>
  );
}
