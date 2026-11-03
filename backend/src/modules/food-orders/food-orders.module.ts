import { forwardRef, Module } from '@nestjs/common';
import { KmsInternalModule } from '../../integrations/internal-services/kms/kms-internal.module.js';
import { MessagingModule } from '../../messaging/messaging.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { GuestSessionsModule } from '../guest-sessions/guest-sessions.module.js';
import { MenuModule } from '../menu/menu.module.js';
import { FoodOrdersController } from './food-orders.controller.js';
import { FoodOrdersService } from './food-orders.service.js';
import { FossDemoOrderRepository } from './repositories/foss-demo-order.repository.js';

@Module({
  imports: [
    KmsInternalModule,
    forwardRef(() => GuestSessionsModule),
    MenuModule,
    RealtimeModule,
    MessagingModule,
  ],
  controllers: [FoodOrdersController],
  providers: [FossDemoOrderRepository, FoodOrdersService],
  exports: [FoodOrdersService, FossDemoOrderRepository],
})
export class FoodOrdersModule {}
