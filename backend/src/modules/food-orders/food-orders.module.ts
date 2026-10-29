import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KmsInternalModule } from '../../integrations/internal-services/kms/kms-internal.module.js';
import { GuestSessionsModule } from '../guest-sessions/guest-sessions.module.js';
import { MenuModule } from '../menu/menu.module.js';
import { FossDemoOrderItem } from './entities/foss-demo-order-item.entity.js';
import { FossDemoOrder } from './entities/foss-demo-order.entity.js';
import { FoodOrdersController } from './food-orders.controller.js';
import { FoodOrdersService } from './food-orders.service.js';
import { FossDemoOrderRepository } from './repositories/foss-demo-order.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FossDemoOrder, FossDemoOrderItem]),
    KmsInternalModule,
    GuestSessionsModule,
    MenuModule,
  ],
  controllers: [FoodOrdersController],
  providers: [FossDemoOrderRepository, FoodOrdersService],
  exports: [FoodOrdersService, FossDemoOrderRepository],
})
export class FoodOrdersModule {}
