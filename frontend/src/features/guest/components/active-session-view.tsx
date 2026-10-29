'use client';

import React from 'react';
import { Badge, Button, Card, Popconfirm, Tag, Typography } from 'antd';

import { useAuth } from '../../../lib/auth/auth-context';

const { Title, Paragraph, Text } = Typography;

export function ActiveSessionView() {
  const { guest, expiresAt, logout, refreshSession } = useAuth();

  if (!guest) return null;

  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="w-full max-w-[480px] mx-auto px-4 py-4 space-y-4">
      {/* Welcome Card */}
      <Card
        className="!rounded-2xl !shadow-sm !border-slate-100 !bg-gradient-to-br !from-[#1D3557] !to-[#162A45] text-white"
        styles={{ body: { padding: '24px 20px' } }}
      >
        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs uppercase tracking-wider text-slate-300 font-semibold block mb-1">
              Active Guest Stay
            </span>
            <Title level={2} className="!text-white !mb-1 !text-2xl !font-bold">
              Room {guest.roomNumber}
            </Title>
            <Text className="text-slate-200 text-sm block">
              Guest: <span className="font-semibold">{guest.guestName}</span>
            </Text>
          </div>

          <Badge
            count="CHECKED-IN"
            style={{
              backgroundColor: '#10B981',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '11px',
              paddingInline: '8px',
            }}
          />
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center text-xs text-slate-300">
          <div>
            Booking: <Tag color="blue">{guest.bookingId.slice(0, 8)}...</Tag>
          </div>
          {formattedExpiry && <div>Session valid until: {formattedExpiry}</div>}
        </div>
      </Card>

      {/* Guest Services Navigation Grid */}
      <Card
        className="!rounded-2xl !shadow-sm !border-slate-100 !bg-white"
        styles={{ body: { padding: '20px' } }}
      >
        <Title level={4} className="!text-slate-800 !text-base !mb-3">
          Available Guest Services
        </Title>

        <div className="grid grid-cols-1 gap-2.5">
          <div className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-lg">
                🍽️
              </span>
              <div>
                <Text strong className="block text-slate-800 text-sm">
                  In-Room Dining Menu
                </Text>
                <Text type="secondary" className="text-xs">
                  Breakfast, Lunch, Dinner & Drinks
                </Text>
              </div>
            </div>
            <Tag color="green">Active</Tag>
          </div>

          <div className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg">
                🛎️
              </span>
              <div>
                <Text strong className="block text-slate-800 text-sm">
                  Service Requests
                </Text>
                <Text type="secondary" className="text-xs">
                  Towels, Cleaning, Luggage Assistance
                </Text>
              </div>
            </div>
            <Tag color="blue">Available</Tag>
          </div>

          <div className="p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50 transition-colors flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold text-lg">
                📋
              </span>
              <div>
                <Text strong className="block text-slate-800 text-sm">
                  Guest Complaints
                </Text>
                <Text type="secondary" className="text-xs">
                  Report issues directly to Hotel Management
                </Text>
              </div>
            </div>
            <Tag color="cyan">Direct MAD</Tag>
          </div>
        </div>
      </Card>

      {/* Session Controls */}
      <div className="flex flex-col gap-2 pt-2">
        <Button
          onClick={refreshSession}
          className="w-full !rounded-xl !h-10 text-slate-600 text-sm"
        >
          Check Session Status
        </Button>

        <Popconfirm
          title="Log out of room session?"
          description="You will need to scan your room QR code again to access guest services."
          onConfirm={logout}
          okText="Yes, Log Out"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button danger className="w-full !rounded-xl !h-10 text-sm">
            Log Out
          </Button>
        </Popconfirm>
      </div>

      <Paragraph className="!text-xs !text-slate-400 text-center !mt-4">
        Protected session under room isolation. Room access is server-verified on every request.
      </Paragraph>
    </div>
  );
}
