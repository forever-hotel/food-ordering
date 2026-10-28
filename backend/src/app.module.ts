import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { BookingInternalModule } from './integrations/internal-services/booking/booking-internal.module.js';
import { GuestSessionsModule } from './modules/guest-sessions/guest-sessions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    GuestSessionsModule,
    BookingInternalModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
