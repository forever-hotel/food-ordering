import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import amqp, { Channel, ChannelModel } from 'amqplib';
import { HealthService } from '../src/health/health.service.js';
import {
  RABBITMQ_DLQ_NAME,
  RABBITMQ_EXCHANGE_NAME,
  RABBITMQ_INCOMING_QUEUE,
} from '../src/messaging/messaging.constants.js';
import { RabbitMqConnectionService } from '../src/messaging/rabbitmq-connection.service.js';
import { RabbitMqConsumerService } from '../src/messaging/rabbitmq-consumer.service.js';
import { RabbitMqPublisherService } from '../src/messaging/rabbitmq-publisher.service.js';
import { RabbitMqTopologyService } from '../src/messaging/rabbitmq-topology.service.js';
import { signEnvelope } from '../src/messaging/utils/envelope-signer.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { RealtimeEventType } from '../src/realtime/enums/realtime-event-type.enum.js';
import { RealtimeService } from '../src/realtime/realtime.service.js';

describe('RabbitMQ Live Broker Integration (CIT-04 Phase B)', () => {
  let app: INestApplication;
  let connectionService: RabbitMqConnectionService;
  let topologyService: RabbitMqTopologyService;
  let publisherService: RabbitMqPublisherService;
  let consumerService: RabbitMqConsumerService;
  let realtimeService: RealtimeService;
  let healthService: HealthService;

  let directConn: ChannelModel;
  let directChannel: Channel;

  const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://127.0.0.1:5672';
  const secretKey = 'test-internal-service-key-at-least-32-chars-long';

  beforeAll(async () => {
    // 1. Direct connection to verify broker accessibility
    try {
      directConn = await amqp.connect(rabbitUrl);
      directChannel = await directConn.createChannel();
    } catch {
      console.warn(
        'RabbitMQ broker unreachable at ' +
          rabbitUrl +
          '. Skipping live tests.',
      );
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              RABBITMQ_ENABLED: 'true',
              RABBITMQ_URL: rabbitUrl,
              INTERNAL_SERVICE_KEY: secretKey,
            }),
          ],
        }),
      ],
      providers: [
        RealtimeService,
        RabbitMqConnectionService,
        RabbitMqTopologyService,
        RabbitMqPublisherService,
        RabbitMqConsumerService,
        HealthService,
        {
          provide: GuestSessionsService,
          useValue: {
            handleFdsCheckoutEvent: jest
              .fn()
              .mockResolvedValue({ status: 'SUCCESS' } as any),
            handleFdsRoomReassignEvent: jest
              .fn()
              .mockResolvedValue({ status: 'SUCCESS' } as any),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    connectionService = app.get(RabbitMqConnectionService);
    topologyService = app.get(RabbitMqTopologyService);
    publisherService = app.get(RabbitMqPublisherService);
    consumerService = app.get(RabbitMqConsumerService);
    realtimeService = app.get(RealtimeService);
    healthService = app.get(HealthService);

    // Wait for connection and topology initialization
    let attempts = 0;
    while (!connectionService.isConnected() && attempts < 20) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }

    await topologyService.assertTopology();
  }, 25000);

  afterAll(async () => {
    if (directChannel) {
      await directChannel.close().catch(() => {});
    }
    if (directConn) {
      await directConn.close().catch(() => {});
    }
    if (app) {
      await app.close().catch(() => {});
    }
  });

  it('establishes active AMQP connection and reports healthy readiness', async () => {
    if (!directConn) return;

    expect(connectionService.isConnected()).toBe(true);

    const readiness = await healthService.checkReadiness();
    expect(readiness.messaging).toBeDefined();
    expect(readiness.messaging?.status).toBe('up');
    expect(readiness.messaging?.connected).toBe(true);
  });

  it('asserts durable exchanges and dead-letter queue topology', async () => {
    if (!directConn) return;

    // Direct broker assertions
    const incomingQueueInfo = await directChannel.checkQueue(
      RABBITMQ_INCOMING_QUEUE,
    );
    expect(incomingQueueInfo).toBeDefined();

    const dlqInfo = await directChannel.checkQueue(RABBITMQ_DLQ_NAME);
    expect(dlqInfo).toBeDefined();
  });

  it('publishes domain event with publisher confirm to topic exchange', async () => {
    if (!directConn) return;

    const payload = {
      orderId: 'live-ord-001',
      bookingId: 'book-live-101',
      roomNumber: '101',
      totalAmount: 42.0,
      itemCount: 1,
      createdAt: new Date().toISOString(),
    };

    const envelope = await publisherService.publishEvent(
      'foss.order.created',
      payload,
    );
    expect(envelope).not.toBeNull();
    expect(envelope?.eventId).toBeDefined();
    expect(envelope?.signature).toBeDefined();
  });

  it('consumes signed event from queue, acknowledges, and delivers to realtime stay stream', async () => {
    if (!directConn) return;

    const targetBooking = 'booking-live-stream-101';
    const targetRoom = '101';

    const rawEvent = {
      eventId: 'evt-live-kms-999',
      eventType: 'kms.order.status_changed',
      version: '1.0',
      source: 'kms.service',
      timestamp: new Date().toISOString(),
      payload: {
        orderId: 'order-kms-live-101',
        bookingId: targetBooking,
        roomNumber: targetRoom,
        status: 'READY_FOR_DELIVERY',
      },
    };

    const signature = signEnvelope(rawEvent, secretKey);
    const envelope = { ...rawEvent, signature };

    // Subscribe to realtime stream before publishing
    const receivedRealtimeEvents: any[] = [];
    const sub = realtimeService
      .getChannelStream(targetBooking, targetRoom)
      .subscribe((msg) => receivedRealtimeEvents.push(msg.data));

    // Publish directly to exchange on routing key kms.order.status_changed
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'kms.order.status_changed',
      Buffer.from(JSON.stringify(envelope), 'utf8'),
      {
        contentType: 'application/json',
        messageId: rawEvent.eventId,
      },
    );

    // Wait for consumer delivery
    let waitCount = 0;
    while (receivedRealtimeEvents.length === 0 && waitCount < 30) {
      await new Promise((r) => setTimeout(r, 100));
      waitCount++;
    }

    sub.unsubscribe();

    expect(receivedRealtimeEvents.length).toBeGreaterThanOrEqual(1);
    expect(receivedRealtimeEvents[0].eventType).toBe(
      RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
    );
    expect(receivedRealtimeEvents[0].data.status).toBe('READY_FOR_DELIVERY');
  });

  it('dead-letters poison message with invalid HMAC signature to foss.events.dlq', async () => {
    if (!directConn) return;

    // Purge DLQ first
    await directChannel.purgeQueue(RABBITMQ_DLQ_NAME);

    const poisonEvent = {
      eventId: 'evt-poison-tampered',
      eventType: 'kms.order.status_changed',
      version: '1.0',
      source: 'kms.service',
      timestamp: new Date().toISOString(),
      payload: { bookingId: 'b1', roomNumber: '101' },
      signature: 'corrupted-hex-signature-12345',
    };

    // Publish to exchange -> routed to foss.incoming.events
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'kms.order.status_changed',
      Buffer.from(JSON.stringify(poisonEvent), 'utf8'),
      {
        contentType: 'application/json',
        messageId: poisonEvent.eventId,
      },
    );

    // Wait for consumer to process, fail HMAC, and nack to DLQ
    let dlqCount = 0;
    let pollCount = 0;
    while (dlqCount === 0 && pollCount < 20) {
      await new Promise((r) => setTimeout(r, 150));
      const check = await directChannel.checkQueue(RABBITMQ_DLQ_NAME);
      dlqCount = check.messageCount;
      pollCount++;
    }

    expect(dlqCount).toBeGreaterThanOrEqual(1);

    // Read message from DLQ to verify it is the poisoned event
    const dlqMsg = await directChannel.get(RABBITMQ_DLQ_NAME, { noAck: true });
    expect(dlqMsg).not.toBe(false);
    if (dlqMsg) {
      const parsed = JSON.parse(dlqMsg.content.toString('utf8'));
      expect(parsed.eventId).toBe('evt-poison-tampered');
    }
  });

  it('routes malformed non-JSON message immediately to DLQ without crashing consumer', async () => {
    if (!directConn) return;

    await directChannel.purgeQueue(RABBITMQ_DLQ_NAME);

    // Publish completely invalid non-JSON payload
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'kms.order.status_changed',
      Buffer.from('MALFORMED_NON_JSON_CONTENT{{{', 'utf8'),
      {
        contentType: 'text/plain',
      },
    );

    let dlqCount = 0;
    let pollCount = 0;
    while (dlqCount === 0 && pollCount < 20) {
      await new Promise((r) => setTimeout(r, 150));
      const check = await directChannel.checkQueue(RABBITMQ_DLQ_NAME);
      dlqCount = check.messageCount;
      pollCount++;
    }

    expect(dlqCount).toBeGreaterThanOrEqual(1);

    const dlqMsg = await directChannel.get(RABBITMQ_DLQ_NAME, { noAck: true });
    expect(dlqMsg).not.toBe(false);
    if (dlqMsg) {
      expect(dlqMsg.content.toString('utf8')).toBe(
        'MALFORMED_NON_JSON_CONTENT{{{',
      );
    }
  });

  it('handles duplicate events idempotently without double-emitting to guest stay stream', async () => {
    if (!directConn) return;

    const dupBooking = 'booking-dup-test-888';
    const dupRoom = '888';
    const dupEventId = 'evt-duplicate-idempotency-001';

    const rawEvent = {
      eventId: dupEventId,
      eventType: 'kms.order.status_changed',
      version: '1.0',
      source: 'kms.service',
      timestamp: new Date().toISOString(),
      payload: {
        orderId: 'order-dup-888',
        bookingId: dupBooking,
        roomNumber: dupRoom,
        status: 'PREPARING',
      },
    };

    const signature = signEnvelope(rawEvent, secretKey);
    const envelope = { ...rawEvent, signature };

    const receivedEvents: any[] = [];
    const sub = realtimeService
      .getChannelStream(dupBooking, dupRoom)
      .subscribe((msg) => receivedEvents.push(msg.data));

    // First delivery
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'kms.order.status_changed',
      Buffer.from(JSON.stringify(envelope), 'utf8'),
      {
        contentType: 'application/json',
        messageId: dupEventId,
      },
    );

    let waitCount = 0;
    while (receivedEvents.length === 0 && waitCount < 25) {
      await new Promise((r) => setTimeout(r, 100));
      waitCount++;
    }

    expect(receivedEvents.length).toBe(1);

    // Duplicate redelivery with identical eventId
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'kms.order.status_changed',
      Buffer.from(JSON.stringify(envelope), 'utf8'),
      {
        contentType: 'application/json',
        messageId: dupEventId,
      },
    );

    // Wait and verify no duplicate emission occurred
    await new Promise((r) => setTimeout(r, 600));
    sub.unsubscribe();

    expect(receivedEvents.length).toBe(1);
  });

  it('routes events strictly to target guest stay with zero cross-room or cross-booking leakage', async () => {
    if (!directConn) return;

    const targetBooking = 'booking-tenant-A';
    const targetRoom = '101';
    const isolatedBooking = 'booking-tenant-B';
    const isolatedRoom = '102';

    const eventsForTarget: any[] = [];
    const eventsForIsolated: any[] = [];

    const subTarget = realtimeService
      .getChannelStream(targetBooking, targetRoom)
      .subscribe((msg) => eventsForTarget.push(msg.data));

    const subIsolated = realtimeService
      .getChannelStream(isolatedBooking, isolatedRoom)
      .subscribe((msg) => eventsForIsolated.push(msg.data));

    const rawEvent = {
      eventId: 'evt-isolation-leakage-check',
      eventType: 'kms.order.status_changed',
      version: '1.0',
      source: 'kms.service',
      timestamp: new Date().toISOString(),
      payload: {
        orderId: 'order-isolation-test',
        bookingId: targetBooking,
        roomNumber: targetRoom,
        status: 'OUT_FOR_DELIVERY',
      },
    };

    const signature = signEnvelope(rawEvent, secretKey);
    const envelope = { ...rawEvent, signature };

    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'kms.order.status_changed',
      Buffer.from(JSON.stringify(envelope), 'utf8'),
      {
        contentType: 'application/json',
        messageId: rawEvent.eventId,
      },
    );

    let waitCount = 0;
    while (eventsForTarget.length === 0 && waitCount < 25) {
      await new Promise((r) => setTimeout(r, 100));
      waitCount++;
    }

    await new Promise((r) => setTimeout(r, 300));

    subTarget.unsubscribe();
    subIsolated.unsubscribe();

    // Target stay received the update
    expect(eventsForTarget.length).toBe(1);
    expect(eventsForTarget[0].data.status).toBe('OUT_FOR_DELIVERY');

    // Isolated stay received absolutely 0 events (zero leakage)
    expect(eventsForIsolated.length).toBe(0);
  });

  it('progresses bounded retries with broker-persisted headers and routes to DLQ on exhaustion', async () => {
    if (!directConn) return;

    await directChannel.purgeQueue(RABBITMQ_DLQ_NAME);

    const failingEventId = 'evt-retry-exhaust-test-999';
    const attemptsSeen: number[] = [];

    // Register a custom handler that always fails to trigger retry progression
    consumerService.registerCustomHandler(
      'kms.order.failing_test',
      async (envelope) => {
        if (envelope.eventId === failingEventId) {
          attemptsSeen.push(Date.now());
          throw new Error('Simulated transient worker failure');
        }
      },
    );

    const rawEvent = {
      eventId: failingEventId,
      eventType: 'kms.order.failing_test',
      version: '1.0',
      source: 'kms.service',
      timestamp: new Date().toISOString(),
      payload: {
        bookingId: 'book-retry',
        roomNumber: '101',
      },
    };

    const signature = signEnvelope(rawEvent, secretKey);
    const envelope = { ...rawEvent, signature };

    // Publish to exchange -> routed to foss.incoming.events
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'kms.order.failing_test',
      Buffer.from(JSON.stringify(envelope), 'utf8'),
      {
        contentType: 'application/json',
        messageId: failingEventId,
      },
    );

    // Wait for retries to progress and final rejection to DLQ
    let dlqCount = 0;
    let pollCount = 0;
    while (dlqCount === 0 && pollCount < 30) {
      await new Promise((r) => setTimeout(r, 200));
      const check = await directChannel.checkQueue(RABBITMQ_DLQ_NAME);
      dlqCount = check.messageCount;
      pollCount++;
    }

    expect(dlqCount).toBeGreaterThanOrEqual(1);
    expect(attemptsSeen.length).toBeGreaterThanOrEqual(2);

    // Inspect dead-lettered message from DLQ
    const dlqMsg = await directChannel.get(RABBITMQ_DLQ_NAME, { noAck: true });
    expect(dlqMsg).not.toBe(false);
    if (dlqMsg) {
      const parsed = JSON.parse(dlqMsg.content.toString('utf8'));
      expect(parsed.eventId).toBe(failingEventId);
      expect(dlqMsg.properties.headers?.['x-retry-count']).toBeDefined();
    }
  });

  it('survives consumer restart during retry progression without resetting retry count', async () => {
    if (!directConn) return;

    await directChannel.purgeQueue(RABBITMQ_DLQ_NAME);

    const restartEventId = 'evt-restart-retry-test-777';

    // Directly publish a message that already carries x-retry-count: 2 (as if from earlier consumer)
    const rawEvent = {
      eventId: restartEventId,
      eventType: 'kms.order.restart_fail',
      version: '1.0',
      source: 'kms.service',
      timestamp: new Date().toISOString(),
      payload: { bookingId: 'book-restart', roomNumber: '101' },
    };
    const signature = signEnvelope(rawEvent, secretKey);
    const envelope = { ...rawEvent, signature };

    // Simulate consumer restart
    await consumerService.stopConsumer();
    consumerService.resetInMemoryState();
    await consumerService.startConsumer();

    // Register handler that fails
    consumerService.registerCustomHandler(
      'kms.order.restart_fail',
      async (env) => {
        if (env.eventId === restartEventId) {
          throw new Error('Failure after consumer restart');
        }
      },
    );

    // Publish with header x-retry-count: 2
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'kms.order.restart_fail',
      Buffer.from(JSON.stringify(envelope), 'utf8'),
      {
        contentType: 'application/json',
        messageId: restartEventId,
        headers: {
          'x-retry-count': 2,
        },
      },
    );

    // Because it started at 2, on failure (attempt 3) it must immediately go to DLQ
    let dlqCount = 0;
    let pollCount = 0;
    while (dlqCount === 0 && pollCount < 20) {
      await new Promise((r) => setTimeout(r, 150));
      const check = await directChannel.checkQueue(RABBITMQ_DLQ_NAME);
      dlqCount = check.messageCount;
      pollCount++;
    }

    expect(dlqCount).toBeGreaterThanOrEqual(1);

    const dlqMsg = await directChannel.get(RABBITMQ_DLQ_NAME, { noAck: true });
    expect(dlqMsg).not.toBe(false);
    if (dlqMsg) {
      const parsed = JSON.parse(dlqMsg.content.toString('utf8'));
      expect(parsed.eventId).toBe(restartEventId);
    }
  });

  it('handles duplicate delivery safely after process restart simulation', async () => {
    if (!directConn) return;

    const testEventId = 'evt-dedup-restart-444';
    const rawEvent = {
      eventId: testEventId,
      eventType: 'fds.guest.checkout',
      version: '1.0',
      source: 'fds.service',
      timestamp: new Date().toISOString(),
      payload: {
        bookingId: 'booking-dedup-restart',
        roomNumber: '101',
      },
    };
    const signature = signEnvelope(rawEvent, secretKey);
    const envelope = { ...rawEvent, signature };

    // First delivery
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'fds.guest.checkout',
      Buffer.from(JSON.stringify(envelope), 'utf8'),
      {
        contentType: 'application/json',
        messageId: testEventId,
      },
    );

    await new Promise((r) => setTimeout(r, 200));

    // Clear in-memory deduplication set to simulate process reboot
    consumerService.resetInMemoryState();

    // Redelivery after process restart
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'fds.guest.checkout',
      Buffer.from(JSON.stringify(envelope), 'utf8'),
      {
        contentType: 'application/json',
        messageId: testEventId,
      },
    );

    await new Promise((r) => setTimeout(r, 200));

    // Queue must be empty (both were acknowledged cleanly without unhandled rejections)
    const queueCheck = await directChannel.checkQueue(RABBITMQ_INCOMING_QUEUE);
    expect(queueCheck.messageCount).toBe(0);
  });

  it('handles unroutable messages and publisher confirms safely without throwing', async () => {
    if (!directConn) return;

    // Publish to a routing key that has no queue bindings
    const unroutablePayload = { unroutable: true, timestamp: Date.now() };
    const result = await publisherService.publishEvent(
      'foss.unroutable.unknown_topic',
      unroutablePayload,
      { mandatory: false },
    );

    expect(result).not.toBeNull();
    expect(result?.eventId).toBeDefined();
  });

  it('safely catches publisher errors during broker disconnection', async () => {
    if (!directConn) return;

    // Disconnect
    await connectionService.close();

    const result = await publisherService.publishEvent(
      'foss.disconnected.test',
      {
        offline: true,
      },
    );

    // Should return null (not false positive envelope) when disconnected
    expect(result).toBeNull();

    // Reconnect for remaining tests
    await connectionService.connect();
    expect(connectionService.isConnected()).toBe(true);
  });

  it('maintains strict room isolation after message redelivery', async () => {
    if (!directConn) return;

    const targetBooking = 'booking-redelivery-A';
    const targetRoom = '101';
    const foreignRoom = '102';

    const eventsForTarget: any[] = [];
    const eventsForForeign: any[] = [];

    const subTarget = realtimeService
      .getChannelStream(targetBooking, targetRoom)
      .subscribe((msg) => eventsForTarget.push(msg.data));

    const subForeign = realtimeService
      .getChannelStream('booking-foreign-B', foreignRoom)
      .subscribe((msg) => eventsForForeign.push(msg.data));

    const rawEvent = {
      eventId: 'evt-redelivered-isolation',
      eventType: 'kms.order.status_changed',
      version: '1.0',
      source: 'kms.service',
      timestamp: new Date().toISOString(),
      payload: {
        orderId: 'ord-redelivered-101',
        bookingId: targetBooking,
        roomNumber: targetRoom,
        status: 'READY_FOR_DELIVERY',
      },
    };
    const signature = signEnvelope(rawEvent, secretKey);
    const envelope = { ...rawEvent, signature };

    // Publish with redelivery header
    directChannel.publish(
      RABBITMQ_EXCHANGE_NAME,
      'kms.order.status_changed',
      Buffer.from(JSON.stringify(envelope), 'utf8'),
      {
        contentType: 'application/json',
        messageId: rawEvent.eventId,
        headers: { 'x-retry-count': 1 },
      },
    );

    let waitCount = 0;
    while (eventsForTarget.length === 0 && waitCount < 25) {
      await new Promise((r) => setTimeout(r, 100));
      waitCount++;
    }

    await new Promise((r) => setTimeout(r, 200));

    subTarget.unsubscribe();
    subForeign.unsubscribe();

    expect(eventsForTarget.length).toBe(1);
    expect(eventsForForeign.length).toBe(0);
  });

  it('detects connection drop, reports down in health probe, and recovers after reconnect', async () => {
    if (!directConn) return;

    // Simulate connection drop by closing active connection
    await connectionService.close();
    expect(connectionService.isConnected()).toBe(false);

    const downReadiness = await healthService.checkReadiness();
    expect(downReadiness.messaging?.status).toBe('down');
    expect(downReadiness.messaging?.connected).toBe(false);

    // Reconnect
    const reconnected = await connectionService.connect();
    expect(reconnected).toBe(true);
    expect(connectionService.isConnected()).toBe(true);

    const upReadiness = await healthService.checkReadiness();
    expect(upReadiness.messaging?.status).toBe('up');
    expect(upReadiness.messaging?.connected).toBe(true);
  });

  it('performs graceful consumer cancellation and connection shutdown', async () => {
    if (!directConn) return;

    expect(connectionService.isConnected()).toBe(true);

    // Cancel consumer and close connection
    await consumerService.stopConsumer();
    await connectionService.close();

    expect(connectionService.isConnected()).toBe(false);

    const shutdownReadiness = await healthService.checkReadiness();
    expect(shutdownReadiness.messaging?.status).toBe('down');
    expect(shutdownReadiness.messaging?.connected).toBe(false);
  });
});
