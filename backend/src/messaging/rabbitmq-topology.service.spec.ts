import { beforeEach, describe, expect, it, jest } from '@jest/globals';
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
import { RabbitMqTopologyService } from './rabbitmq-topology.service.js';

describe('RabbitMqTopologyService', () => {
  let service: RabbitMqTopologyService;
  let mockConnectionService: {
    getChannel: jest.MockedFunction<any>;
    onConnected: jest.MockedFunction<any>;
  };
  let mockChannel: {
    assertExchange: jest.MockedFunction<any>;
    assertQueue: jest.MockedFunction<any>;
    bindQueue: jest.MockedFunction<any>;
  };

  beforeEach(() => {
    mockChannel = {
      assertExchange: jest.fn<any>().mockResolvedValue({}),
      assertQueue: jest.fn<any>().mockResolvedValue({}),
      bindQueue: jest.fn<any>().mockResolvedValue({}),
    };

    mockConnectionService = {
      getChannel: jest.fn<any>().mockReturnValue(mockChannel),
      onConnected: jest.fn<any>(),
    };

    service = new RabbitMqTopologyService(
      mockConnectionService as unknown as RabbitMqConnectionService,
    );
  });

  it('subscribes to onConnected during onModuleInit', () => {
    service.onModuleInit();
    expect(mockConnectionService.onConnected).toHaveBeenCalledTimes(1);
    expect(typeof mockConnectionService.onConnected.mock.calls[0][0]).toBe(
      'function',
    );
  });

  it('asserts complete topology including DLX, DLQ, primary exchange, and consumer bindings', async () => {
    await service.assertTopology();

    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      RABBITMQ_DLX_EXCHANGE_NAME,
      RABBITMQ_DLX_EXCHANGE_TYPE,
      { durable: true },
    );
    expect(mockChannel.assertQueue).toHaveBeenCalledWith(RABBITMQ_DLQ_NAME, {
      durable: true,
    });
    expect(mockChannel.bindQueue).toHaveBeenCalledWith(
      RABBITMQ_DLQ_NAME,
      RABBITMQ_DLX_EXCHANGE_NAME,
      RABBITMQ_DLQ_NAME,
    );
    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      RABBITMQ_EXCHANGE_NAME,
      RABBITMQ_EXCHANGE_TYPE,
      { durable: true },
    );
    expect(mockChannel.assertQueue).toHaveBeenCalledWith(
      RABBITMQ_INCOMING_QUEUE,
      {
        durable: true,
        deadLetterExchange: RABBITMQ_DLX_EXCHANGE_NAME,
        deadLetterRoutingKey: RABBITMQ_DLQ_NAME,
      },
    );

    for (const pattern of RABBITMQ_CONSUMER_BINDINGS) {
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        RABBITMQ_INCOMING_QUEUE,
        RABBITMQ_EXCHANGE_NAME,
        pattern,
      );
    }
  });

  it('logs warning and returns early if channel is null', async () => {
    mockConnectionService.getChannel.mockReturnValue(null);
    await service.assertTopology();
    expect(mockChannel.assertExchange).not.toHaveBeenCalled();
  });

  it('propagates error when topology assertion fails', async () => {
    const error = new Error('Broker disconnected');
    mockChannel.assertExchange.mockRejectedValueOnce(error);

    await expect(service.assertTopology()).rejects.toThrow(error);
  });
});
