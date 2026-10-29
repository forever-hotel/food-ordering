import { forwardRef, Module } from '@nestjs/common';
import { GuestSessionsModule } from '../modules/guest-sessions/guest-sessions.module.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeService } from './realtime.service.js';

@Module({
  imports: [forwardRef(() => GuestSessionsModule)],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
