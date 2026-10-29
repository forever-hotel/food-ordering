import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { FossDemoOrder } from './foss-demo-order.entity.js';

@Entity({ name: 'foss_demo_order_items' })
export class FossDemoOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { length: 100, name: 'order_id' })
  orderId!: string;

  @ManyToOne('FossDemoOrder', 'items', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_id' })
  order!: FossDemoOrder;

  @Column('varchar', { length: 100, name: 'menu_item_id' })
  menuItemId!: string;

  @Column('varchar', { length: 200 })
  name!: string;

  @Column('numeric', {
    precision: 10,
    scale: 2,
    name: 'unit_price',
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value),
    },
  })
  unitPrice!: number;

  @Column('int')
  quantity!: number;

  @Column('varchar', { length: 200, name: 'special_notes', nullable: true })
  specialNotes?: string | null;
}
