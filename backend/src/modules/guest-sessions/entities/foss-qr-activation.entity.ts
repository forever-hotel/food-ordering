import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Persists one-time, short-lived QR activation credentials issued by FDS.
 *
 * Stores ONLY the SHA-256 hash of the activation credential.
 * Raw credentials are never stored at rest.
 *
 * Concurrency and replay protection are enforced through unique constraints
 * and atomic conditional redemption transactions.
 */
@Entity({ name: 'foss_qr_activations' })
export class FossQrActivation {
  @PrimaryGeneratedColumn('uuid', { name: 'activation_id' })
  activationId!: string;

  @Column('uuid', {
    name: 'booking_id',
  })
  bookingId!: string;

  @Column('varchar', {
    name: 'room_number',
    length: 10,
  })
  roomNumber!: string;

  @Column('varchar', {
    name: 'token_hash',
    length: 64,
    unique: true,
  })
  tokenHash!: string;

  @Column('timestamptz', {
    name: 'expires_at',
  })
  expiresAt!: Date;

  @Column('timestamptz', {
    name: 'redeemed_at',
    nullable: true,
  })
  redeemedAt!: Date | null;

  @Column('timestamptz', {
    name: 'revoked_at',
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column('timestamptz', {
    name: 'created_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @Column('varchar', {
    name: 'issued_by',
    length: 100,
    nullable: true,
  })
  issuedBy!: string | null;
}
