import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [MessagingModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
