import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { FossQrActivation } from '../entities/foss-qr-activation.entity.js';

@Injectable()
export class FossQrActivationRepository {
  constructor(
    @InjectRepository(FossQrActivation)
    private readonly repository: Repository<FossQrActivation>,
  ) {}

  findById(activationId: string): Promise<FossQrActivation | null> {
    return this.repository.findOne({
      where: { activationId },
    });
  }

  findByTokenHash(tokenHash: string): Promise<FossQrActivation | null> {
    return this.repository.findOne({
      where: { tokenHash },
    });
  }

  findPendingByBookingId(bookingId: string): Promise<FossQrActivation[]> {
    return this.repository
      .createQueryBuilder('qa')
      .where('qa.booking_id = :bookingId', { bookingId })
      .andWhere('qa.redeemed_at IS NULL')
      .andWhere('qa.revoked_at IS NULL')
      .getMany();
  }

  save(activation: FossQrActivation): Promise<FossQrActivation> {
    return this.repository.save(activation);
  }

  /**
   * Atomically revokes all active, unredeemed activation credentials for a booking.
   * Invoked upon credential reissue, checkout, or room reassignment.
   */
  async revokeUnredeemedByBookingId(
    bookingId: string,
    revokedAt: Date = new Date(),
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(FossQrActivation)
      .set({ revokedAt })
      .where('booking_id = :bookingId', { bookingId })
      .andWhere('redeemed_at IS NULL')
      .andWhere('revoked_at IS NULL')
      .execute();

    return result.affected ?? 0;
  }

  /**
   * Atomically redeems an activation credential within an active transaction manager.
   *
   * Database-level concurrency guarantee:
   * Uses row-level conditional update in PostgreSQL.
   * Exactly one concurrent transaction matches `redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > now`.
   * A competing request will see 0 affected rows and return null.
   */
  async atomicRedeemWithManager(
    manager: EntityManager,
    tokenHash: string,
    now: Date = new Date(),
  ): Promise<FossQrActivation | null> {
    const result = await manager.query(
      `UPDATE "foss_qr_activations"
       SET "redeemed_at" = $1
       WHERE "token_hash" = $2
         AND "redeemed_at" IS NULL
         AND "revoked_at" IS NULL
         AND "expires_at" > $1
       RETURNING "activation_id" AS "activationId",
                 "booking_id" AS "bookingId",
                 "room_number" AS "roomNumber",
                 "token_hash" AS "tokenHash",
                 "expires_at" AS "expiresAt",
                 "redeemed_at" AS "redeemedAt",
                 "revoked_at" AS "revokedAt",
                 "created_at" AS "createdAt",
                 "issued_by" AS "issuedBy"`,
      [now, tokenHash],
    );

    if (Array.isArray(result) && result.length > 0) {
      const rawRow = Array.isArray(result[0]) ? result[0][0] : result[0];
      if (!rawRow) return null;

      const entity = new FossQrActivation();
      entity.activationId = rawRow.activationId || rawRow.activation_id;
      entity.bookingId = rawRow.bookingId || rawRow.booking_id;
      entity.roomNumber = rawRow.roomNumber || rawRow.room_number;
      entity.tokenHash = rawRow.tokenHash || rawRow.token_hash;
      entity.expiresAt = new Date(rawRow.expiresAt || rawRow.expires_at);
      entity.redeemedAt = new Date(rawRow.redeemedAt || rawRow.redeemed_at);
      entity.revokedAt =
        rawRow.revokedAt || rawRow.revoked_at
          ? new Date(rawRow.revokedAt || rawRow.revoked_at)
          : null;
      entity.createdAt = new Date(rawRow.createdAt || rawRow.created_at);
      entity.issuedBy = rawRow.issuedBy || rawRow.issued_by;
      return entity;
    }

    return null;
  }

  /**
   * Atomically redeems an activation credential using conditional execution.
   */
  async atomicRedeem(
    tokenHash: string,
    now: Date = new Date(),
  ): Promise<FossQrActivation | null> {
    const manager = (this.repository.manager ??
      this.repository) as EntityManager;
    return this.atomicRedeemWithManager(manager, tokenHash, now);
  }
}
