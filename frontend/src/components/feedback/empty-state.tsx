'use client';

import { type ReactNode } from 'react';
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
      className={`w-full !rounded-[10px] !border-[#ddd8cf] !bg-white text-center !shadow-none ${className}`}
      styles={{ body: { padding: '32px 20px' } }}
    >
      <div className="w-16 h-16 rounded-[10px] bg-[#f9f7f4] border border-[#ddd8cf] mx-auto mb-4 flex items-center justify-center text-3xl select-none">
        {icon}
      </div>

      <Title level={3} className="!text-base !font-semibold !text-[#1a1a18] !mb-1.5">
        {title}
      </Title>

      <Paragraph className="!text-[#5a5650] !text-sm !mb-5 max-w-[280px] mx-auto leading-relaxed">
        {description}
      </Paragraph>

      {actionText && onAction && (
        <Button
          type="primary"
          onClick={onAction}
          className="!h-10 px-5 !rounded-[10px] !bg-[#1a3c5e] hover:!bg-[#12263a] !font-semibold text-sm"
        >
          {actionText}
        </Button>
      )}
    </Card>
  );
}
