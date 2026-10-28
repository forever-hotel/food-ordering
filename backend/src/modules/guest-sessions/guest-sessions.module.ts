import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BookingInternalModule } from '../../integrations/internal-services/booking/booking-internal.module.js';
import { FossSession } from './entities/foss-session.entity.js';
import { FossSessionRepository } from './repositories/foss-session.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([FossSession]), BookingInternalModule],
  providers: [FossSessionRepository],
  exports: [FossSessionRepository, BookingInternalModule],
})
export class GuestSessionsModule {}
