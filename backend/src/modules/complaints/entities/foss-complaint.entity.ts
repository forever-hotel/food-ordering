import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ComplaintCategory } from '../enums/complaint-category.enum.js';
import { ComplaintSeverity } from '../enums/complaint-severity.enum.js';
import { ComplaintStatus } from '../enums/complaint-status.enum.js';

@Entity('foss_complaints')
export class FossComplaint {
  @PrimaryColumn({ type: 'varchar', length: 100, name: 'complaint_id' })
  complaintId!: string;

  @Index('IDX_foss_complaints_booking_id')
  @Column({ type: 'uuid', name: 'booking_id' })
  bookingId!: string;

  @Index('IDX_foss_complaints_room_number')
  @Column({ type: 'varchar', length: 10, name: 'room_number' })
  roomNumber!: string;

  @Column({ type: 'varchar', length: 50, name: 'category' })
  category!: ComplaintCategory;

  @Column({ type: 'varchar', length: 20, name: 'severity' })
  severity!: ComplaintSeverity;

  @Column({ type: 'varchar', length: 150, name: 'subject' })
  subject!: string;

  @Column({ type: 'varchar', length: 1000, name: 'description' })
  description!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: ComplaintStatus.SUBMITTED,
    name: 'status',
  })
  status!: ComplaintStatus;

  @Index('IDX_foss_complaints_related_order_id')
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'related_order_id',
  })
  relatedOrderId!: string | null;

  @Index('IDX_foss_complaints_related_request_id')
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'related_request_id',
  })
  relatedRequestId!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'assigned_manager',
  })
  assignedManager!: string | null;

  @Column({
    type: 'varchar',
    length: 1000,
    nullable: true,
    name: 'resolution_notes',
  })
  resolutionNotes!: string | null;

  @Column({
    type: 'varchar',
    length: 128,
    unique: true,
    name: 'idempotency_key',
  })
  idempotencyKey!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
