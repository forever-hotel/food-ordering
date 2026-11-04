import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Channel, ConsumeMessage } from 'amqplib';
import { GuestSessionsService } from '../modules/guest-sessions/services/guest-sessions.service.js';
import { RealtimeEventType } from '../realtime/enums/realtime-event-type.enum.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { RabbitMqConnectionService } from './rabbitmq-connection.service.js';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service.js';
import { RabbitMqTopologyService } from './rabbitmq-topology.service.js';
import { signEnvelope } from './utils/envelope-signer.js';

describe('RabbitMqConsumerService', () => {
  let service: RabbitMqConsumerService;
  let mockChannel: Partial<Channel>;
  let mockConfirmChannel: any;
  let mockRealtimeService: Partial<RealtimeService>;
  let mockGuestSessionsService: Partial<GuestSessionsService>;
  const secretKey = 'test-secret-key-at-least-32-chars-long';

  beforeEach(async () => {
    mockChannel = {
      prefetch: jest.fn().mockResolvedValue({}),
      consume: jest.fn().mockResolvedValue({ consumerTag: 'tag-1' } as any),
      cancel: jest.fn().mockResolvedValue({} as any),
      ack: jest.fn(),
      nack: jest.fn(),
    };

    mockRealtimeService = {
      emitToStay: jest.fn(),
      revokeStaySessions: jest.fn(),
    };

    mockGuestSessionsService = {
      handleFdsCheckoutEvent: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        revokedSessionCount: 1,
      } as any),
      handleFdsRoomReassignEvent: jest.fn().mockResolvedValue({} as any),
    };

    mockConfirmChannel = {
      publish: jest.fn(
        (
          _exchange: string,
          _routingKey: string,
          _content: Buffer,
          _options: any,
          callback?: (err?: any) => void,
        ) => {
          if (callback) callback();
          return true;
        },
      ),
    };

    const mockConnectionService = {
      getChannel: jest.fn().mockReturnValue(mockChannel),
      getConfirmChannel: jest.fn().mockReturnValue(mockConfirmChannel),
      isConnected: jest.fn().mockReturnValue(true),
      onConnected: jest.fn((cb) => cb()),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'INTERNAL_SERVICE_KEY') {
          return secretKey;
        }
        return null;
      }),
    };

    const mockTopologyService = {
      assertTopology: jest.fn().mockResolvedValue(undefined as any),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMqConsumerService,
        {
          provide: RabbitMqConnectionService,
          useValue: mockConnectionService,
        },
        {
          provide: RabbitMqTopologyService,
          useValue: mockTopologyService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RealtimeService,
          useValue: mockRealtimeService,
        },
        {
          provide: GuestSessionsService,
          useValue: mockGuestSessionsService,
        },
      ],
    }).compile();

    service = module.get<RabbitMqConsumerService>(RabbitMqConsumerService);
  });

  function createSignedMessage(
    routingKey: string,
    payload: Record<string, unknown>,
    eventId = 'evt-001',
    retryCount = 0,
  ): ConsumeMessage {
    const rawEnvelope = {
      eventId,
      eventType: routingKey,
      version: '1.0',
      source: 'upstream.service',
      timestamp: new Date().toISOString(),
      payload,
    };
    const signature = signEnvelope(rawEnvelope, secretKey);
    const fullEnvelope = { ...rawEnvelope, signature };

    return {
      fields: {
        deliveryTag: 1,
        routingKey,
        exchange: 'forever.events',
        redelivered: false,
      },
      properties: {
        headers: { 'x-retry-count': retryCount },
        contentType: 'application/json',
      },
      content: Buffer.from(JSON.stringify(fullEnvelope), 'utf8'),
    } as unknown as ConsumeMessage;
  }

  it('successfully processes valid kms.order.status_changed event and emits to stay stream', async () => {
    const msg = createSignedMessage('kms.order.status_changed', {
      orderId: 'order-1',
      bookingId: 'booking-101',
      roomNumber: '101',
      status: 'PREPARING',
    });

    await service.handleIncomingMessage(mockChannel as Channel, msg);

    expect(mockRealtimeService.emitToStay).toHaveBeenCalledWith(
      'booking-101',
      '101',
      RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
      expect.objectContaining({ orderId: 'order-1', status: 'PREPARING' }),
      'evt-001',
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('rejects malformed JSON to DLQ without requeue', async () => {
    const malformedMsg = {
      fields: { routingKey: 'kms.order.status_changed' },
      properties: { headers: {} },
      content: Buffer.from('not valid json', 'utf8'),
    } as unknown as ConsumeMessage;

    await service.handleIncomingMessage(mockChannel as Channel, malformedMsg);

    expect(mockChannel.nack).toHaveBeenCalledWith(malformedMsg, false, false);
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('rejects messages with invalid HMAC signature to DLQ without requeue', async () => {
    const rawEnvelope = {
      eventId: 'evt-tampered',
      eventType: 'kms.order.status_changed',
      version: '1.0',
      source: 'kms.service',
      timestamp: new Date().toISOString(),
      payload: { bookingId: 'b1', roomNumber: '101' },
      signature: 'invalid-signature-hex',
    };

    const msg = {
      fields: { routingKey: 'kms.order.status_changed' },
      properties: { headers: {} },
      content: Buffer.from(JSON.stringify(rawEnvelope), 'utf8'),
    } as unknown as ConsumeMessage;

    await service.handleIncomingMessage(mockChannel as Channel, msg);

    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(mockRealtimeService.emitToStay).not.toHaveBeenCalled();
  });

  it('deduplicates duplicate eventId idempotently with ACK', async () => {
    const msg = createSignedMessage(
      'kms.order.status_changed',
      { bookingId: 'b1', roomNumber: '101' },
      'evt-dedup',
    );

    await service.handleIncomingMessage(mockChannel as Channel, msg);
    expect(mockChannel.ack).toHaveBeenCalledTimes(1);

    // Send same eventId again
    await service.handleIncomingMessage(mockChannel as Channel, msg);
    expect(mockChannel.ack).toHaveBeenCalledTimes(2);
    // Realtime should only be called once
    expect(mockRealtimeService.emitToStay).toHaveBeenCalledTimes(1);
  });

  it('processes fds.guest.checkout event and revokes stay sessions', async () => {
    const msg = createSignedMessage('fds.guest.checkout', {
      bookingId: 'booking-checkout-101',
      roomNumber: '101',
    });

    await service.handleIncomingMessage(mockChannel as Channel, msg);

    expect(
      mockGuestSessionsService.handleFdsCheckoutEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'booking-checkout-101',
        roomNumber: '101',
      }),
    );
    expect(mockRealtimeService.revokeStaySessions).toHaveBeenCalledWith(
      'booking-checkout-101',
      '101',
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('republishes with confirmation and acks failed event when retry count is below threshold', async () => {
    const msg = createSignedMessage(
      'kms.order.status_changed',
      { bookingId: 'b1', roomNumber: '101' },
      'evt-fail',
      1, // attempt 1
    );

    (mockRealtimeService.emitToStay as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Simulated transient internal failure');
    });

    await service.handleIncomingMessage(mockChannel as Channel, msg);

    expect(mockConfirmChannel.publish).toHaveBeenCalledWith(
      expect.any(String),
      'kms.order.status_changed',
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({
          'x-retry-count': 2,
        }),
      }),
      expect.any(Function),
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('dead-letters failed event when max retries reached', async () => {
    const msg = createSignedMessage(
      'kms.order.status_changed',
      { bookingId: 'b1', roomNumber: '101' },
      'evt-max-fail',
      3, // attempt 3 (max retries)
    );

    (mockRealtimeService.emitToStay as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Simulated persistent failure');
    });

    await service.handleIncomingMessage(mockChannel as Channel, msg);

    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false); // requeue = false -> DLQ
  });

  it('processes wkms.task.status_changed event and emits SERVICE_REQUEST_STATUS_UPDATED', async () => {
    const msg = createSignedMessage('wkms.task.status_changed', {
      bookingId: 'booking-wkms-101',
      roomNumber: '101',
      taskId: 'task-123',
      status: 'IN_PROGRESS',
    });

    await service.handleIncomingMessage(mockChannel as Channel, msg);

    expect(mockRealtimeService.emitToStay).toHaveBeenCalledWith(
      'booking-wkms-101',
      '101',
      RealtimeEventType.SERVICE_REQUEST_STATUS_UPDATED,
      expect.objectContaining({ taskId: 'task-123', status: 'IN_PROGRESS' }),
      expect.any(String),
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('processes mad.complaint.status_changed event and emits COMPLAINT_STATUS_UPDATED', async () => {
    const msg = createSignedMessage('mad.complaint.status_changed', {
      bookingId: 'booking-mad-101',
      roomNumber: '101',
      complaintId: 'cmp-123',
      status: 'INVESTIGATING',
    });

    await service.handleIncomingMessage(mockChannel as Channel, msg);

    expect(mockRealtimeService.emitToStay).toHaveBeenCalledWith(
      'booking-mad-101',
      '101',
      RealtimeEventType.COMPLAINT_STATUS_UPDATED,
      expect.objectContaining({ complaintId: 'cmp-123' }),
      expect.any(String),
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('processes fds.guest.room_reassigned event, invokes handler and revokes old room sessions', async () => {
    const msg = createSignedMessage('fds.guest.room_reassigned', {
      bookingId: 'booking-reassign-101',
      oldRoomNumber: '101',
      newRoomNumber: '202',
    });

    await service.handleIncomingMessage(mockChannel as Channel, msg);

    expect(
      mockGuestSessionsService.handleFdsRoomReassignEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'booking-reassign-101',
        previousRoomNumber: '101',
        newRoomNumber: '202',
      }),
    );
    expect(mockRealtimeService.revokeStaySessions).toHaveBeenCalledWith(
      'booking-reassign-101',
      '101',
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('dispatches to custom handlers registered via registerCustomHandler', async () => {
    const customHandler = jest.fn();
    service.registerCustomHandler('custom.test.event', customHandler);

    const msg = createSignedMessage('custom.test.event', {
      bookingId: 'b-custom',
      roomNumber: '101',
      customData: 'test-value',
    });

    await service.handleIncomingMessage(mockChannel as Channel, msg);

    expect(customHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'custom.test.event',
        payload: expect.objectContaining({ customData: 'test-value' }),
      }),
      'custom.test.event',
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('handles null message in consumer callback gracefully', async () => {
    let capturedCallback: any;
    (mockChannel.consume as jest.Mock).mockImplementationOnce(
      (_queue: any, cb: any) => {
        capturedCallback = cb;
        return Promise.resolve({ consumerTag: 'tag-test' });
      },
    );

    await service.startConsumer();
    expect(capturedCallback).toBeDefined();

    // Invoking callback with null (e.g. consumer cancelled by RabbitMQ)
    await expect(capturedCallback(null)).resolves.not.toThrow();
    expect(mockChannel.ack).not.toHaveBeenCalled();
  });

  it('handles startConsumer safely when channel is null', async () => {
    const connService = (service as any).connectionService;
    jest.spyOn(connService, 'getChannel').mockReturnValueOnce(null);

    await service.startConsumer();
    expect(mockChannel.consume).not.toHaveBeenCalled();
  });

  it('handles stopConsumer cancelling active consumer tag', async () => {
    (service as any).consumerTag = 'active-tag-123';
    await service.stopConsumer();
    expect(mockChannel.cancel).toHaveBeenCalledWith('active-tag-123');
  });

  it('nacks message with requeue=true when broker is disconnected during retry republish', async () => {
    const msg = createSignedMessage(
      'kms.order.status_changed',
      { bookingId: 'b1', roomNumber: '101' },
      'evt-retry-disconnected',
      1,
    );

    (mockRealtimeService.emitToStay as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Transient error');
    });

    const connService = (service as any).connectionService;
    jest.spyOn(connService, 'isConnected').mockReturnValueOnce(false);

    await service.handleIncomingMessage(mockChannel as Channel, msg);
    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, true);
  });

  it('nacks message with requeue=true when confirmChannel publish encounters error in callback', async () => {
    const msg = createSignedMessage(
      'kms.order.status_changed',
      { bookingId: 'b1', roomNumber: '101' },
      'evt-callback-err',
      1,
    );

    (mockRealtimeService.emitToStay as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Transient error');
    });

    mockConfirmChannel.publish = jest.fn(
      (_ex: any, _rk: any, _buf: any, _opts: any, cb?: (err?: any) => void) => {
        if (cb) cb(new Error('Publish failed'));
        return false;
      },
    );

    await service.handleIncomingMessage(mockChannel as Channel, msg);
    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, true);
  });

  it('trims processedEventIds LRU set when size exceeds 5000', async () => {
    const cache = (service as any).processedEventIds as Set<string>;
    for (let i = 0; i < 5001; i++) {
      cache.add(`existing-evt-${i}`);
    }

    const msg = createSignedMessage(
      'kms.order.status_changed',
      {
        bookingId: 'b-cache',
        roomNumber: '101',
      },
      'new-evt-5002',
    );

    await service.handleIncomingMessage(mockChannel as Channel, msg);
    expect(cache.has('existing-evt-0')).toBe(false);
    expect(cache.has('new-evt-5002')).toBe(true);
  });
});
