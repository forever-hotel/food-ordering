import { Module } from '@nestjs/common';
import { KmsInternalModule } from '../../integrations/internal-services/kms/kms-internal.module.js';
import { GuestSessionsModule } from '../guest-sessions/guest-sessions.module.js';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';
import { HotelClockService } from './services/hotel-clock.service.js';
import { MealWindowService } from './services/meal-window.service.js';

@Module({
  imports: [KmsInternalModule, GuestSessionsModule],
  controllers: [MenuController],
  providers: [HotelClockService, MealWindowService, MenuService],
  exports: [MenuService, MealWindowService, HotelClockService],
})
export class MenuModule {}
