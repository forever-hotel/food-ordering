import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service.js';

describe('RedisService (Optional Resilient Cache - DDP-159)', () => {
  let service: RedisService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'REDIS_ENABLED') return 'false';
        if (key === 'REDIS_TTL_SECONDS') return '300';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('reports disabled by default when REDIS_ENABLED=false', () => {
    expect(service.isEnabled()).toBe(false);
  });

  it('reports unhealthy when disabled', async () => {
    const healthy = await service.isHealthy();
    expect(healthy).toBe(false);
  });

  it('stores and retrieves cached data with TTL', async () => {
    const testData = { mealPeriod: 'LUNCH', items: ['item-1', 'item-2'] };
    await service.set('foss:menu:catalog:v1:LUNCH', testData, 10);

    const cached = await service.get<typeof testData>(
      'foss:menu:catalog:v1:LUNCH',
    );
    expect(cached).toEqual(testData);
  });

  it('returns null on cache miss', async () => {
    const result = await service.get('non_existent_key');
    expect(result).toBeNull();
  });

  it('expires entries after TTL elapsed', async () => {
    const testData = { item: 'expired' };
    // Set with 0 second TTL (immediate expiration)
    await service.set('foss:test:expired', testData, -1);

    const result = await service.get('foss:test:expired');
    expect(result).toBeNull();
  });

  it('deletes specific cache key via del()', async () => {
    await service.set('key-to-delete', { a: 1 }, 10);
    await service.del('key-to-delete');

    const result = await service.get('key-to-delete');
    expect(result).toBeNull();
  });

  it('flushes keys matching pattern prefix via flushPattern()', async () => {
    await service.set('foss:menu:lunch', { type: 'lunch' }, 10);
    await service.set('foss:menu:dinner', { type: 'dinner' }, 10);
    await service.set('other:key', { type: 'other' }, 10);

    await service.flushPattern('foss:menu:');

    expect(await service.get('foss:menu:lunch')).toBeNull();
    expect(await service.get('foss:menu:dinner')).toBeNull();
    expect(await service.get('other:key')).not.toBeNull();
  });

  it('clears in-memory fallback cache via clear()', async () => {
    await service.set('temp-key', { val: 42 }, 60);
    expect(await service.get('temp-key')).toEqual({ val: 42 });

    service.clear();
    expect(await service.get('temp-key')).toBeNull();
  });

  describe('when enabled with mock client', () => {
    let enabledService: RedisService;
    let mockClient: {
      get: jest.Mock;
      set: jest.Mock;
      del: jest.Mock;
      keys: jest.Mock;
      ping: jest.Mock;
      quit: jest.Mock;
    };

    beforeEach(async () => {
      mockClient = {
        get: jest
          .fn()
          .mockReturnValue(
            Promise.resolve(JSON.stringify({ fromRedis: true })),
          ),
        set: jest.fn().mockReturnValue(Promise.resolve('OK')),
        del: jest.fn().mockReturnValue(Promise.resolve(1)),
        keys: jest.fn().mockReturnValue(Promise.resolve(['foss:menu:test1'])),
        ping: jest.fn().mockReturnValue(Promise.resolve('PONG')),
        quit: jest.fn().mockReturnValue(Promise.resolve('OK')),
      };

      const enabledConfig = {
        get: jest.fn((key: string) => {
          if (key === 'REDIS_ENABLED') return 'true';
          if (key === 'REDIS_URL') return 'redis://127.0.0.1:6379';
          return null;
        }),
      };

      enabledService = new RedisService(
        enabledConfig as unknown as ConfigService,
      );
      // Manually set mock client and connected state
      (enabledService as unknown as { client: unknown }).client = mockClient;
      (enabledService as unknown as { isConnected: boolean }).isConnected =
        true;
    });

    afterEach(async () => {
      await enabledService.onModuleDestroy();
    });

    it('reports enabled and healthy when connected to Redis', async () => {
      expect(enabledService.isEnabled()).toBe(true);
      expect(await enabledService.isHealthy()).toBe(true);
      expect(mockClient.ping).toHaveBeenCalled();
    });

    it('reads from Redis client on get()', async () => {
      const result = await enabledService.get<{ fromRedis: boolean }>(
        'test:key',
      );
      expect(result).toEqual({ fromRedis: true });
      expect(mockClient.get).toHaveBeenCalledWith('test:key');
    });

    it('writes to Redis client on set() with EX option', async () => {
      await enabledService.set('test:key', { foo: 'bar' }, 120);
      expect(mockClient.set).toHaveBeenCalledWith(
        'test:key',
        JSON.stringify({ foo: 'bar' }),
        'EX',
        120,
      );
    });

    it('falls back cleanly to in-memory cache when Redis get() throws an error (fail-open)', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('Connection timed out'));

      // Populate in-memory fallback
      (
        enabledService as unknown as {
          inMemoryFallback: Map<string, { value: string; expiresAt: number }>;
        }
      ).inMemoryFallback.set('error:key', {
        value: JSON.stringify({ fallbackData: true }),
        expiresAt: Date.now() + 60000,
      });

      const result = await enabledService.get<{ fallbackData: boolean }>(
        'error:key',
      );
      expect(result).toEqual({ fallbackData: true });
    });
  });
});
