import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  PublishOptions,
  SignedEventEnvelope,
} from './interfaces/messaging.interfaces.js';
import { RABBITMQ_EXCHANGE_NAME } from './messaging.constants.js';
import { RabbitMqConnectionService } from './rabbitmq-connection.service.js';
import { signEnvelope } from './utils/envelope-signer.js';

@Injectable()
export class RabbitMqPublisherService {
  private readonly logger = new Logger(RabbitMqPublisherService.name);

  constructor(
    private readonly connectionService: RabbitMqConnectionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Publishes a signed event to the central topic exchange using publisher confirms.
   * If RabbitMQ is offline or disabled, fails safely without crashing the caller transaction.
   */
  public async publishEvent<T extends Record<string, unknown>>(
    eventType: string,
    payload: T,
    options?: PublishOptions,
  ): Promise<SignedEventEnvelope<T> | null> {
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();
    const version = '1.0';
    const source = 'foss.service';

    const secretKey =
      this.configService.get<string>('INTERNAL_SERVICE_KEY') ||
      'development-internal-service-key-at-least-32-chars';

    const envelopeWithoutSig = {
      eventId,
      eventType,
      version,
      source,
      timestamp,
      payload,
    };

    const signature = signEnvelope(envelopeWithoutSig, secretKey);
    const envelope: SignedEventEnvelope<T> = {
      ...envelopeWithoutSig,
      signature,
    };

    if (!this.connectionService.isEnabled()) {
      this.logger.debug(
        `RabbitMQ disabled: Skipping publishing event [${eventType}] (id: ${eventId}).`,
      );
      return null;
    }

    const confirmChannel = this.connectionService.getConfirmChannel();
    if (!confirmChannel || !this.connectionService.isConnected()) {
      this.logger.warn(
        `RabbitMQ disconnected: Dropping live broadcast for event [${eventType}] (id: ${eventId}). Outbox record required.`,
      );
      return null;
    }

    let returnedUnrouted = false;
    const returnListener = (returnedMsg: any) => {
      if (returnedMsg?.properties?.messageId === eventId) {
        returnedUnrouted = true;
        this.logger.warn(
          `Message [${eventId}] with routingKey [${eventType}] was returned unrouted by broker (basic.return).`,
        );
      }
    };

    if (options?.mandatory) {
      confirmChannel.on('return', returnListener);
    }

    try {
      const content = Buffer.from(JSON.stringify(envelope), 'utf8');

      await new Promise<void>((resolve, reject) => {
        confirmChannel.publish(
          RABBITMQ_EXCHANGE_NAME,
          eventType,
          content,
          {
            persistent: true,
            mandatory: options?.mandatory ?? false,
            contentType: 'application/json',
            messageId: eventId,
            timestamp: Date.now(),
            correlationId: options?.correlationId,
            headers: options?.headers,
          },
          (err) => {
            if (err) {
              return reject(err);
            }
            resolve();
          },
        );
      });

      if (returnedUnrouted) {
        this.logger.warn(
          `Publisher mandatory check failed: message [${eventId}] dropped because no queue was bound to routingKey [${eventType}].`,
        );
        return null;
      }

      this.logger.log(
        `Published confirmed event [${eventType}] to [${RABBITMQ_EXCHANGE_NAME}] (id: ${eventId}).`,
      );
      return envelope;
    } catch (err) {
      this.logger.error(
        `Failed to publish confirmed event [${eventType}] (id: ${eventId}):`,
        err,
      );
      // Return null rather than falsely reporting successful broker delivery
      return null;
    } finally {
      if (options?.mandatory) {
        confirmChannel.off('return', returnListener);
      }
    }
  }
}
