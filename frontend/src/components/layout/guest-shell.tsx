'use client';

import { Layout, Typography } from 'antd';
import type { PropsWithChildren } from 'react';

const { Header, Content, Footer } = Layout;

export function GuestShell({ children }: PropsWithChildren) {
  return (
    <Layout className="guest-shell">
      <Header className="guest-shell__header">
        <Typography.Title level={1} className="guest-shell__title">
          Forever Hotel
        </Typography.Title>
      </Header>

      <Content className="guest-shell__content">
        <main>{children}</main>
      </Content>

      <Footer className="guest-shell__footer">
        <Typography.Text>Forever Hotel Guest Services</Typography.Text>
      </Footer>
    </Layout>
  );
}
