import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GuestSessionsModule } from '../modules/guest-sessions/guest-sessions.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { RabbitMqConnectionService } from './rabbitmq-connection.service.js';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service.js';
import { RabbitMqPublisherService } from './rabbitmq-publisher.service.js';
import { RabbitMqTopologyService } from './rabbitmq-topology.service.js';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RealtimeModule),
    forwardRef(() => GuestSessionsModule),
  ],
  providers: [
    RabbitMqConnectionService,
    RabbitMqTopologyService,
    RabbitMqPublisherService,
    RabbitMqConsumerService,
  ],
  exports: [
    RabbitMqConnectionService,
    RabbitMqPublisherService,
    RabbitMqConsumerService,
  ],
})
export class MessagingModule {}
