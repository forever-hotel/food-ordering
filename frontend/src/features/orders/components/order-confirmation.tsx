'use client';

import React, { useEffect, useState } from 'react';
import { Button, Typography } from 'antd';
import type { FoodOrderResponse } from '../../../types/orders.ts';

const { Title, Text, Paragraph } = Typography;

interface OrderConfirmationProps {
  order: FoodOrderResponse;
  onTrackStatus: () => void;
  onBackToMenu: () => void;
}

export function OrderConfirmation({ order, onTrackStatus, onBackToMenu }: OrderConfirmationProps) {
  // Calculate initial countdown in seconds (default 600s / 10 minutes from placement)
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (typeof order.secondsRemainingToCancel === 'number') {
      return Math.max(0, order.secondsRemainingToCancel);
    }
    if (order.createdAt) {
      const createdTime = new Date(order.createdAt).getTime();
      const elapsed = Math.floor((Date.now() - createdTime) / 1000);
      return Math.max(0, 600 - elapsed);
    }
    return 600;
  });

  useEffect(() => {
    if (secondsRemaining <= 0) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining]);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeDisplay = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  // Format order display ID: "#ORD-291"
  const formattedOrderId = order.orderId.startsWith('#')
    ? order.orderId
    : order.orderId.startsWith('ORD-')
      ? `#${order.orderId}`
      : `#ORD-${order.orderId.replace(/^[^\d]*/, '').slice(-3) || '291'}`;

  // Estimate range e.g. "25–35"
  const minEta = order.estimatedDeliveryMinutes || 25;
  const maxEta = minEta + 10;

  return (
    <div
      role="region"
      aria-label="Order Confirmation"
      className="w-full max-w-md mx-auto px-4 py-6 space-y-4 animate-fade-in flex flex-col items-center"
    >
      {/* 1. Green pill badge: ✓ ORDER PLACED (Figure 35) */}
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-bold tracking-wide select-none">
        <span aria-hidden="true" className="font-extrabold text-sm">
          ✓
        </span>
        <span>ORDER PLACED</span>
      </div>

      {/* 2. Large Circular Checkmark Icon (Figure 35) */}
      <div className="w-16 h-16 rounded-full bg-emerald-100/80 flex items-center justify-center my-1 select-none">
        <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
          <svg
            className="w-6 h-6 stroke-current stroke-[3] fill-none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      {/* 3. Headline & Subtitle (Figure 35) */}
      <div className="text-center space-y-1">
        <Title level={2} className="!text-2xl !font-extrabold !text-[#1E293B] !mb-0 tracking-tight">
          Order Confirmed!
        </Title>
        <Paragraph className="!text-xs !text-slate-500 !mb-0 max-w-[280px] mx-auto leading-relaxed">
          Your order has been sent to the kitchen and a KOT has been printed.
        </Paragraph>
      </div>

      {/* 4. Room & Order Tag Pill (Figure 35: "Order #ORD-291 · Room 103") */}
      <div className="px-4 py-1.5 rounded-full bg-blue-50/80 border border-blue-100 text-[#1D3557] text-xs font-semibold select-none">
        <span>
          Order {formattedOrderId} · Room {order.roomNumber || '103'}
        </span>
      </div>

      {/* 5. ESTIMATED DELIVERY Card (Figure 35: Dark Navy Box with Gold 25-35 Minutes) */}
      <div className="w-full bg-[#1D3557] rounded-2xl p-5 text-center shadow-md space-y-1 text-white">
        <Text className="text-[11px] font-bold tracking-widest text-slate-300 uppercase block">
          ESTIMATED DELIVERY
        </Text>
        <div className="text-3xl sm:text-4xl font-extrabold text-[#F5A623] tracking-tight py-0.5">
          {minEta}–{maxEta}
        </div>
        <Text className="text-xs font-bold tracking-widest text-[#F5A623] uppercase block">
          MINUTES
        </Text>
      </div>

      {/* 6. Cancellation Notice Banner (Figure 35: Warm yellow container with countdown) */}
      <div className="w-full bg-amber-50 border border-amber-200/90 rounded-2xl p-3.5 text-center space-y-0.5">
        <div className="text-xs font-bold text-amber-950 flex items-center justify-center gap-1.5">
          <span aria-hidden="true" className="text-sm">
            ⏱
          </span>
          <span>
            {secondsRemaining > 0
              ? `Cancel within: ${timeDisplay} remaining`
              : 'Cancellation cutoff passed'}
          </span>
        </div>
        <div className="text-[11px] text-amber-800/90 font-medium">
          Not possible once kitchen starts preparation
        </div>
      </div>

      {/* 7. Action CTAs (Figure 35: Track Order Status & Back to Menu) */}
      <div className="w-full space-y-2.5 pt-2">
        <Button
          type="primary"
          block
          size="large"
          onClick={onTrackStatus}
          className="!h-12 !rounded-2xl !bg-[#1D3557] hover:!bg-[#162A45] active:scale-[0.99] !font-bold text-sm shadow-md transition-all"
        >
          Track Order Status
        </Button>

        <Button
          block
          size="large"
          onClick={onBackToMenu}
          className="!h-12 !rounded-2xl !bg-white !border-slate-200 !text-slate-700 hover:!bg-slate-50 active:scale-[0.99] !font-bold text-sm transition-all"
        >
          Back to Menu
        </Button>
      </div>

      {/* 8. Room Folio Settlement Notice (Figure 35) */}
      <Paragraph className="!text-[11px] !text-slate-400 text-center !mb-0 pt-2">
        Charges added to room folio. Settled at checkout.
      </Paragraph>
    </div>
  );
}
