import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqplib';
import { RabbitMqConnectionService } from './rabbitmq-connection.service.js';

describe('RabbitMqConnectionService', () => {
  let service: RabbitMqConnectionService;
  let mockConfigService: {
    get: jest.MockedFunction<(key: string) => string | undefined>;
  };
  let mockConn: any;
  let mockChannel: any;
  let mockConfirmChannel: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'RABBITMQ_ENABLED') return 'true';
        if (key === 'RABBITMQ_URL') return 'amqp://localhost:5672';
        return undefined;
      }),
    };

    mockChannel = {
      close: jest.fn<any>().mockResolvedValue(undefined),
      on: jest.fn<any>(),
    };

    mockConfirmChannel = {
      close: jest.fn<any>().mockResolvedValue(undefined),
      on: jest.fn<any>(),
    };

    mockConn = {
      close: jest.fn<any>().mockResolvedValue(undefined),
      createChannel: jest.fn<any>().mockResolvedValue(mockChannel),
      createConfirmChannel: jest
        .fn<any>()
        .mockResolvedValue(mockConfirmChannel),
      on: jest.fn<any>(),
    };

    jest.spyOn(amqp, 'connect').mockResolvedValue(mockConn as any);

    service = new RabbitMqConnectionService(
      mockConfigService as unknown as ConfigService,
    );
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  describe('isEnabled()', () => {
    it('returns true when RABBITMQ_ENABLED is true or 1', () => {
      mockConfigService.get.mockImplementation((k) =>
        k === 'RABBITMQ_ENABLED' ? 'true' : undefined,
      );
      expect(service.isEnabled()).toBe(true);

      mockConfigService.get.mockImplementation((k) =>
        k === 'RABBITMQ_ENABLED' ? '1' : undefined,
      );
      expect(service.isEnabled()).toBe(true);
    });

    it('returns false when RABBITMQ_ENABLED is false or 0', () => {
      mockConfigService.get.mockImplementation((k) =>
        k === 'RABBITMQ_ENABLED' ? 'false' : undefined,
      );
      expect(service.isEnabled()).toBe(false);

      mockConfigService.get.mockImplementation((k) =>
        k === 'RABBITMQ_ENABLED' ? '0' : undefined,
      );
      expect(service.isEnabled()).toBe(false);
    });

    it('falls back to RABBITMQ_URL when RABBITMQ_ENABLED is undefined', () => {
      mockConfigService.get.mockImplementation((k) =>
        k === 'RABBITMQ_URL' ? 'amqp://broker:5672' : undefined,
      );
      expect(service.isEnabled()).toBe(true);

      mockConfigService.get.mockImplementation(() => undefined);
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('connect() & lifecycle', () => {
    it('connects and initializes channels successfully', async () => {
      const connected = await service.connect();
      expect(connected).toBe(true);
      expect(service.isConnected()).toBe(true);
      expect(service.getChannel()).toBe(mockChannel);
      expect(service.getConfirmChannel()).toBe(mockConfirmChannel);
    });

    it('executes topology callbacks after connection', async () => {
      const callback = jest
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined);
      service.onConnected(callback);

      await service.connect();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('immediately executes callback if already connected', async () => {
      await service.connect();
      const callback = jest
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined);
      service.onConnected(callback);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('handles connection error and schedules reconnect without crashing', async () => {
      jest
        .spyOn(amqp, 'connect')
        .mockRejectedValueOnce(new Error('Connection refused'));

      const connected = await service.connect();
      expect(connected).toBe(false);
      expect(service.isConnected()).toBe(false);
    });

    it('skips connection onModuleInit if disabled', async () => {
      mockConfigService.get.mockReturnValue('false');
      const connectSpy = jest.spyOn(service, 'connect');
      await service.onModuleInit();
      expect(connectSpy).not.toHaveBeenCalled();
    });

    it('closes all channels and connection cleanly on close()', async () => {
      await service.connect();
      await service.close();

      expect(mockConfirmChannel.close).toHaveBeenCalled();
      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConn.close).toHaveBeenCalled();
      expect(service.isConnected()).toBe(false);
    });
  });
});
