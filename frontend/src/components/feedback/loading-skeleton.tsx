'use client';

import React from 'react';
import { Card, Skeleton } from 'antd';

interface LoadingSkeletonProps {
  type?: 'card' | 'list' | 'header' | 'button';
  count?: number;
  label?: string;
}

export function LoadingSkeleton({
  type = 'card',
  count = 1,
  label = 'Loading guest services content...',
}: LoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className="w-full space-y-3"
    >
      <span className="sr-only">{label}</span>

      {Array.from({ length: count }).map((_, index) => (
        <Card
          key={index}
          className="!rounded-2xl !border-slate-100 !shadow-xs !bg-white"
          styles={{ body: { padding: '16px' } }}
        >
          {type === 'header' && (
            <div className="space-y-2">
              <Skeleton.Input active block style={{ height: 28, borderRadius: 8 }} />
              <Skeleton.Input active style={{ width: '60%', height: 16, borderRadius: 6 }} />
            </div>
          )}

          {type === 'card' && (
            <div className="flex gap-3">
              <Skeleton.Avatar active shape="square" size={64} style={{ borderRadius: 10 }} />
              <div className="flex-1 space-y-2">
                <Skeleton.Input active style={{ width: '70%', height: 18, borderRadius: 6 }} />
                <Skeleton.Input active block style={{ height: 14, borderRadius: 6 }} />
                <Skeleton.Input active style={{ width: '40%', height: 16, borderRadius: 6 }} />
              </div>
            </div>
          )}

          {type === 'list' && (
            <div className="space-y-2.5">
              <Skeleton.Input active style={{ width: '50%', height: 16, borderRadius: 6 }} />
              <Skeleton.Input active block style={{ height: 14, borderRadius: 6 }} />
            </div>
          )}

          {type === 'button' && (
            <Skeleton.Button active block style={{ height: 44, borderRadius: 10 }} />
          )}
        </Card>
      ))}
    </div>
  );
}
