'use client';

import React from 'react';
import { Alert, Button } from 'antd';

interface AlertNoticeProps {
  type: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  message: string;
  onRetry?: () => void;
  onClose?: () => void;
  className?: string;
}

export function AlertNotice({
  type,
  title,
  message,
  onRetry,
  onClose,
  className = '',
}: AlertNoticeProps) {
  return (
    <div role="alert" aria-live="polite" className={`w-full ${className}`}>
      <Alert
        type={type}
        showIcon
        closable={!!onClose}
        onClose={onClose}
        message={title}
        description={
          <div className="flex flex-col gap-2 mt-0.5">
            <span className="text-xs leading-relaxed">{message}</span>
            {onRetry && (
              <div>
                <Button
                  size="small"
                  onClick={onRetry}
                  className="text-xs !h-7 px-3 mt-1 font-medium"
                >
                  Retry action
                </Button>
              </div>
            )}
          </div>
        }
        className="!rounded-xl text-xs shadow-xs"
      />
    </div>
  );
}
