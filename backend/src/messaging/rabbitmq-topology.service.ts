import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  RABBITMQ_CONSUMER_BINDINGS,
  RABBITMQ_DLQ_NAME,
  RABBITMQ_DLX_EXCHANGE_NAME,
  RABBITMQ_DLX_EXCHANGE_TYPE,
  RABBITMQ_EXCHANGE_NAME,
  RABBITMQ_EXCHANGE_TYPE,
  RABBITMQ_INCOMING_QUEUE,
} from './messaging.constants.js';
import { RabbitMqConnectionService } from './rabbitmq-connection.service.js';

@Injectable()
export class RabbitMqTopologyService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMqTopologyService.name);

  constructor(private readonly connectionService: RabbitMqConnectionService) {}

  public onModuleInit(): void {
    this.connectionService.onConnected(async () => {
      await this.assertTopology();
    });
  }

  /**
   * Asserts durable exchanges, queues, DLX/DLQ, and routing key topic bindings.
   */
  public async assertTopology(): Promise<void> {
    const channel = this.connectionService.getChannel();
    if (!channel) {
      this.logger.warn(
        'Cannot assert RabbitMQ topology: channel is not ready.',
      );
      return;
    }

    try {
      this.logger.log('Asserting RabbitMQ exchanges and queues...');

      // 1. Dead-Letter Exchange (DLX)
      await channel.assertExchange(
        RABBITMQ_DLX_EXCHANGE_NAME,
        RABBITMQ_DLX_EXCHANGE_TYPE,
        { durable: true },
      );

      // 2. Dead-Letter Queue (DLQ)
      await channel.assertQueue(RABBITMQ_DLQ_NAME, {
        durable: true,
      });

      // Bind DLQ to DLX
      await channel.bindQueue(
        RABBITMQ_DLQ_NAME,
        RABBITMQ_DLX_EXCHANGE_NAME,
        RABBITMQ_DLQ_NAME,
      );

      // 3. Primary Topic Exchange
      await channel.assertExchange(
        RABBITMQ_EXCHANGE_NAME,
        RABBITMQ_EXCHANGE_TYPE,
        { durable: true },
      );

      // 4. Incoming Queue with DLX configuration
      await channel.assertQueue(RABBITMQ_INCOMING_QUEUE, {
        durable: true,
        deadLetterExchange: RABBITMQ_DLX_EXCHANGE_NAME,
        deadLetterRoutingKey: RABBITMQ_DLQ_NAME,
      });

      // 5. Bind Incoming Queue to Primary Exchange for subscribed topics
      for (const pattern of RABBITMQ_CONSUMER_BINDINGS) {
        await channel.bindQueue(
          RABBITMQ_INCOMING_QUEUE,
          RABBITMQ_EXCHANGE_NAME,
          pattern,
        );
        this.logger.log(
          `Bound queue [${RABBITMQ_INCOMING_QUEUE}] to exchange [${RABBITMQ_EXCHANGE_NAME}] on pattern [${pattern}].`,
        );
      }

      this.logger.log('RabbitMQ topology asserted successfully.');
    } catch (err) {
      this.logger.error('Failed to assert RabbitMQ topology:', err);
      throw err;
    }
  }
}
