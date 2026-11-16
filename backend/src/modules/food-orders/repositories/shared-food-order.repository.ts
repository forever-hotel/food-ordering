import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FossDemoOrderRepository } from './foss-demo-order.repository.js';
import { FossDemoOrder } from '../entities/foss-demo-order.entity.js';
import { FoodOrderStatus } from '../enums/food-order-status.enum.js';
import { kitchenIdempotencyKey } from '../../../integrations/internal-services/kms/adapters/kms-idempotency.js';

/** Must match KMS stableOrderId: shared durable identity, not an in-memory receipt. */
export function kitchenOrderId(key: string): string {
  const hex = createHash('sha1')
    .update(Buffer.from('5f8e071d52964913baf86dd11b1204ab', 'hex'))
    .update(Buffer.from(key, 'utf8'))
    .digest('hex');
  const variant = (8 + (parseInt(hex[16], 16) % 4)).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

interface OrderRow {
  order_id: string;
  booking_id: string;
  room_number: string;
  status: FoodOrderStatus;
  total_amount: number;
  allergy_note: string | null;
  placed_at: Date;
  updated_at: Date;
}
interface ItemRow {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  special_note: string | null;
}

@Injectable()
export class SharedFoodOrderRepository extends FossDemoOrderRepository {
  constructor(private readonly database: DataSource) {
    super();
  }

  override async findById(id: string): Promise<FossDemoOrder | null> {
    const rows = await this.database.query<OrderRow[]>(
      'SELECT * FROM kms_food_orders WHERE order_id = $1::uuid',
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    const items = await this.database.query<ItemRow[]>(
      'SELECT * FROM kms_food_order_items WHERE order_id = $1::uuid ORDER BY created_at, order_item_id',
      [id],
    );
    return Object.assign(new FossDemoOrder(), {
      orderId: row.order_id,
      bookingId: row.booking_id,
      roomNumber: row.room_number,
      status: row.status,
      totalAmount: row.total_amount / 100,
      allergyNotes: row.allergy_note,
      createdAt: new Date(row.placed_at),
      updatedAt: new Date(row.updated_at),
      idempotencyKey: row.order_id,
      estimatedDeliveryMinutes: 0,
      items: items.map((item) => ({
        orderId: row.order_id,
        menuItemId: item.menu_item_id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price / 100,
        specialNotes: item.special_note,
      })),
    });
  }

  override async findByIdempotencyKey(key: string, bookingId?: string) {
    const normalized = bookingId ? kitchenIdempotencyKey(bookingId, key) : key;
    const order = await this.findById(kitchenOrderId(normalized));
    if (order) {
      order.idempotencyKey = key;
      return order;
    }
    // Retain lookup support for orders created before the opaque-key conversion.
    if (normalized !== key) {
      const legacy = await this.findById(kitchenOrderId(key));
      if (legacy) legacy.idempotencyKey = key;
      return legacy;
    }
    return null;
  }

  override async findByBookingAndRoom(booking: string, room: string) {
    const rows = await this.database.query<{ order_id: string }[]>(
      'SELECT order_id FROM kms_food_orders WHERE booking_id = $1 AND room_number = $2 ORDER BY placed_at DESC',
      [booking, room],
    );
    const orders = await Promise.all(
      rows.map((row) => this.findById(row.order_id)),
    );
    return orders.filter((order): order is FossDemoOrder => order !== null);
  }

  override async save(input: FossDemoOrder) {
    // KMS already committed the order or cancellation. FOSS must not overwrite it.
    const order = await this.findById(input.orderId);
    if (!order)
      throw new NotFoundException('Canonical kitchen order is unavailable');
    order.idempotencyKey = input.idempotencyKey;
    return order;
  }
}
