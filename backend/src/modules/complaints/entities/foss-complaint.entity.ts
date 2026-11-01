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
  @PrimaryColumn({ type: 'uuid', name: 'complaint_id' })
  complaintId!: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'public_reference',
  })
  publicReference!: string | null;

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

  @Column({
    type: 'varchar',
    length: 150,
    nullable: true,
    default: 'Guest Complaint',
    name: 'subject',
  })
  subject!: string;

  @Column({ type: 'text', name: 'description' })
  description!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: ComplaintStatus.SUBMITTED,
    name: 'status',
    transformer: {
      to(val: ComplaintStatus | string): string {
        if (
          val === ComplaintStatus.UNDER_INVESTIGATION ||
          val === 'UNDER_INVESTIGATION'
        ) {
          return 'UNDER_REVIEW';
        }
        return val;
      },
      from(val: string): ComplaintStatus {
        if (val === 'UNDER_REVIEW') {
          return ComplaintStatus.UNDER_INVESTIGATION;
        }
        return val as ComplaintStatus;
      },
    },
  })
  status!: ComplaintStatus;

  @Index('IDX_foss_complaints_referenced_order_id')
  @Column({
    type: 'uuid',
    nullable: true,
    name: 'referenced_order_id',
  })
  referencedOrderId!: string | null;

  get relatedOrderId(): string | null {
    return this.referencedOrderId;
  }

  set relatedOrderId(val: string | null) {
    this.referencedOrderId = val;
  }

  @Index('IDX_foss_complaints_referenced_request_id')
  @Column({
    type: 'uuid',
    nullable: true,
    name: 'referenced_request_id',
  })
  referencedRequestId!: string | null;

  get relatedRequestId(): string | null {
    return this.referencedRequestId;
  }

  set relatedRequestId(val: string | null) {
    this.referencedRequestId = val;
  }

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
    nullable: true,
    name: 'idempotency_key',
  })
  idempotencyKey!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
