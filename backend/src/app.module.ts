import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { BookingInternalModule } from './integrations/internal-services/booking/booking-internal.module.js';
import { KmsInternalModule } from './integrations/internal-services/kms/kms-internal.module.js';
import { MadInternalModule } from './integrations/internal-services/mad/mad-internal.module.js';
import { WkmsInternalModule } from './integrations/internal-services/wkms/wkms-internal.module.js';
import { GuestSessionsModule } from './modules/guest-sessions/guest-sessions.module.js';
import { MenuModule } from './modules/menu/menu.module.js';
import { FoodOrdersModule } from './modules/food-orders/food-orders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    GuestSessionsModule,
    BookingInternalModule,
    KmsInternalModule,
    WkmsInternalModule,
    MadInternalModule,
    HealthModule,
    MenuModule,
    FoodOrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
