import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalServiceGuard } from '../../common/auth/internal-service.guard.js';
import { MadInternalModule } from '../../integrations/internal-services/mad/mad-internal.module.js';
import { RealtimeModule } from '../../realtime/realtime.module.js';
import { FoodOrdersModule } from '../food-orders/food-orders.module.js';
import { GuestSessionsModule } from '../guest-sessions/guest-sessions.module.js';
import { ServiceRequestsModule } from '../service-requests/service-requests.module.js';
import { ComplaintsController } from './complaints.controller.js';
import { ComplaintsService } from './complaints.service.js';
import { FossComplaint } from './entities/foss-complaint.entity.js';
import { FossComplaintRepository } from './repositories/foss-complaint.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FossComplaint]),
    GuestSessionsModule,
    MadInternalModule,
    FoodOrdersModule,
    ServiceRequestsModule,
    RealtimeModule,
  ],
  controllers: [ComplaintsController],
  providers: [FossComplaintRepository, ComplaintsService, InternalServiceGuard],
  exports: [ComplaintsService, FossComplaintRepository],
})
export class ComplaintsModule {}
