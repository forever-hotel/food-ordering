'use client';

import React, { type ReactNode } from 'react';
import { Button, Card, Typography } from 'antd';

const { Title, Paragraph } = Typography;

interface EmptyStateProps {
  icon?: string | ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  actionText,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <Card
      className={`w-full !rounded-2xl !border-slate-100 !bg-white text-center !shadow-xs ${className}`}
      styles={{ body: { padding: '32px 20px' } }}
    >
      <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 mx-auto mb-4 flex items-center justify-center text-3xl select-none">
        {icon}
      </div>

      <Title level={3} className="!text-base !font-bold !text-[#1E293B] !mb-1.5">
        {title}
      </Title>

      <Paragraph className="!text-slate-500 !text-sm !mb-5 max-w-[280px] mx-auto leading-relaxed">
        {description}
      </Paragraph>

      {actionText && onAction && (
        <Button
          type="primary"
          onClick={onAction}
          className="!h-10 px-5 !rounded-xl !bg-[#1D3557] hover:!bg-[#162a45] !font-semibold text-sm"
        >
          {actionText}
        </Button>
      )}
    </Card>
  );
}
