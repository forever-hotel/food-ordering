import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FossSession } from '../entities/foss-session.entity.js';

@Injectable()
export class FossSessionRepository {
  constructor(
    @InjectRepository(FossSession)
    private readonly repository: Repository<FossSession>,
  ) {}

  findById(sessionId: string): Promise<FossSession | null> {
    return this.repository.findOne({
      where: { sessionId },
    });
  }

  findByBookingId(bookingId: string): Promise<FossSession | null> {
    return this.repository.findOne({
      where: { bookingId },
    });
  }

  findActiveBySessionToken(sessionToken: string): Promise<FossSession | null> {
    return this.repository.findOne({
      where: {
        sessionToken,
        isActive: true,
      },
    });
  }

  save(session: FossSession): Promise<FossSession> {
    return this.repository.save(session);
  }
}
