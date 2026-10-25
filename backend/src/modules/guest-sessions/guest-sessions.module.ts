import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FossSession } from './entities/foss-session.entity.js';
import { FossSessionRepository } from './repositories/foss-session.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([FossSession])],
  providers: [FossSessionRepository],
  exports: [FossSessionRepository],
})
export class GuestSessionsModule {}
