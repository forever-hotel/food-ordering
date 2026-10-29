'use client';

import React, { useState } from 'react';
import { Alert, Button, Card, Divider, Typography } from 'antd';

import { useAuth } from '../../../lib/auth/auth-context';
import { ManualEntryForm } from './manual-entry-form';
import { QrScannerModal } from './qr-scanner-modal';

const { Title, Paragraph, Text } = Typography;

export function QrScanCard() {
  const { status, error, demoTokens, loginWithQr, clearError } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleScan = async (scannedToken: string) => {
    await loginWithQr(scannedToken);
  };

  const handleManualSubmit = async (code: string) => {
    await loginWithQr(code);
  };

  const isExpired = status === 'expired';
  const isError = status === 'error';
  const isLoading = status === 'loading';

  return (
    <div className="w-full max-w-[390px] mx-auto px-4 py-6 flex flex-col items-center">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <Text className="text-xs font-bold tracking-[0.25em] text-slate-500 uppercase block">
          FOREVER HOTEL
        </Text>
      </div>

      {/* Main Card */}
      <Card
        className="w-full !rounded-2xl !shadow-sm !border-slate-100 !bg-white overflow-hidden text-center"
        styles={{ body: { padding: '24px 20px' } }}
      >
        {/* Error / Expired Banner */}
        {(isExpired || isError) && error && (
          <div className="mb-5 text-left">
            <Alert
              type={isExpired ? 'warning' : 'error'}
              showIcon
              closable
              onClose={clearError}
              message={isExpired ? 'Session Expired' : 'Authentication Failed'}
              description={error}
              className="text-xs"
            />
          </div>
        )}

        {/* Stylized QR Card Graphic with Gold Corner Brackets */}
        <div className="relative w-44 h-44 mx-auto mb-6 flex items-center justify-center p-4 bg-white rounded-xl">
          {/* Gold / Warm Corner Brackets */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Top-left */}
            <span className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-[#D4AF37] rounded-tl-sm" />
            {/* Top-right */}
            <span className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-[#D4AF37] rounded-tr-sm" />
            {/* Bottom-left */}
            <span className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-[#D4AF37] rounded-bl-sm" />
            {/* Bottom-right */}
            <span className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-[#D4AF37] rounded-br-sm" />
          </div>

          {/* Stylized QR Code SVG graphic */}
          <svg
            className="w-32 h-32 text-[#1D3557]"
            viewBox="0 0 100 100"
            fill="currentColor"
            aria-hidden="true"
          >
            {/* Corner position squares */}
            <rect x="10" y="10" width="24" height="24" rx="3" />
            <rect x="14" y="14" width="16" height="16" rx="2" fill="white" />
            <rect x="18" y="18" width="8" height="8" rx="1" />

            <rect x="66" y="10" width="24" height="24" rx="3" />
            <rect x="70" y="14" width="16" height="16" rx="2" fill="white" />
            <rect x="74" y="18" width="8" height="8" rx="1" />

            <rect x="10" y="66" width="24" height="24" rx="3" />
            <rect x="14" y="70" width="16" height="16" rx="2" fill="white" />
            <rect x="18" y="74" width="8" height="8" rx="1" />

            {/* Inner dynamic data blocks */}
            <rect x="42" y="12" width="6" height="6" rx="1" />
            <rect x="52" y="12" width="6" height="6" rx="1" />
            <rect x="42" y="24" width="16" height="6" rx="1" />

            <rect x="12" y="44" width="6" height="12" rx="1" />
            <rect x="24" y="44" width="12" height="6" rx="1" />
            <rect x="42" y="38" width="8" height="8" rx="1.5" />
            <rect x="54" y="38" width="8" height="8" rx="1.5" />
            <rect x="46" y="50" width="16" height="6" rx="1" />

            <rect x="68" y="44" width="8" height="8" rx="1" />
            <rect x="80" y="44" width="8" height="8" rx="1" />
            <rect x="68" y="56" width="20" height="6" rx="1" />

            <rect x="42" y="68" width="6" height="18" rx="1" />
            <rect x="52" y="68" width="16" height="6" rx="1" />
            <rect x="52" y="78" width="8" height="8" rx="1" />
            <rect x="64" y="78" width="12" height="8" rx="1" />
          </svg>
        </div>

        {/* Headings */}
        <Title level={2} className="!text-[22px] !font-bold !text-[#1E293B] !mb-2 !mt-0">
          Scan Room QR Code
        </Title>
        <Paragraph className="!text-slate-500 !text-sm !mb-6 max-w-[280px] mx-auto leading-relaxed">
          Point your camera at the QR on your room desk to begin
        </Paragraph>

        {/* Primary Action Button: Open Camera */}
        <Button
          type="primary"
          size="large"
          loading={isLoading}
          onClick={() => setScannerOpen(true)}
          className="w-full !h-12 !rounded-xl !bg-[#1D3557] hover:!bg-[#162a45] !font-semibold !text-base shadow-sm flex items-center justify-center gap-2 mb-4"
        >
          {/* Camera SVG icon */}
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Open Camera
        </Button>

        {/* Divider with 'or' */}
        <Divider className="!my-4 !text-xs !text-slate-400 !font-normal">or</Divider>

        {/* Secondary Manual Entry */}
        <ManualEntryForm
          loading={isLoading}
          onSubmit={handleManualSubmit}
          demoTokens={demoTokens}
        />
      </Card>

      {/* Footer Text */}
      <Paragraph className="!text-xs !text-slate-400 !mt-6 text-center leading-normal">
        Session expires at check-out. No app install required.
      </Paragraph>

      {/* Camera Scanner Modal */}
      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        demoTokens={demoTokens}
      />
    </div>
  );
}
