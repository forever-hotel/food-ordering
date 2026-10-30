'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Card, Modal, Typography, message } from 'antd';
import type { FoodOrderResponse, FoodOrderStatus } from '../../../types/orders.ts';
import {
  advanceOrderStatusDemo,
  cancelFoodOrder,
  fetchGuestOrderById,
} from '../../../lib/api/orders.ts';
import { formatLkrPrice } from '../../../lib/api/menu.ts';
import { useAuth } from '../../../lib/auth/auth-context.tsx';
import { useNavigation } from '../../../lib/navigation/navigation-context.tsx';
import {
  FossRealtimeClient,
  RealtimeEventType,
  type FossRealtimeEvent,
} from '../../../lib/realtime/realtime-client.ts';
import API_URL from '../../../lib/api/config.ts';
import { AlertNotice } from '../../../components/feedback/alert-notice.tsx';
import { LoadingSkeleton } from '../../../components/feedback/loading-skeleton.tsx';

const { Title, Text, Paragraph } = Typography;

interface OrderStatusTrackerProps {
  orderId: string;
  onBack: () => void;
}

export function OrderStatusTracker({ orderId, onBack }: OrderStatusTrackerProps) {
  const { sessionToken, guest } = useAuth();
  const { setPageHeader, resetHeaderForTab } = useNavigation();

  const [order, setOrder] = useState<FoodOrderResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [cancelModalVisible, setCancelModalVisible] = useState<boolean>(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [advancingDemo, setAdvancingDemo] = useState<boolean>(false);

  const formattedOrderId = orderId.startsWith('#')
    ? orderId
    : orderId.startsWith('ORD-')
      ? `#${orderId}`
      : `#ORD-${orderId.replace(/^[^\d]*/, '').slice(-3) || '291'}`;

  // Update header to match Figure 36 ("← Order Tracker / Order #ORD-291")
  useEffect(() => {
    setPageHeader({
      title: 'Order Tracker',
      subtitle: `Order ${formattedOrderId}`,
      showBackButton: true,
      onBack,
    });

    return () => {
      resetHeaderForTab('orders', guest?.roomNumber, guest?.guestName);
    };
  }, [
    formattedOrderId,
    onBack,
    setPageHeader,
    resetHeaderForTab,
    guest?.roomNumber,
    guest?.guestName,
  ]);

  const loadOrder = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError(null);

      try {
        const data = await fetchGuestOrderById(sessionToken || 'demo-token', orderId);
        setOrder(data);

        // Calculate countdown seconds
        if (typeof data.secondsRemainingToCancel === 'number') {
          setSecondsRemaining(Math.max(0, data.secondsRemainingToCancel));
        } else if (data.createdAt) {
          const created = new Date(data.createdAt).getTime();
          const elapsed = Math.floor((Date.now() - created) / 1000);
          const remaining = Math.max(0, 600 - elapsed);
          setSecondsRemaining(data.status === 'PLACED' ? remaining : 0);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to load order status.';
        setError(msg);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [sessionToken, orderId],
  );

  useEffect(() => {
    let isCancelled = false;

    fetchGuestOrderById(sessionToken || 'demo-token', orderId)
      .then((data) => {
        if (!isCancelled) {
          setOrder(data);
          if (typeof data.secondsRemainingToCancel === 'number') {
            setSecondsRemaining(Math.max(0, data.secondsRemainingToCancel));
          } else if (data.createdAt) {
            const created = new Date(data.createdAt).getTime();
            const elapsed = Math.floor((Date.now() - created) / 1000);
            const remaining = Math.max(0, 600 - elapsed);
            setSecondsRemaining(data.status === 'PLACED' ? remaining : 0);
          }
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to load order status.';
          setError(msg);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [sessionToken, orderId]);

  // Real-time events & polling fallback
  const realtimeClientRef = useRef<FossRealtimeClient | null>(null);

  useEffect(() => {
    if (!sessionToken || !guest) return;

    const client = new FossRealtimeClient({
      apiUrl: API_URL,
      sessionToken,
      bookingId: guest.bookingId || 'booking-101',
      roomNumber: guest.roomNumber || '103',
      pollIntervalMs: 5000,
      onEvent: (event: FossRealtimeEvent) => {
        if (event.eventType === RealtimeEventType.FOOD_ORDER_STATUS_UPDATED) {
          const updated = event.data as FoodOrderResponse;
          if (
            updated &&
            (updated.orderId === orderId || updated.orderId === formattedOrderId.replace(/^#/, ''))
          ) {
            setOrder(updated);
          } else {
            // Refetch current order
            loadOrder(false);
          }
        }
      },
    });

    client.connect();
    realtimeClientRef.current = client;

    return () => {
      client.disconnect();
    };
  }, [sessionToken, guest, orderId, formattedOrderId, loadOrder]);

  // Secondary polling fallback when order is actively in preparation
  useEffect(() => {
    if (!order) return;
    if (order.status === 'DELIVERED' || order.status === 'CANCELLED') return;

    const interval = setInterval(() => {
      loadOrder(false);
    }, 6000);

    return () => clearInterval(interval);
  }, [order, loadOrder]);

  // Countdown timer for 10-minute cancellation boundary
  useEffect(() => {
    if (secondsRemaining <= 0) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          // Window closed
          if (order && order.canCancel) {
            setOrder((cur) => (cur ? { ...cur, canCancel: false } : cur));
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsRemaining, order]);

  // Format countdown mm:ss
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeDisplay = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

  const handleCancelOrder = async () => {
    setCancelling(true);
    setCancelModalVisible(false);

    try {
      const updated = await cancelFoodOrder(
        sessionToken || 'demo-token',
        orderId,
        'Guest requested cancellation',
      );
      setOrder(updated);
      message.success('Your order has been cancelled.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Order cannot be cancelled because kitchen preparation has already begun or 10-minute window has expired.';
      message.error(msg);
      // Refresh backend authoritative status
      loadOrder(false);
    } finally {
      setCancelling(false);
    }
  };

  const handleAdvanceStatus = async (targetStatus: FoodOrderStatus) => {
    setAdvancingDemo(true);
    try {
      const updated = await advanceOrderStatusDemo(
        sessionToken || 'demo-token',
        orderId,
        targetStatus,
      );
      setOrder(updated);
      message.info(`Demo: Order status advanced to ${targetStatus}`);
    } catch {
      // In offline/mock mode, update state locally
      if (order) {
        const nextOrder: FoodOrderResponse = {
          ...order,
          status: targetStatus,
          canCancel: false,
          timeline: (order.timeline || []).map((step) => ({
            ...step,
            completed: step.status === targetStatus ? true : step.completed,
            current: step.status === targetStatus,
          })),
        };
        setOrder(nextOrder);
        message.info(`Demo simulation: status set to ${targetStatus}`);
      }
    } finally {
      setAdvancingDemo(false);
    }
  };

  if (loading && !order) {
    return (
      <div className="w-full max-w-md mx-auto space-y-4 pb-20">
        <LoadingSkeleton count={3} type="card" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-8 space-y-4">
        <AlertNotice
          type="error"
          title="Unable to load order status"
          message={error}
          onRetry={() => loadOrder(true)}
        />
        <Button block onClick={onBack}>
          Back to Order History
        </Button>
      </div>
    );
  }

  const currentStatus = order?.status || 'IN_PREPARATION';

  // Hero status title mapping matching Figure 36
  const getHeroTitle = (status: FoodOrderStatus) => {
    switch (status) {
      case 'PLACED':
        return 'Order Placed — Sent to Kitchen';
      case 'IN_PREPARATION':
        return 'In Kitchen — Preparing';
      case 'READY':
        return 'Ready for Delivery — Courier Assigned';
      case 'DELIVERED':
        return 'Delivered — Enjoy Your Meal!';
      case 'CANCELLED':
        return 'Order Cancelled';
      default:
        return 'In Kitchen — Preparing';
    }
  };

  return (
    <div
      role="region"
      aria-label="Order Status Tracker"
      className="w-full max-w-md mx-auto space-y-4 pb-24 animate-fade-in"
    >
      {/* 1. Dark Blue Hero Status Banner (Figure 36) */}
      <div className="w-full bg-[#1D3557] rounded-3xl p-5 text-white shadow-md space-y-2 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
          <span>
            {formattedOrderId} · Room {order?.roomNumber || guest?.roomNumber || '103'} · In-Room
            Dining
          </span>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-amber-400 text-[11px] font-semibold">
            <span
              className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
              aria-hidden="true"
            />
            <span>Live updates</span>
          </div>
        </div>

        <Title level={3} className="!text-xl !font-extrabold !text-white !mb-0 tracking-tight">
          {getHeroTitle(currentStatus)}
        </Title>
      </div>

      {/* 2. Step-by-Step Status Timeline (Figure 36) */}
      <Card
        className="!rounded-3xl !border-slate-100 !bg-white !shadow-xs"
        styles={{ body: { padding: '20px 18px' } }}
      >
        <div className="space-y-6 relative before:absolute before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
          {/* Step 1: Order Placed */}
          <div className="flex items-start gap-3.5 relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                currentStatus !== 'CANCELLED'
                  ? 'bg-[#1D3557] text-white shadow-xs'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              <svg
                className="w-4 h-4 stroke-current stroke-[3] fill-none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 pt-0.5">
              <div className="flex items-center justify-between">
                <Text strong className="text-sm text-slate-900 block font-bold">
                  Order Placed
                </Text>
                <span className="text-[11px] text-slate-400 font-medium">
                  {order?.createdAt
                    ? new Date(order.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '12:20 PM'}
                </span>
              </div>
              <Text className="text-xs text-slate-500 block">Order received & KOT printed</Text>
            </div>
          </div>

          {/* Step 2: In Preparation */}
          <div className="flex items-start gap-3.5 relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                currentStatus === 'IN_PREPARATION'
                  ? 'bg-amber-100 border-2 border-amber-500 text-amber-600'
                  : currentStatus === 'READY' || currentStatus === 'DELIVERED'
                    ? 'bg-[#1D3557] text-white'
                    : 'bg-white border-2 border-slate-300 text-transparent'
              }`}
            >
              {currentStatus === 'READY' || currentStatus === 'DELIVERED' ? (
                <svg
                  className="w-4 h-4 stroke-current stroke-[3] fill-none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : currentStatus === 'IN_PREPARATION' ? (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-transparent" />
              )}
            </div>
            <div className="flex-1 pt-0.5">
              <div className="flex items-center justify-between">
                <Text
                  strong
                  className={`text-sm block font-bold ${currentStatus === 'IN_PREPARATION' ? 'text-amber-800' : 'text-slate-900'}`}
                >
                  In Preparation
                </Text>
                {currentStatus === 'IN_PREPARATION' && (
                  <span className="text-[11px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-full">
                    Now
                  </span>
                )}
              </div>
              <Text className="text-xs text-slate-500 block leading-snug">
                Kitchen acknowledged allergy notes and started cooking
              </Text>
            </div>
          </div>

          {/* Step 3: Ready for Delivery */}
          <div className="flex items-start gap-3.5 relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                currentStatus === 'DELIVERED'
                  ? 'bg-[#1D3557] text-white'
                  : currentStatus === 'READY'
                    ? 'bg-amber-100 border-2 border-amber-500 text-amber-600'
                    : 'bg-white border-2 border-slate-300 text-transparent'
              }`}
            >
              {currentStatus === 'DELIVERED' ? (
                <svg
                  className="w-4 h-4 stroke-current stroke-[3] fill-none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : currentStatus === 'READY' ? (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-transparent" />
              )}
            </div>
            <div className="flex-1 pt-0.5">
              <div className="flex items-center justify-between">
                <Text
                  strong
                  className={`text-sm block font-bold ${currentStatus === 'READY' ? 'text-amber-800' : 'text-slate-900'}`}
                >
                  Ready for Delivery
                </Text>
                <span className="text-[11px] text-slate-400 font-medium">
                  {currentStatus === 'READY'
                    ? 'Now'
                    : `Est. ~${order?.estimatedDeliveryMinutes || 25}m`}
                </span>
              </div>
              <Text className="text-xs text-slate-500 block">Food prepared, worker assigned</Text>
            </div>
          </div>

          {/* Step 4: Delivered */}
          <div className="flex items-start gap-3.5 relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                currentStatus === 'DELIVERED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white border-2 border-slate-300 text-transparent'
              }`}
            >
              {currentStatus === 'DELIVERED' && (
                <svg
                  className="w-4 h-4 stroke-current stroke-[3] fill-none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className="flex-1 pt-0.5">
              <div className="flex items-center justify-between">
                <Text
                  strong
                  className={`text-sm block font-bold ${currentStatus === 'DELIVERED' ? 'text-emerald-700' : 'text-slate-900'}`}
                >
                  Delivered
                </Text>
              </div>
              <Text className="text-xs text-slate-500 block">
                Worker delivers to Room {order?.roomNumber || guest?.roomNumber || '103'}
              </Text>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Cancellation Warning & Action Box (Figure 36) */}
      {order?.canCancel && secondsRemaining > 0 && (
        <div className="w-full bg-amber-50 border border-amber-200/90 rounded-3xl p-4 space-y-3">
          <div className="space-y-0.5 text-center">
            <div className="text-xs font-bold text-amber-950 flex items-center justify-center gap-1.5">
              <span aria-hidden="true" className="text-sm">
                ⏱
              </span>
              <span>Cancel within: {timeDisplay} remaining</span>
            </div>
            <div className="text-[11px] text-amber-800/90 font-medium">
              Not possible once kitchen starts preparation
            </div>
          </div>

          <Button
            danger
            block
            loading={cancelling}
            onClick={() => setCancelModalVisible(true)}
            className="!rounded-2xl !h-10 text-xs font-bold shadow-xs"
          >
            Cancel Order
          </Button>
        </div>
      )}

      {/* 4. ORDER SUMMARY Card (Figure 36) */}
      <Card
        className="!rounded-3xl !border-slate-100 !bg-white !shadow-xs"
        styles={{ body: { padding: '16px 18px' } }}
      >
        <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-3">
          ORDER SUMMARY
        </Text>

        <div className="divide-y divide-slate-100 space-y-2.5">
          {(order?.items || []).map((item) => (
            <div key={item.itemId} className="pt-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">
                {item.name} × {item.quantity}
              </span>
              <span className="font-bold text-slate-700">
                {formatLkrPrice(item.unitPrice * item.quantity)}
              </span>
            </div>
          ))}

          {order?.allergyNotes && (
            <div className="pt-2.5 text-xs">
              <span className="text-[11px] font-bold text-amber-900 bg-amber-50 px-2 py-1 rounded-lg block">
                ⚠️ Allergy Note: {order.allergyNotes}
              </span>
            </div>
          )}

          <div className="pt-3 flex items-center justify-between text-sm font-bold text-[#1D3557]">
            <span className="text-base font-extrabold">Total</span>
            <span className="text-base font-extrabold">
              {formatLkrPrice(order?.totalAmount || 0)}
            </span>
          </div>
        </div>
      </Card>

      {/* 5. Demo Status Advancement Simulation Toolbar */}
      <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5 text-center">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
          DEMO SIMULATION: ADVANCE STATUS
        </span>
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <Button
            size="small"
            disabled={advancingDemo || currentStatus === 'IN_PREPARATION'}
            onClick={() => handleAdvanceStatus('IN_PREPARATION')}
            className="text-[11px] !rounded-xl"
          >
            In Kitchen
          </Button>
          <Button
            size="small"
            disabled={advancingDemo || currentStatus === 'READY'}
            onClick={() => handleAdvanceStatus('READY')}
            className="text-[11px] !rounded-xl"
          >
            Ready
          </Button>
          <Button
            size="small"
            disabled={advancingDemo || currentStatus === 'DELIVERED'}
            onClick={() => handleAdvanceStatus('DELIVERED')}
            className="text-[11px] !rounded-xl"
          >
            Delivered
          </Button>
        </div>
      </div>

      {/* Cancellation Confirmation Modal */}
      <Modal
        title="Cancel This Order?"
        open={cancelModalVisible}
        onOk={handleCancelOrder}
        onCancel={() => setCancelModalVisible(false)}
        okText="Yes, Cancel Order"
        cancelText="Keep Order"
        okButtonProps={{ danger: true, loading: cancelling }}
      >
        <Paragraph className="text-xs text-slate-600 leading-relaxed mb-0">
          Are you sure you want to cancel Order <strong>{formattedOrderId}</strong>? This action
          cannot be reversed once the kitchen starts cooking.
        </Paragraph>
      </Modal>
    </div>
  );
}
