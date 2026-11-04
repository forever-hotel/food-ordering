import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfirmChannel } from 'amqplib';
import { RABBITMQ_EXCHANGE_NAME } from './messaging.constants.js';
import { RabbitMqConnectionService } from './rabbitmq-connection.service.js';
import { RabbitMqPublisherService } from './rabbitmq-publisher.service.js';

describe('RabbitMqPublisherService', () => {
  let service: RabbitMqPublisherService;
  let connectionService: jest.Mocked<RabbitMqConnectionService>;
  let mockConfirmChannel: Partial<ConfirmChannel>;

  beforeEach(async () => {
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
      ) as any,
    };

    const mockConnectionService = {
      isEnabled: jest.fn().mockReturnValue(true),
      isConnected: jest.fn().mockReturnValue(true),
      getConfirmChannel: jest.fn().mockReturnValue(mockConfirmChannel),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'INTERNAL_SERVICE_KEY') {
          return 'test-secret-key-at-least-32-chars-long';
        }
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMqPublisherService,
        {
          provide: RabbitMqConnectionService,
          useValue: mockConnectionService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RabbitMqPublisherService>(RabbitMqPublisherService);
    connectionService = module.get(RabbitMqConnectionService);
  });

  it('publishes event with publisher confirms to topic exchange when connected', async () => {
    const payload = {
      orderId: 'ord-101',
      bookingId: 'book-101',
      roomNumber: '101',
      totalAmount: 50.0,
      itemCount: 2,
      createdAt: new Date().toISOString(),
    };

    const result = await service.publishEvent('foss.order.created', payload);

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe('foss.order.created');
    expect(result?.signature).toBeDefined();
    expect(result?.eventId).toBeDefined();

    expect(mockConfirmChannel.publish).toHaveBeenCalledWith(
      RABBITMQ_EXCHANGE_NAME,
      'foss.order.created',
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        contentType: 'application/json',
      }),
      expect.any(Function),
    );
  });

  it('fails safely and returns null when RabbitMQ is disabled', async () => {
    connectionService.isEnabled.mockReturnValue(false);

    const result = await service.publishEvent('foss.order.created', {
      test: true,
    });

    expect(result).toBeNull();
    expect(mockConfirmChannel.publish).not.toHaveBeenCalled();
  });

  it('fails safely and returns null when RabbitMQ is disconnected', async () => {
    connectionService.isConnected.mockReturnValue(false);

    const result = await service.publishEvent('foss.order.created', {
      test: true,
    });

    expect(result).toBeNull();
    expect(mockConfirmChannel.publish).not.toHaveBeenCalled();
  });

  it('catches channel publish errors and returns null', async () => {
    (mockConfirmChannel.publish as jest.Mock).mockImplementation(
      (
        _exchange: string,
        _routingKey: string,
        _content: Buffer,
        _options: any,
        callback?: (err?: any) => void,
      ) => {
        if (callback) callback(new Error('Broker NACK'));
        return false;
      },
    );

    const result = await service.publishEvent('foss.order.created', {
      test: true,
    });

    expect(result).toBeNull();
  });
});
