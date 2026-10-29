'use client';

import React from 'react';
import { Card, Tag, Typography } from 'antd';

const { Title, Text, Paragraph } = Typography;

interface PastOrder {
  orderId: string;
  itemsSummary: string;
  amount: number;
  status: 'In Kitchen' | 'Delivered' | 'Cancelled';
  dateGroup: 'TODAY, APR 8' | 'YESTERDAY, APR 7';
  time: string;
}

const SAMPLE_ORDERS: PastOrder[] = [
  {
    orderId: '#ORD-295',
    itemsSummary: 'Grilled Chicken Rice, Kottu',
    amount: 1500,
    status: 'In Kitchen',
    dateGroup: 'TODAY, APR 8',
    time: 'Dinner · 17:52',
  },
  {
    orderId: '#ORD-291',
    itemsSummary: 'Grilled Chicken Rice, Kottu',
    amount: 1500,
    status: 'Delivered',
    dateGroup: 'TODAY, APR 8',
    time: 'Lunch · 12:20',
  },
  {
    orderId: '#ORD-287',
    itemsSummary: 'Egg Hoppers × 2, Tea',
    amount: 720,
    status: 'Delivered',
    dateGroup: 'TODAY, APR 8',
    time: 'Breakfast · 08:10',
  },
  {
    orderId: '#ORD-283',
    itemsSummary: 'Prawn Noodles, Juice',
    amount: 0,
    status: 'Cancelled',
    dateGroup: 'TODAY, APR 8',
    time: 'Lunch · 11:55',
  },
  {
    orderId: '#ORD-280',
    itemsSummary: 'Egg Hoppers × 2, Tea',
    amount: 720,
    status: 'Delivered',
    dateGroup: 'YESTERDAY, APR 7',
    time: 'Breakfast · 08:15',
  },
];

export function OrdersTab() {
  const getStatusTag = (status: PastOrder['status']) => {
    switch (status) {
      case 'In Kitchen':
        return (
          <Tag color="warning" className="font-semibold text-xs !px-2.5">
            In Kitchen
          </Tag>
        );
      case 'Delivered':
        return (
          <Tag color="success" className="font-semibold text-xs !px-2.5">
            ✓ Delivered
          </Tag>
        );
      case 'Cancelled':
        return (
          <Tag color="error" className="font-semibold text-xs !px-2.5">
            Cancelled
          </Tag>
        );
    }
  };

  const todayOrders = SAMPLE_ORDERS.filter((o) => o.dateGroup === 'TODAY, APR 8');
  const yesterdayOrders = SAMPLE_ORDERS.filter((o) => o.dateGroup === 'YESTERDAY, APR 7');

  return (
    <div
      role="tabpanel"
      id="tabpanel-orders"
      aria-labelledby="nav-tab-orders"
      className="w-full space-y-4 pb-20"
    >
      {/* Date Section 1 */}
      <div>
        <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 px-1">
          TODAY, APR 8
        </Text>

        <div className="space-y-2.5">
          {todayOrders.map((order) => (
            <Card
              key={order.orderId}
              className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs hover:border-slate-200 transition-all cursor-pointer"
              styles={{ body: { padding: '14px 16px' } }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-400 block mb-0.5">
                    {order.orderId}
                  </span>
                  <Title level={4} className="!text-sm !font-bold !text-[#1E293B] !mb-1">
                    {order.itemsSummary}
                  </Title>
                  <Text strong className="text-sm font-bold text-[#1D3557]">
                    LKR {order.amount.toLocaleString()}
                  </Text>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  {getStatusTag(order.status)}
                  <span className="text-[11px] text-slate-400 font-medium">{order.time}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Date Section 2 */}
      <div>
        <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 px-1">
          YESTERDAY, APR 7
        </Text>

        <div className="space-y-2.5">
          {yesterdayOrders.map((order) => (
            <Card
              key={order.orderId}
              className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs hover:border-slate-200 transition-all cursor-pointer"
              styles={{ body: { padding: '14px 16px' } }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-400 block mb-0.5">
                    {order.orderId}
                  </span>
                  <Title level={4} className="!text-sm !font-bold !text-[#1E293B] !mb-1">
                    {order.itemsSummary}
                  </Title>
                  <Text strong className="text-sm font-bold text-[#1D3557]">
                    LKR {order.amount.toLocaleString()}
                  </Text>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  {getStatusTag(order.status)}
                  <span className="text-[11px] text-slate-400 font-medium">{order.time}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Paragraph className="!text-xs !text-slate-400 text-center !mt-6 leading-normal">
        All charges added to room folio at checkout
      </Paragraph>
    </div>
  );
}
