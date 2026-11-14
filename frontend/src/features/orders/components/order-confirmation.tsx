'use client';

import { useEffect, useState } from 'react';
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
  const minEta = order.estimatedDeliveryMinutes > 0 ? order.estimatedDeliveryMinutes : null;
  const maxEta = minEta === null ? null : minEta + 10;

  return (
    <div
      role="region"
      aria-label="Order Confirmation"
      className="w-full max-w-md mx-auto px-4 py-6 space-y-4 animate-fade-in flex flex-col items-center"
    >
      {/* 1. Green pill badge: ✓ ORDER PLACED (Figure 35) */}
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-semibold tracking-wide select-none">
        <span aria-hidden="true" className="font-semibold text-sm">
          ✓
        </span>
        <span>ORDER PLACED</span>
      </div>

      {/* 2. Large Circular Checkmark Icon (Figure 35) */}
      <div className="w-16 h-16 rounded-full bg-emerald-100/80 flex items-center justify-center my-1 select-none">
        <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-none">
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
        <Title level={2} className="!text-2xl !font-semibold !text-[#1a1a18] !mb-0 tracking-tight">
          Order Confirmed!
        </Title>
        <Paragraph className="!text-xs !text-[#5a5650] !mb-0 max-w-[280px] mx-auto leading-relaxed">
          Your order has been sent to the kitchen.
        </Paragraph>
      </div>

      {/* 4. Room & Order Tag Pill (Figure 35: "Order #ORD-291 · Room 103") */}
      <div className="px-4 py-1.5 rounded-full bg-blue-50/80 border border-blue-100 text-[#1a3c5e] text-xs font-semibold select-none">
        <span>
          Order {formattedOrderId} · Room {order.roomNumber || '—'}
        </span>
      </div>

      {/* 5. ESTIMATED DELIVERY Card (Figure 35: Dark Navy Box with Gold 25-35 Minutes) */}
      <div className="w-full bg-[#1a3c5e] rounded-[10px] p-5 text-center shadow-none space-y-1 text-white">
        <Text className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase block">
          ESTIMATED DELIVERY
        </Text>
        <div className="text-3xl sm:text-4xl font-semibold text-[#c9920d] tracking-tight py-0.5">
          {minEta === null ? 'Pending' : `${minEta}-${maxEta}`}
        </div>
        <Text className="text-xs font-semibold tracking-widest text-[#c9920d] uppercase block">
          {minEta === null ? 'KITCHEN ESTIMATE' : 'MINUTES'}
        </Text>
      </div>

      {/* 6. Cancellation Notice Banner (Figure 35: Warm yellow container with countdown) */}
      <div className="w-full bg-amber-50 border border-amber-200/90 rounded-[10px] p-3.5 text-center space-y-0.5">
        <div className="text-xs font-semibold text-amber-950 flex items-center justify-center gap-1.5">
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
          className="!h-12 !rounded-[10px] !bg-[#1a3c5e] hover:!bg-[#12263a] active:scale-[0.99] !font-semibold text-sm shadow-none transition-all"
        >
          Track Order Status
        </Button>

        <Button
          block
          size="large"
          onClick={onBackToMenu}
          className="!h-12 !rounded-[10px] !bg-white !border-[#ddd8cf] !text-[#1a1a18] hover:!bg-[#f9f7f4] active:scale-[0.99] !font-semibold text-sm transition-all"
        >
          Back to Menu
        </Button>
      </div>

      {/* 8. Room Folio Settlement Notice (Figure 35) */}
      <Paragraph className="!text-[11px] !text-[#5a5650] text-center !mb-0 pt-2">
        Charges added to room folio. Settled at checkout.
      </Paragraph>
    </div>
  );
}
