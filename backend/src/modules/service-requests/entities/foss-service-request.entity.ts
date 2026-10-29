import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceRequestStatus } from '../enums/service-request-status.enum.js';
import { TaskPriority } from '../../../integrations/internal-services/wkms/dto/wkms-task.dto.js';

@Entity('foss_service_requests')
export class FossServiceRequest {
  @PrimaryColumn({ type: 'varchar', length: 100, name: 'request_id' })
  requestId!: string;

  @Index('IDX_foss_service_requests_booking_id')
  @Column({ type: 'uuid', name: 'booking_id' })
  bookingId!: string;

  @Index('IDX_foss_service_requests_room_number')
  @Column({ type: 'varchar', length: 10, name: 'room_number' })
  roomNumber!: string;

  @Column({ type: 'varchar', length: 50, name: 'request_type' })
  requestType!: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'description' })
  description!: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: ServiceRequestStatus.SUBMITTED,
  })
  status!: ServiceRequestStatus;

  @Column({
    type: 'varchar',
    length: 20,
    default: TaskPriority.NORMAL,
  })
  priority!: TaskPriority;

  @Index('IDX_foss_service_requests_task_id')
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'task_id' })
  taskId!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'assigned_staff',
  })
  assignedStaff!: string | null;

  @Column({
    type: 'int',
    default: 20,
    name: 'estimated_completion_minutes',
  })
  estimatedCompletionMinutes!: number;

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
