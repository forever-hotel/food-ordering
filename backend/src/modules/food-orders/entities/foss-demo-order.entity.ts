import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
import { FoodOrderStatus } from '../enums/food-order-status.enum.js';
import { FossDemoOrderItem } from './foss-demo-order-item.entity.js';

@Entity({ name: 'foss_demo_orders' })
@Index(['bookingId', 'roomNumber'])
export class FossDemoOrder {
  @PrimaryColumn('varchar', { length: 100, name: 'order_id' })
  orderId!: string;

  @Column('uuid', { name: 'booking_id' })
  bookingId!: string;

  @Column('varchar', { length: 10, name: 'room_number' })
  roomNumber!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: FoodOrderStatus.PLACED,
  })
  status!: FoodOrderStatus;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    name: 'total_amount',
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value),
    },
  })
  totalAmount!: number;

  @Column('varchar', { length: 300, name: 'allergy_notes', nullable: true })
  allergyNotes?: string | null;

  @Column('varchar', { length: 128, name: 'idempotency_key', unique: true })
  idempotencyKey!: string;

  @Column('int', { name: 'estimated_delivery_minutes', default: 25 })
  estimatedDeliveryMinutes!: number;

  @Column('timestamptz', {
    name: 'created_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @Column('timestamptz', {
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;

  @OneToMany(() => FossDemoOrderItem, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items!: FossDemoOrderItem[];
}
