import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WkmsInternalModule } from '../../integrations/internal-services/wkms/wkms-internal.module.js';
import { GuestSessionsModule } from '../guest-sessions/guest-sessions.module.js';
import { FossServiceRequest } from './entities/foss-service-request.entity.js';
import { FossServiceRequestRepository } from './repositories/foss-service-request.repository.js';
import { ServiceRequestsController } from './service-requests.controller.js';
import { ServiceRequestsService } from './service-requests.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FossServiceRequest]),
    WkmsInternalModule,
    GuestSessionsModule,
  ],
  controllers: [ServiceRequestsController],
  providers: [FossServiceRequestRepository, ServiceRequestsService],
  exports: [ServiceRequestsService, FossServiceRequestRepository],
})
export class ServiceRequestsModule {}
