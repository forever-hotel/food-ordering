import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, ConsumeMessage } from 'amqplib';
import { GuestSessionsService } from '../modules/guest-sessions/services/guest-sessions.service.js';
import { RealtimeEventType } from '../realtime/enums/realtime-event-type.enum.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import {
  ConsumerHandler,
  SignedEventEnvelope,
} from './interfaces/messaging.interfaces.js';
import {
  RABBITMQ_EXCHANGE_NAME,
  RABBITMQ_INCOMING_QUEUE,
  RABBITMQ_MAX_RETRIES,
} from './messaging.constants.js';
import { RabbitMqConnectionService } from './rabbitmq-connection.service.js';
import { RabbitMqTopologyService } from './rabbitmq-topology.service.js';
import { verifyEnvelopeSignature } from './utils/envelope-signer.js';

@Injectable()
export class RabbitMqConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConsumerService.name);

  private consumerTag: string | null = null;
  private readonly processedEventIds = new Set<string>();
  private readonly retryCounts = new Map<string, number>();
  private readonly customHandlers = new Map<string, ConsumerHandler[]>();

  constructor(
    private readonly connectionService: RabbitMqConnectionService,
    private readonly topologyService: RabbitMqTopologyService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtimeService: RealtimeService,
    @Inject(forwardRef(() => GuestSessionsService))
    private readonly guestSessionsService: GuestSessionsService,
  ) {}

  public onModuleInit(): void {
    this.connectionService.onConnected(async () => {
      await this.startConsumer();
    });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.stopConsumer();
  }

  /**
   * Registers a custom handler callback for a specific routing key or prefix.
   */
  public registerCustomHandler(
    pattern: string,
    handler: ConsumerHandler,
  ): void {
    const list = this.customHandlers.get(pattern) || [];
    list.push(handler);
    this.customHandlers.set(pattern, list);
  }

  public async startConsumer(): Promise<void> {
    const channel = this.connectionService.getChannel();
    if (!channel) {
      this.logger.warn('Cannot start RabbitMQ consumer: channel is not ready.');
      return;
    }

    try {
      await this.topologyService.assertTopology();
      await channel.prefetch(10);
      const { consumerTag } = await channel.consume(
        RABBITMQ_INCOMING_QUEUE,
        async (msg) => {
          if (!msg) {
            return;
          }
          await this.handleIncomingMessage(channel, msg);
        },
        { noAck: false },
      );
      this.consumerTag = consumerTag;
      this.logger.log(
        `RabbitMQ consumer registered on queue [${RABBITMQ_INCOMING_QUEUE}] with tag [${consumerTag}].`,
      );
    } catch (err) {
      this.logger.error('Failed to start RabbitMQ consumer:', err);
    }
  }

  public async stopConsumer(): Promise<void> {
    const channel = this.connectionService.getChannel();
    if (channel && this.consumerTag) {
      try {
        await channel.cancel(this.consumerTag);
        this.consumerTag = null;
      } catch (err) {
        this.logger.error('Error cancelling consumer tag:', err);
      }
    }
  }

  /**
   * Processes an incoming AMQP message with bounded retries, deduplication, and HMAC verification.
   */
  public async handleIncomingMessage(
    channel: Channel,
    msg: ConsumeMessage,
  ): Promise<void> {
    const routingKey = msg.fields.routingKey;
    let envelope: SignedEventEnvelope<Record<string, unknown>>;

    // 1. Parse JSON payload
    try {
      envelope = JSON.parse(
        msg.content.toString('utf8'),
      ) as SignedEventEnvelope<Record<string, unknown>>;
    } catch {
      this.logger.error(
        `Poison message on [${routingKey}]: Malformed JSON. Routing to DLQ.`,
      );
      channel.nack(msg, false, false);
      return;
    }

    // 2. Event deduplication check
    if (envelope.eventId && this.processedEventIds.has(envelope.eventId)) {
      this.logger.log(
        `Duplicate event [${envelope.eventId}] received on [${routingKey}]. Acknowledging idempotently.`,
      );
      channel.ack(msg);
      return;
    }

    // 3. HMAC Signature Verification (Fail-Closed)
    const secretKey =
      this.configService.get<string>('INTERNAL_SERVICE_KEY') ||
      'development-internal-service-key-at-least-32-chars';

    const isVerified = verifyEnvelopeSignature(envelope, secretKey);
    if (!isVerified) {
      this.logger.warn(
        `SECURITY AUDIT: Tampered or invalid signature on event [${envelope.eventId || 'unknown'}] on [${routingKey}]. Discarding to DLQ.`,
      );
      channel.nack(msg, false, false);
      return;
    }

    // 4. Bounded Broker-Supported Retry Inspection & Dispatch
    const eventRetryKey =
      envelope.eventId || `${routingKey}:${msg.fields.deliveryTag}`;
    const headerRetries =
      typeof msg.properties.headers?.['x-retry-count'] === 'number'
        ? (msg.properties.headers['x-retry-count'] as number)
        : 0;

    let xDeathCount = 0;
    const xDeath = msg.properties.headers?.['x-death'];
    if (Array.isArray(xDeath)) {
      xDeathCount = xDeath.reduce(
        (sum, d) =>
          sum + (typeof d.count === 'number' ? (d.count as number) : 1),
        0,
      );
    }

    const brokerPersistedRetries = Math.max(headerRetries, xDeathCount);
    const crashRedelivery = msg.fields.redelivered ? 1 : 0;
    const currentRetries = Math.max(
      brokerPersistedRetries + crashRedelivery,
      this.retryCounts.get(eventRetryKey) || 0,
    );

    if (currentRetries >= RABBITMQ_MAX_RETRIES) {
      this.logger.warn(
        `Event [${envelope.eventId || 'unknown'}] on [${routingKey}] reached maximum retries (${currentRetries}/${RABBITMQ_MAX_RETRIES}). Rejecting to DLQ.`,
      );
      this.retryCounts.delete(eventRetryKey);
      channel.nack(msg, false, false);
      return;
    }

    try {
      await this.dispatchEnvelope(envelope, routingKey);

      // Clean up retry tracker upon successful processing
      this.retryCounts.delete(eventRetryKey);

      // Track processed event for deduplication (capped at 5000)
      if (envelope.eventId) {
        this.processedEventIds.add(envelope.eventId);
        if (this.processedEventIds.size > 5000) {
          const [first] = this.processedEventIds;
          if (first) {
            this.processedEventIds.delete(first);
          }
        }
      }

      channel.ack(msg);
    } catch (processErr) {
      const nextAttempt = currentRetries + 1;
      this.retryCounts.set(eventRetryKey, nextAttempt);

      this.logger.error(
        `Error processing event [${envelope.eventId}] on [${routingKey}] (attempt ${nextAttempt}/${RABBITMQ_MAX_RETRIES}):`,
        processErr,
      );

      if (nextAttempt >= RABBITMQ_MAX_RETRIES) {
        this.logger.warn(
          `Max retries (${RABBITMQ_MAX_RETRIES}) reached for event [${envelope.eventId}]. Dead-lettering message to DLQ.`,
        );
        this.retryCounts.delete(eventRetryKey);
        channel.nack(msg, false, false);
      } else {
        this.logger.warn(
          `Retrying event [${envelope.eventId}] (attempt ${nextAttempt}/${RABBITMQ_MAX_RETRIES}) with broker-confirmed republish before acknowledgement.`,
        );

        // Bounded backoff delay before requeuing to avoid CPU hot-loops
        await new Promise((r) =>
          setTimeout(r, Math.min(100 * nextAttempt, 1000)),
        );

        const confirmChannel = this.connectionService.getConfirmChannel();
        if (!confirmChannel || !this.connectionService.isConnected()) {
          this.logger.warn(
            `Broker unavailable during retry of [${envelope.eventId}]. Requeueing original delivery to prevent message loss.`,
          );
          channel.nack(msg, false, true);
          return;
        }

        try {
          // Await broker publisher confirmation before acknowledging the original delivery
          await new Promise<void>((resolve, reject) => {
            confirmChannel.publish(
              RABBITMQ_EXCHANGE_NAME,
              routingKey,
              msg.content,
              {
                ...msg.properties,
                persistent: true,
                headers: {
                  ...msg.properties.headers,
                  'x-retry-count': nextAttempt,
                  'x-last-error': String(
                    processErr instanceof Error
                      ? processErr.message
                      : processErr,
                  ),
                },
              },
              (err) => {
                if (err) {
                  return reject(err);
                }
                resolve();
              },
            );
          });

          // ONLY acknowledge original delivery AFTER the republished message is confirmed by broker
          channel.ack(msg);
        } catch (repubErr) {
          this.logger.error(
            `Failed to confirm republished retry message for [${envelope.eventId}]. Requeueing original message safely:`,
            repubErr,
          );
          // Never acknowledge the original delivery if republishing failed
          channel.nack(msg, false, true);
        }
      }
    }
  }

  /**
   * Resets internal in-memory caches for crash / restart simulation in tests.
   */
  public resetInMemoryState(): void {
    this.processedEventIds.clear();
    this.retryCounts.clear();
  }

  /**
   * Dispatches the verified event to internal handlers and realtime streams.
   */
  private async dispatchEnvelope(
    envelope: SignedEventEnvelope<Record<string, unknown>>,
    routingKey: string,
  ): Promise<void> {
    const payload = envelope.payload || {};
    const bookingId = (payload.bookingId as string) || '';
    const roomNumber = (payload.roomNumber as string) || '';

    // Route to custom handlers if registered
    for (const [pattern, handlers] of this.customHandlers.entries()) {
      if (
        pattern === routingKey ||
        (pattern.endsWith('*') && routingKey.startsWith(pattern.slice(0, -1)))
      ) {
        for (const handler of handlers) {
          await handler(envelope, routingKey);
        }
      }
    }

    // Default domain event routing
    if (routingKey.startsWith('kms.order.') && bookingId && roomNumber) {
      this.realtimeService.emitToStay(
        bookingId,
        roomNumber,
        RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
        payload,
        envelope.eventId,
      );
    } else if (routingKey.startsWith('wkms.task.') && bookingId && roomNumber) {
      this.realtimeService.emitToStay(
        bookingId,
        roomNumber,
        RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
        payload,
        envelope.eventId,
      );
    } else if (
      routingKey.startsWith('mad.complaint.') &&
      bookingId &&
      roomNumber
    ) {
      this.realtimeService.emitToStay(
        bookingId,
        roomNumber,
        RealtimeEventType.COMPLAINT_STATUS_UPDATED,
        payload,
        envelope.eventId,
      );
    } else if (routingKey === 'fds.guest.checkout' && bookingId) {
      await this.guestSessionsService.handleFdsCheckoutEvent({
        eventId: envelope.eventId,
        eventType: 'fds.guest.checkout',
        bookingId,
        roomNumber: roomNumber || 'UNKNOWN',
        checkoutTime: envelope.timestamp,
      });
      if (roomNumber) {
        this.realtimeService.revokeStaySessions(bookingId, roomNumber);
      }
    } else if (routingKey === 'fds.guest.room_reassigned' && bookingId) {
      const oldRoomNumber = (payload.oldRoomNumber as string) || roomNumber;
      const newRoomNumber = (payload.newRoomNumber as string) || '';
      await this.guestSessionsService.handleFdsRoomReassignEvent({
        eventId: envelope.eventId,
        eventType: 'fds.room.reassigned',
        bookingId,
        previousRoomNumber: oldRoomNumber,
        newRoomNumber,
        reassignedAt: envelope.timestamp,
      });
      if (oldRoomNumber) {
        this.realtimeService.revokeStaySessions(bookingId, oldRoomNumber);
      }
    }
  }
}
