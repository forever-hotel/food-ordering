'use client';

import React, { useState } from 'react';
import { Button, Card, Input, message, Tag, Typography } from 'antd';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface ServiceType {
  key: string;
  label: string;
  icon: string;
}

const SERVICE_TYPES: ServiceType[] = [
  { key: 'cleaning', label: 'Room Cleaning', icon: '🧹' },
  { key: 'towels', label: 'Extra Towels', icon: '🛁' },
  { key: 'maintenance', label: 'Maintenance', icon: '🔧' },
  { key: 'laundry', label: 'Laundry', icon: '👕' },
  { key: 'water', label: 'Water Bottles', icon: '💧' },
  { key: 'other', label: 'Other', icon: '✨' },
];

export function ServicesTab() {
  const [selectedType, setSelectedType] = useState('towels');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      message.success('Service request submitted to housekeeping.');
      setDescription('');
    }, 600);
  };

  return (
    <div
      role="tabpanel"
      id="tabpanel-services"
      aria-labelledby="nav-tab-services"
      className="w-full space-y-4 pb-20"
    >
      {/* WHAT DO YOU NEED? Grid Header */}
      <div>
        <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 px-1">
          WHAT DO YOU NEED?
        </Text>

        <div className="grid grid-cols-2 gap-2.5">
          {SERVICE_TYPES.map((type) => {
            const isSelected = selectedType === type.key;

            return (
              <button
                key={type.key}
                type="button"
                onClick={() => setSelectedType(type.key)}
                className={`touch-target p-3.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-center border focus-visible:outline-2 focus-visible:outline-[#1D3557] ${
                  isSelected
                    ? 'bg-[#1D3557] text-white border-[#1D3557] shadow-sm scale-[1.01]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="text-2xl">{type.icon}</span>
                <span className="text-xs font-semibold leading-tight">{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Description Form */}
      <Card
        className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs"
        styles={{ body: { padding: '16px' } }}
      >
        <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
          DESCRIPTION (OPTIONAL)
        </Text>
        <TextArea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. AC not cooling properly or prefer morning visit..."
          className="!rounded-xl text-xs !bg-slate-50 !border-slate-200"
        />

        <Button
          type="primary"
          block
          size="large"
          loading={submitting}
          onClick={handleSubmit}
          className="!h-11 !rounded-xl !bg-[#1D3557] hover:!bg-[#162a45] !font-bold text-sm mt-4 shadow-xs"
        >
          Submit Request
        </Button>
      </Card>

      {/* ACTIVE REQUESTS (Figure 38) */}
      <div>
        <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 px-1">
          ACTIVE REQUESTS
        </Text>

        <div className="space-y-2.5">
          <Card
            className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs"
            styles={{ body: { padding: '14px 16px' } }}
          >
            <div className="flex items-center justify-between mb-1">
              <Title level={4} className="!text-sm !font-bold !text-[#1E293B] !mb-0">
                Extra Towels
              </Title>
              <Tag color="gold" className="text-[11px] font-semibold mr-0">
                ● Assigned · 13:45
              </Tag>
            </div>
            <Paragraph className="!text-xs !text-amber-700 !mb-0 font-medium">
              Worker en route → In Progress
            </Paragraph>
          </Card>

          <Card
            className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs"
            styles={{ body: { padding: '14px 16px' } }}
          >
            <div className="flex items-center justify-between mb-1">
              <Title level={4} className="!text-sm !font-bold !text-[#1E293B] !mb-0">
                Room Cleaning
              </Title>
              <Tag color="success" className="text-[11px] font-semibold mr-0">
                ✓ Completed · 10:30
              </Tag>
            </div>
            <Paragraph className="!text-xs !text-slate-500 !mb-0">Completed by Amali S.</Paragraph>
          </Card>
        </div>
      </div>
    </div>
  );
}
