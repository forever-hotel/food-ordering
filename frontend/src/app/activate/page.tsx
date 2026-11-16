'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Spin, Typography } from 'antd';

import { useAuth } from '@/lib/auth/auth-context';

const { Title, Paragraph, Text } = Typography;

function ActivateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { guest, error, loginWithQr } = useAuth();

  const rawToken = searchParams.get('token') || searchParams.get('qrToken') || '';
  const hasToken = Boolean(rawToken && rawToken.trim());

  const [activationState, setActivationState] = useState<
    'activating' | 'success' | 'failed' | 'missing_token'
  >(hasToken ? 'activating' : 'missing_token');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!hasToken || attemptedRef.current) return;

    attemptedRef.current = true;
    const token = rawToken.trim();

    // Promptly scrub the raw credential from the address bar so it does not persist in browser history
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Execute atomic redemption against backend
    loginWithQr(token)
      .then((success) => {
        if (success) {
          setActivationState('success');
          // Smooth redirect to home menu after brief confirmation
          const timer = setTimeout(() => {
            router.replace('/');
          }, 1200);
          return () => clearTimeout(timer);
        } else {
          setActivationState('failed');
          setErrorMessage(
            error || 'The activation credential is invalid or has already been used.',
          );
        }
      })
      .catch((err: unknown) => {
        setActivationState('failed');
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to redeem activation QR. Please request a new slip from Front Desk.';
        setErrorMessage(msg);
      });
  }, [hasToken, rawToken, loginWithQr, router, error]);

  return (
    <div className="w-full max-w-[420px] mx-auto px-4 py-12 flex flex-col items-center">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <Text className="text-xs font-bold tracking-[0.25em] text-slate-500 uppercase block">
          FOREVER HOTEL
        </Text>
        <span className="text-xs text-slate-400 block mt-1">In-Room Guest Services</span>
      </div>

      <Card
        className="w-full !rounded-2xl !shadow-sm !border-slate-100 !bg-white overflow-hidden text-center"
        styles={{ body: { padding: '32px 24px' } }}
      >
        {activationState === 'activating' && (
          <div className="py-8 flex flex-col items-center" role="status" aria-live="polite">
            <Spin size="large" />
            <Title level={3} className="!text-lg !font-bold !text-[#1E293B] !mt-6 !mb-2">
              Activating Guest Session
            </Title>
            <Paragraph className="!text-slate-500 !text-sm leading-relaxed max-w-[280px]">
              Verifying your room assignment and establishing secure session...
            </Paragraph>
          </div>
        )}

        {activationState === 'success' && (
          <div className="py-6 flex flex-col items-center" role="status" aria-live="polite">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <Title level={2} className="!text-xl !font-bold !text-[#1E293B] !mb-1">
              Welcome to Room {guest?.roomNumber || ''}!
            </Title>
            {guest?.guestName && (
              <Text className="text-sm font-medium text-slate-600 block mb-2">
                {guest.guestName}
              </Text>
            )}
            <Paragraph className="!text-slate-500 !text-sm leading-relaxed max-w-[280px]">
              Your room services session is ready. Redirecting you to the dining menu...
            </Paragraph>
            <Button
              type="primary"
              onClick={() => router.replace('/')}
              className="mt-4 !bg-[#1D3557] hover:!bg-[#162a45] !rounded-xl !h-11 px-6 font-semibold"
            >
              Continue to Dining Menu
            </Button>
          </div>
        )}

        {activationState === 'failed' && (
          <div className="py-4 text-left">
            <Alert
              type="error"
              showIcon
              title="Activation Failed"
              description={
                <div className="space-y-2 mt-2">
                  <Paragraph className="!mb-0 text-sm text-slate-700">
                    {errorMessage ||
                      'This activation QR code could not be redeemed. It may be expired, revoked, or already scanned.'}
                  </Paragraph>
                  <Text type="secondary" className="text-xs block leading-relaxed">
                    For guest security, each printed QR code is valid for single use only. If you
                    need a replacement slip, please contact the Front Desk or scan another code.
                  </Text>
                </div>
              }
              className="!rounded-xl mb-6"
            />
            <Button
              type="primary"
              onClick={() => router.replace('/')}
              className="w-full !bg-[#1D3557] hover:!bg-[#162a45] !rounded-xl !h-11 font-semibold"
            >
              Return to Login Screen
            </Button>
          </div>
        )}

        {activationState === 'missing_token' && (
          <div className="py-4 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <Title level={3} className="!text-lg !font-bold !text-[#1E293B] !mb-2">
              Missing Activation Code
            </Title>
            <Paragraph className="!text-slate-500 !text-sm leading-relaxed mb-6">
              No QR activation credential was detected in this link. Please point your camera at the
              printed slip provided by Front Desk.
            </Paragraph>
            <Button
              type="primary"
              onClick={() => router.replace('/')}
              className="w-full !bg-[#1D3557] hover:!bg-[#162a45] !rounded-xl !h-11 font-semibold"
            >
              Open Camera Scanner
            </Button>
          </div>
        )}
      </Card>

      <Paragraph className="!text-xs !text-slate-400 !mt-8 text-center leading-normal">
        Forever Hotel Food Ordering & Service Request System (FOSS)
      </Paragraph>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20">
          <Spin size="large" />
          <span className="mt-4 text-sm text-slate-500">Loading activation...</span>
        </div>
      }
    >
      <ActivateContent />
    </Suspense>
  );
}
