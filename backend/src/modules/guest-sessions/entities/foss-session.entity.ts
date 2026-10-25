import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'foss_sessions' })
export class FossSession {
  @PrimaryGeneratedColumn('uuid', { name: 'session_id' })
  sessionId!: string;

  @Column('uuid', {
    name: 'booking_id',
    unique: true,
  })
  bookingId!: string;

  @Column('varchar', {
    name: 'room_number',
    length: 10,
  })
  roomNumber!: string;

  @Column('varchar', {
    name: 'session_token',
    length: 500,
    unique: true,
  })
  sessionToken!: string;

  @Column('boolean', {
    name: 'is_active',
    default: true,
  })
  isActive!: boolean;

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

  @Column('timestamptz', {
    name: 'expires_at',
  })
  expiresAt!: Date;
}
