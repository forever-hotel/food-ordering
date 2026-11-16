'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Card, Tag, Typography, Button } from 'antd';
import type { FoodOrderResponse } from '../../../types/orders.ts';
import {
  fetchGuestOrders,
  reconcileAuthoritativeOrders,
  applyIncrementalOrderUpdate,
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
import { OrderStatusTracker } from './order-status-tracker.tsx';
import { LoadingSkeleton } from '../../../components/feedback/loading-skeleton.tsx';
import { AlertNotice } from '../../../components/feedback/alert-notice.tsx';
import { EmptyState } from '../../../components/feedback/empty-state.tsx';

const { Title, Text, Paragraph } = Typography;

const isToday = (iso?: string) => {
  if (!iso) return true;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
};

export function OrdersTab() {
  const { sessionToken, guest } = useAuth();
  const { setActiveTab, selectedOrderId, setSelectedOrderId } = useNavigation();

  const [orders, setOrders] = useState<FoodOrderResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const activeOrderId = selectedOrderId;

  const latestFetchSeqRef = useRef<number>(0);
  const realtimeClientRef = useRef<FossRealtimeClient | null>(null);

  const loadOrders = useCallback(async () => {
    if (!sessionToken || !guest?.bookingId || !guest?.roomNumber) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const seq = ++latestFetchSeqRef.current;

    try {
      const data = await fetchGuestOrders(sessionToken);
      if (seq === latestFetchSeqRef.current) {
        setOrders((prev) => reconcileAuthoritativeOrders(prev, data));
      }
    } catch (err: unknown) {
      if (seq === latestFetchSeqRef.current) {
        const msg = err instanceof Error ? err.message : 'Unable to retrieve order history.';
        setOrders([]);
        setError(msg);
      }
    } finally {
      if (seq === latestFetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [sessionToken, guest?.bookingId, guest?.roomNumber]);

  // Initial fetch and session change handling: clear previous data on session change
  useEffect(() => {
    let isCancelled = false;
    const seq = ++latestFetchSeqRef.current;

    if (!sessionToken || !guest?.bookingId || !guest?.roomNumber) {
      Promise.resolve().then(() => {
        if (!isCancelled && seq === latestFetchSeqRef.current) {
          setOrders([]);
          setError(null);
          setLoading(false);
        }
      });
      return () => {
        isCancelled = true;
      };
    }

    fetchGuestOrders(sessionToken)
      .then((data) => {
        if (!isCancelled && seq === latestFetchSeqRef.current) {
          setOrders(reconcileAuthoritativeOrders([], data));
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled && seq === latestFetchSeqRef.current) {
          const msg = err instanceof Error ? err.message : 'Unable to retrieve order history.';
          setOrders([]);
          setError(msg);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [sessionToken, guest?.bookingId, guest?.roomNumber]);

  // Real-time events & polling fallback for order status updates (including DELIVERED)
  useEffect(() => {
    if (!sessionToken || !guest?.bookingId || !guest?.roomNumber) {
      if (realtimeClientRef.current) {
        realtimeClientRef.current.disconnect();
        realtimeClientRef.current = null;
      }
      return;
    }

    if (realtimeClientRef.current) {
      realtimeClientRef.current.disconnect();
      realtimeClientRef.current = null;
    }

    const client = new FossRealtimeClient({
      apiUrl: API_URL,
      onRefresh: () => {
        void loadOrders();
      },
      sessionToken,
      bookingId: guest.bookingId,
      roomNumber: guest.roomNumber,
      pollIntervalMs: 6000,
      onEvent: (event: FossRealtimeEvent) => {
        if (event.eventType === RealtimeEventType.FOOD_ORDER_STATUS_UPDATED) {
          const updated = event.data as FoodOrderResponse;
          if (!updated || !updated.orderId) return;

          // Reject event if room or booking does not match authenticated stay or is missing either
          if (
            !updated.roomNumber ||
            !updated.bookingId ||
            updated.roomNumber !== guest.roomNumber ||
            updated.bookingId !== guest.bookingId
          ) {
            return;
          }

          setOrders((prev) => applyIncrementalOrderUpdate(prev, updated));
        }
      },
    });

    client.connect();
    realtimeClientRef.current = client;

    // Periodic poll fallback to ensure delivered and live statuses stay fresh without regressing
    const interval = setInterval(() => {
      const seq = ++latestFetchSeqRef.current;
      fetchGuestOrders(sessionToken)
        .then((data) => {
          if (seq === latestFetchSeqRef.current) {
            setOrders((prev) => reconcileAuthoritativeOrders(prev, data));
          }
        })
        .catch(() => {});
    }, 8000);

    return () => {
      clearInterval(interval);
      client.disconnect();
      realtimeClientRef.current = null;
    };
  }, [sessionToken, guest?.bookingId, guest?.roomNumber, loadOrders]);

  // Strict stay isolation: require verifiable room ownership and matching booking ID
  const roomNumber = guest?.roomNumber;
  const bookingId = guest?.bookingId;

  const roomOrders = useMemo(() => {
    if (!roomNumber || !bookingId) return [];
    return orders.filter((o) => {
      // Reject records missing either identifier or not matching the authenticated stay
      if (!o.roomNumber || !o.bookingId) {
        return false;
      }
      if (o.roomNumber !== roomNumber || o.bookingId !== bookingId) {
        return false;
      }
      return true;
    });
  }, [orders, roomNumber, bookingId]);

  const todayOrders = useMemo(() => roomOrders.filter((o) => isToday(o.createdAt)), [roomOrders]);
  const pastOrders = useMemo(() => roomOrders.filter((o) => !isToday(o.createdAt)), [roomOrders]);

  const todayHeader = useMemo(() => {
    const now = new Date();
    const formatted = now
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      .toUpperCase();
    return `TODAY, ${formatted}`;
  }, []);

  const handleBackFromTracker = useCallback(() => {
    setSelectedOrderId(null);
    if (!sessionToken || !guest?.bookingId || !guest?.roomNumber) return;
    const seq = ++latestFetchSeqRef.current;
    fetchGuestOrders(sessionToken)
      .then((data) => {
        if (seq === latestFetchSeqRef.current) {
          setOrders((prev) => reconcileAuthoritativeOrders(prev, data));
        }
      })
      .catch(() => {});
  }, [sessionToken, guest?.bookingId, guest?.roomNumber, setSelectedOrderId]);

  // If viewing detailed status tracker (Figure 36)
  if (activeOrderId) {
    return <OrderStatusTracker orderId={activeOrderId} onBack={handleBackFromTracker} />;
  }

  const getStatusTag = (status: FoodOrderResponse['status']) => {
    switch (status) {
      case 'IN_PREPARATION':
        return (
          <Tag color="warning" className="font-semibold text-xs !px-2.5">
            In Kitchen
          </Tag>
        );
      case 'READY':
        return (
          <Tag color="processing" className="font-semibold text-xs !px-2.5">
            Ready
          </Tag>
        );
      case 'DELIVERED':
        return (
          <Tag color="success" className="font-semibold text-xs !px-2.5">
            ✓ Delivered
          </Tag>
        );
      case 'CANCELLED':
        return (
          <Tag color="error" className="font-semibold text-xs !px-2.5">
            Cancelled
          </Tag>
        );
      case 'PLACED':
      default:
        return (
          <Tag color="default" className="font-semibold text-xs !px-2.5">
            Placed
          </Tag>
        );
    }
  };

  const formatSummary = (order: FoodOrderResponse) => {
    if (!order.items || order.items.length === 0) return 'In-Room Dining Order';
    return order.items.map((i) => i.name).join(', ');
  };

  const formatOrderTime = (createdAt?: string) => {
    if (!createdAt) return 'Lunch · 12:20';
    try {
      const date = new Date(createdAt);
      const hours = date.getHours();
      let meal = 'Lunch';
      if (hours < 11) meal = 'Breakfast';
      else if (hours < 16) meal = 'Lunch';
      else meal = 'Dinner';

      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${meal} · ${timeStr}`;
    } catch {
      return 'Lunch · 12:20';
    }
  };

  return (
    <div
      role="tabpanel"
      id="tabpanel-orders"
      aria-labelledby="nav-tab-orders"
      className="w-full space-y-4 pb-20 animate-fade-in"
    >
      {/* Error state with retry */}
      {error && (
        <AlertNotice
          type="error"
          title="Unable to load order history"
          message={error}
          onRetry={loadOrders}
          className="mb-2"
        />
      )}

      {/* Loading state */}
      {loading && roomOrders.length === 0 && <LoadingSkeleton count={3} type="card" />}

      {/* Empty State */}
      {!loading && roomOrders.length === 0 && !error && (
        <EmptyState
          icon="📦"
          title="No food orders yet"
          description={`Your current stay${guest?.roomNumber ? ` in Room ${guest.roomNumber}` : ''} has no placed food orders. Explore the menu and order in-room dining.`}
          actionText="Explore Menu"
          onAction={() => setActiveTab('menu')}
        />
      )}

      {/* Date Section 1: TODAY (Figure 37) */}
      {todayOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              {todayHeader}
            </Text>
            <Button
              type="link"
              size="small"
              onClick={loadOrders}
              className="text-[11px] text-[#1D3557] font-semibold !p-0 !h-auto"
            >
              Refresh
            </Button>
          </div>

          <div className="space-y-2.5">
            {todayOrders.map((order) => {
              const displayId = order.orderId.startsWith('#') ? order.orderId : `#${order.orderId}`;

              return (
                <Card
                  key={order.orderId}
                  onClick={() => setSelectedOrderId(order.orderId)}
                  className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs hover:border-slate-200 active:scale-[0.99] transition-all cursor-pointer"
                  styles={{ body: { padding: '14px 16px' } }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 block mb-0.5">
                        {displayId}
                      </span>
                      <Title
                        level={4}
                        className="!text-sm !font-bold !text-[#1E293B] !mb-1 truncate max-w-[220px]"
                      >
                        {formatSummary(order)}
                      </Title>
                      <Text strong className="text-sm font-bold text-[#1D3557]">
                        {formatLkrPrice(order.totalAmount)}
                      </Text>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      {getStatusTag(order.status)}
                      <span className="text-[11px] text-slate-400 font-medium">
                        {formatOrderTime(order.createdAt)}
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Date Section 2: YESTERDAY, APR 7 (Figure 37) */}
      {pastOrders.length > 0 && (
        <div>
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 px-1">
            YESTERDAY & EARLIER
          </Text>

          <div className="space-y-2.5">
            {pastOrders.map((order) => {
              const displayId = order.orderId.startsWith('#') ? order.orderId : `#${order.orderId}`;

              return (
                <Card
                  key={order.orderId}
                  onClick={() => setSelectedOrderId(order.orderId)}
                  className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs hover:border-slate-200 active:scale-[0.99] transition-all cursor-pointer"
                  styles={{ body: { padding: '14px 16px' } }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 block mb-0.5">
                        {displayId}
                      </span>
                      <Title
                        level={4}
                        className="!text-sm !font-bold !text-[#1E293B] !mb-1 truncate max-w-[220px]"
                      >
                        {formatSummary(order)}
                      </Title>
                      <Text strong className="text-sm font-bold text-[#1D3557]">
                        {formatLkrPrice(order.totalAmount)}
                      </Text>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      {getStatusTag(order.status)}
                      <span className="text-[11px] text-slate-400 font-medium">
                        {formatOrderTime(order.createdAt)}
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Folio notice matching Figure 37 */}
      <Paragraph className="!text-xs !text-slate-400 text-center !mt-6 leading-normal">
        All charges added to room folio at checkout
      </Paragraph>
    </div>
  );
}
