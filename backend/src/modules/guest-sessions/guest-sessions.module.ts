import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BookingInternalModule } from '../../integrations/internal-services/booking/booking-internal.module.js';
import { FossSession } from './entities/foss-session.entity.js';
import { GuestAuthGuard } from './guards/guest-auth.guard.js';
import { GuestSessionsController } from './guest-sessions.controller.js';
import { FossSessionRepository } from './repositories/foss-session.repository.js';
import { GuestSessionsService } from './services/guest-sessions.service.js';
import { QrTokenService } from './services/qr-token.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FossSession]),
    BookingInternalModule,
    ConfigModule,
  ],
  controllers: [GuestSessionsController],
  providers: [
    FossSessionRepository,
    QrTokenService,
    GuestSessionsService,
    GuestAuthGuard,
  ],
  exports: [
    FossSessionRepository,
    GuestSessionsService,
    QrTokenService,
    GuestAuthGuard,
    BookingInternalModule,
  ],
})
export class GuestSessionsModule {}
