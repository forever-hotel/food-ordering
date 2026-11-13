'use client';

import { useState } from 'react';
import { App, Button } from 'antd';
import type { FoodOrderResponse, FoodOrderStatus } from '../../../types/orders.ts';
import { advanceOrderStatusDemo } from '../../../lib/api/orders.ts';
import { getDataMode, isOrderDemoSimulationEnabled } from '../../../lib/data-mode/data-mode.ts';

interface OrderDemoSimulationControlsProps {
  order: FoodOrderResponse;
  sessionToken: string | null;
  onOrderUpdated: (updated: FoodOrderResponse) => void;
}

/**
 * Isolated development-only demo simulation toolbar for advancing order statuses.
 * Returns null unless order demo simulation is explicitly enabled in an authorized
 * non-production environment.
 */
export function OrderDemoSimulationControls({
  order,
  sessionToken,
  onOrderUpdated,
}: OrderDemoSimulationControlsProps) {
  const { message } = App.useApp();
  const [advancingDemo, setAdvancingDemo] = useState<boolean>(false);

  if (!isOrderDemoSimulationEnabled()) {
    return null;
  }

  const currentStatus = order.status || 'IN_PREPARATION';

  const handleAdvanceStatus = async (targetStatus: FoodOrderStatus) => {
    if (!sessionToken || !isOrderDemoSimulationEnabled()) return;

    setAdvancingDemo(true);
    try {
      const updated = await advanceOrderStatusDemo(sessionToken, order.orderId, targetStatus);
      onOrderUpdated(updated);
      message.info(`Demo: Order status advanced to ${targetStatus}`);
    } catch (err: unknown) {
      // Only allow client-side local state simulation when explicitly running in isolated demo data mode
      if (getDataMode() === 'demo' && isOrderDemoSimulationEnabled()) {
        const nextOrder: FoodOrderResponse = {
          ...order,
          status: targetStatus,
          canCancel: false,
          timeline: (order.timeline || []).map((step) => ({
            ...step,
            completed: step.status === targetStatus ? true : step.completed,
            current: step.status === targetStatus,
            timestamp:
              step.status === targetStatus && !step.timestamp
                ? new Date().toISOString()
                : step.timestamp,
          })),
        };
        onOrderUpdated(nextOrder);
        message.info(`Demo simulation: status set to ${targetStatus}`);
      } else {
        const errMsg = err instanceof Error ? err.message : 'Demo order simulation is unavailable.';
        message.error(errMsg);
      }
    } finally {
      setAdvancingDemo(false);
    }
  };

  return (
    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5 text-center">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
        DEMO SIMULATION: ADVANCE STATUS
      </span>
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        <Button
          size="small"
          disabled={advancingDemo || currentStatus === 'IN_PREPARATION'}
          onClick={() => handleAdvanceStatus('IN_PREPARATION')}
          className="text-[11px] !rounded-xl"
        >
          In Kitchen
        </Button>
        <Button
          size="small"
          disabled={advancingDemo || currentStatus === 'READY'}
          onClick={() => handleAdvanceStatus('READY')}
          className="text-[11px] !rounded-xl"
        >
          Ready
        </Button>
        <Button
          size="small"
          disabled={advancingDemo || currentStatus === 'DELIVERED'}
          onClick={() => handleAdvanceStatus('DELIVERED')}
          className="text-[11px] !rounded-xl"
        >
          Delivered
        </Button>
      </div>
    </div>
  );
}
