'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Tag, Typography, Button } from 'antd';
import type { FoodOrderResponse } from '../../../types/orders.ts';
import { fetchGuestOrders } from '../../../lib/api/orders.ts';
import { formatLkrPrice } from '../../../lib/api/menu.ts';
import { useAuth } from '../../../lib/auth/auth-context.tsx';
import { OrderStatusTracker } from './order-status-tracker.tsx';
import { LoadingSkeleton } from '../../../components/feedback/loading-skeleton.tsx';
import { AlertNotice } from '../../../components/feedback/alert-notice.tsx';
import { EmptyState } from '../../../components/feedback/empty-state.tsx';

const { Title, Text, Paragraph } = Typography;

export function OrdersTab() {
  const { sessionToken } = useAuth();

  const [orders, setOrders] = useState<FoodOrderResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchGuestOrders(sessionToken || 'demo-token');
      setOrders(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to retrieve order history.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    let isCancelled = false;

    fetchGuestOrders(sessionToken || 'demo-token')
      .then((data) => {
        if (!isCancelled) {
          setOrders(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to retrieve order history.';
          setError(msg);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [sessionToken]);

  // If viewing detailed status tracker (Figure 36)
  if (selectedOrderId) {
    return <OrderStatusTracker orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />;
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

  // Group orders into Today vs Yesterday / Past (Figure 37)
  const isToday = (iso?: string) => {
    if (!iso) return true;
    const d = new Date(iso);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  };

  const todayOrders = orders.filter((o) => isToday(o.createdAt));
  const pastOrders = orders.filter((o) => !isToday(o.createdAt));

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
      {loading && orders.length === 0 && <LoadingSkeleton count={3} type="card" />}

      {/* Empty State */}
      {!loading && orders.length === 0 && !error && (
        <EmptyState
          icon="📦"
          title="No food orders yet"
          description="Your current stay has no placed food orders. Explore the menu and order in-room dining."
          actionText="Explore Menu"
          onAction={() => {}}
        />
      )}

      {/* Date Section 1: TODAY, APR 8 (Figure 37) */}
      {todayOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              TODAY, APR 8
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
            YESTERDAY, APR 7
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
