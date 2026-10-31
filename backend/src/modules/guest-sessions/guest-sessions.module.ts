import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InternalServiceGuard } from '../../common/auth/internal-service.guard.js';
import { RoomOwnershipGuard } from '../../common/auth/room-ownership.guard.js';
import { BookingInternalModule } from '../../integrations/internal-services/booking/booking-internal.module.js';
import { FossQrActivation } from './entities/foss-qr-activation.entity.js';
import { FossSession } from './entities/foss-session.entity.js';
import { GuestAuthGuard } from './guards/guest-auth.guard.js';
import { GuestSessionsController } from './guest-sessions.controller.js';
import { FossQrActivationRepository } from './repositories/foss-qr-activation.repository.js';
import { FossSessionRepository } from './repositories/foss-session.repository.js';
import { GuestSessionsService } from './services/guest-sessions.service.js';
import { QrActivationService } from './services/qr-activation.service.js';
import { QrTokenService } from './services/qr-token.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FossSession, FossQrActivation]),
    BookingInternalModule,
    ConfigModule,
  ],
  controllers: [GuestSessionsController],
  providers: [
    FossSessionRepository,
    FossQrActivationRepository,
    QrTokenService,
    QrActivationService,
    GuestSessionsService,
    GuestAuthGuard,
    RoomOwnershipGuard,
    InternalServiceGuard,
  ],
  exports: [
    FossSessionRepository,
    FossQrActivationRepository,
    GuestSessionsService,
    QrTokenService,
    QrActivationService,
    GuestAuthGuard,
    RoomOwnershipGuard,
    InternalServiceGuard,
    BookingInternalModule,
  ],
})
export class GuestSessionsModule {}
