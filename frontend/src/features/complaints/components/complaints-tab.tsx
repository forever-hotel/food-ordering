'use client';

import React, { useState } from 'react';
import { Button, Card, Input, message, Radio, Select, Typography } from 'antd';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export function ComplaintsTab() {
  const [category, setCategory] = useState('FOOD');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('HIGH');
  const [reference, setReference] = useState('order-291');
  const [description, setDescription] = useState(
    'The chicken in order #ORD-291 was undercooked and cold on arrival.',
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    if (description.trim().length < 10) {
      message.error('Please provide at least 10 characters describing the issue.');
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      message.success('Complaint submitted. Escalated to Duty Manager.');
    }, 600);
  };

  return (
    <div
      role="tabpanel"
      id="tabpanel-complaints"
      aria-labelledby="nav-tab-complaints"
      className="w-full space-y-4 pb-20"
    >
      <Card
        className="!rounded-2xl !border-slate-100 !bg-white !shadow-xs"
        styles={{ body: { padding: '20px 16px' } }}
      >
        {/* Category */}
        <div className="mb-4">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            COMPLAINT CATEGORY
          </Text>
          <Select
            value={category}
            onChange={setCategory}
            className="w-full !rounded-xl !h-10 text-xs"
            options={[
              { value: 'FOOD', label: 'Food quality & dining' },
              { value: 'SERVICE', label: 'Staff service & attentiveness' },
              { value: 'CLEANLINESS', label: 'Room cleanliness & housekeeping' },
              { value: 'NOISE', label: 'Noise disturbance' },
              { value: 'AMENITY', label: 'Missing or broken amenity' },
              { value: 'OTHER', label: 'Other concern' },
            ]}
          />
        </div>

        {/* Severity */}
        <div className="mb-4">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            SEVERITY LEVEL
          </Text>
          <div className="grid grid-cols-3 gap-2">
            {[
              { level: 'LOW', label: 'Low', activeBg: '!bg-emerald-600', activeText: 'text-white' },
              {
                level: 'MEDIUM',
                label: 'Medium',
                activeBg: '!bg-amber-500',
                activeText: 'text-white',
              },
              { level: 'HIGH', label: 'High ✓', activeBg: '!bg-red-600', activeText: 'text-white' },
            ].map((s) => {
              const isSelected = severity === s.level;

              return (
                <button
                  key={s.level}
                  type="button"
                  onClick={() => setSeverity(s.level as 'LOW' | 'MEDIUM' | 'HIGH')}

                  className={`touch-target py-2 rounded-xl text-xs font-bold transition-all border focus-visible:outline-2 focus-visible:outline-[#1D3557] ${
                    isSelected
                      ? `${s.activeBg} ${s.activeText} shadow-xs border-transparent`
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Link to order or request */}
        <div className="mb-4">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            LINK TO ORDER OR REQUEST (OPTIONAL)
          </Text>
          <Radio.Group
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full flex flex-col gap-2"
          >
            <Radio
              value="order-291"
              className="!border !border-slate-200 !rounded-xl !p-2.5 !m-0 hover:!border-slate-300 text-xs"
            >
              Order #ORD-291 — Lunch, LKR 1,500
            </Radio>
            <Radio
              value="req-041"
              className="!border !border-slate-200 !rounded-xl !p-2.5 !m-0 hover:!border-slate-300 text-xs"
            >
              Request #REQ-041 — Extra Towels
            </Radio>
            <Radio
              value="none"
              className="!border !border-slate-200 !rounded-xl !p-2.5 !m-0 hover:!border-slate-300 text-xs"
            >
              No reference
            </Radio>
          </Radio.Group>
        </div>

        {/* Description */}
        <div className="mb-5">
          <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
            DESCRIPTION
          </Text>
          <TextArea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Please detail your experience so management can resolve it promptly..."
            className="!rounded-xl text-xs !bg-slate-50 !border-slate-200"
          />
        </div>

        {/* Submit */}
        <Button
          type="primary"
          block
          size="large"
          loading={submitting}
          onClick={handleSubmit}
          className="!h-11 !rounded-xl !bg-[#1D3557] hover:!bg-[#162a45] !font-bold text-sm shadow-xs"
        >
          Submit Complaint
        </Button>
      </Card>

      <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-center">
        <Paragraph className="!text-[11px] !text-slate-500 !mb-0 leading-relaxed">
          A unique complaint reference will be generated. The hotel manager will review and respond
          directly to your stay.
        </Paragraph>
      </div>
    </div>
  );
}
