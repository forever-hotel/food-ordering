import { forwardRef, Module } from '@nestjs/common';
import { KmsInternalModule } from '../../integrations/internal-services/kms/kms-internal.module.js';
import { MessagingModule } from '../../messaging/messaging.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { GuestSessionsModule } from '../guest-sessions/guest-sessions.module.js';
import { MenuModule } from '../menu/menu.module.js';
import { FoodOrdersController } from './food-orders.controller.js';
import { FoodOrdersService } from './food-orders.service.js';
import { FossDemoOrderRepository } from './repositories/foss-demo-order.repository.js';
import { SharedFoodOrderRepository } from './repositories/shared-food-order.repository.js';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

@Module({
  imports: [
    KmsInternalModule,
    forwardRef(() => GuestSessionsModule),
    MenuModule,
    forwardRef(() => RealtimeModule),
    forwardRef(() => MessagingModule),
  ],
  controllers: [FoodOrdersController],
  providers: [
    {
      provide: FossDemoOrderRepository,
      inject: [ConfigService, { token: DataSource, optional: true }],
      useFactory: (config: ConfigService, database?: DataSource) => {
        if (config.get<string>('SHARED_DATABASE_MODE') !== 'true')
          return new FossDemoOrderRepository();
        if (!database)
          throw new Error('Shared food orders require the shared database');
        return new SharedFoodOrderRepository(database);
      },
    },
    FoodOrdersService,
  ],
  exports: [FoodOrdersService, FossDemoOrderRepository],
})
export class FoodOrdersModule {}
