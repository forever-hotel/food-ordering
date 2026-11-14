import type { Metadata } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';

import { AntdRegistry } from '@ant-design/nextjs-registry';

import { GuestShell } from '@/components/layout/guest-shell';
import { AppProviders } from '@/providers/app-providers';

import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Forever Hotel Guest App',
  description: 'Forever Hotel guest food ordering and service requests',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AntdRegistry>
          <AppProviders>
            <GuestShell>{children}</GuestShell>
          </AppProviders>
        </AntdRegistry>
      </body>
    </html>
  );
}
