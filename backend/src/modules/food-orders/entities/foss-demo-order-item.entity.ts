import type { FossDemoOrder } from './foss-demo-order.entity.js';

/**
 * In-memory demonstration food order item projection model.
 *
 * Maintained purely in-memory alongside FossDemoOrder.
 */
export class FossDemoOrderItem {
  id?: string;

  orderId!: string;

  order?: FossDemoOrder;

  menuItemId!: string;

  name!: string;

  unitPrice!: number;

  quantity!: number;

  specialNotes?: string | null;
}
