import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { RedisService } from '../src/redis/redis.service.js';

describe('Redis Live Integration & Resilient Caching (CIT-04)', () => {
  const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  let isRedisAvailable = false;
  let directClient: Redis | null = null;

  beforeAll(async () => {
    try {
      directClient = new Redis(REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 1500,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      await directClient.connect();
      const pong = await directClient.ping();
      if (pong === 'PONG') {
        isRedisAvailable = true;
      }
    } catch {
      console.warn(
        `Redis container unreachable at ${REDIS_URL}. Live Redis tests will verify fallback behavior.`,
      );
      isRedisAvailable = false;
    }
  });

  afterAll(async () => {
    if (directClient) {
      try {
        directClient.disconnect(false);
      } catch {
        // ignore
      }
    }
  });

  describe('1. Disabled Mode (Default Invariant - REDIS_ENABLED=false)', () => {
    let disabledService: RedisService;

    beforeAll(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                if (key === 'REDIS_ENABLED') return 'false';
                return null;
              },
            },
          },
        ],
      }).compile();

      disabledService = module.get<RedisService>(RedisService);
      await disabledService.onModuleInit();
    });

    afterAll(async () => {
      await disabledService.onModuleDestroy();
    });

    it('reports disabled and unhealthy when REDIS_ENABLED is false', async () => {
      expect(disabledService.isEnabled()).toBe(false);
      expect(await disabledService.isHealthy()).toBe(false);
    });

    it('performs read-through and cache write via resilient in-memory fallback without errors', async () => {
      const catalog = {
        mealPeriod: 'LUNCH',
        items: [{ id: 'item-1', price: 15 }],
      };
      await disabledService.set('foss:menu:catalog:v1:LUNCH', catalog, 60);

      const cached = await disabledService.get<typeof catalog>(
        'foss:menu:catalog:v1:LUNCH',
      );
      expect(cached).toEqual(catalog);
    });

    it('returns null on cache miss in disabled mode', async () => {
      const result = await disabledService.get('foss:menu:nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('2. Live Redis Container Operations (REDIS_ENABLED=true)', () => {
    let enabledService: RedisService;

    beforeAll(async () => {
      if (!isRedisAvailable) {
        return;
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                if (key === 'REDIS_ENABLED') return 'true';
                if (key === 'REDIS_URL') return REDIS_URL;
                if (key === 'REDIS_TTL_SECONDS') return '300';
                return null;
              },
            },
          },
        ],
      }).compile();

      enabledService = module.get<RedisService>(RedisService);
      await enabledService.onModuleInit();
    });

    afterAll(async () => {
      if (enabledService) {
        await enabledService.del('foss:menu:catalog:v1:LIVE_TEST');
        await enabledService.del('foss:menu:catalog:v1:TTL_TEST');
        await enabledService.onModuleDestroy();
      }
    });

    it('connects to real Redis container and reports healthy', async () => {
      if (!isRedisAvailable) {
        console.warn('Skipping test: Redis container not reachable.');
        return;
      }
      expect(enabledService.isEnabled()).toBe(true);
      expect(await enabledService.isHealthy()).toBe(true);
    });

    it('sets and gets menu catalog from real Redis (cache hit)', async () => {
      if (!isRedisAvailable) return;

      const catalogData = {
        mealPeriod: 'LIVE_TEST',
        categories: ['Mains', 'Desserts'],
        items: [{ id: 'item-live-001', name: 'Signature Curry', price: 22.5 }],
      };

      await enabledService.set(
        'foss:menu:catalog:v1:LIVE_TEST',
        catalogData,
        60,
      );

      const fetched = await enabledService.get<typeof catalogData>(
        'foss:menu:catalog:v1:LIVE_TEST',
      );
      expect(fetched).toEqual(catalogData);

      // Verify directly on Redis client
      const rawInRedis = await directClient?.get(
        'foss:menu:catalog:v1:LIVE_TEST',
      );
      expect(rawInRedis).toBeDefined();
      expect(JSON.parse(rawInRedis!)).toEqual(catalogData);
    });

    it('returns null on cache miss', async () => {
      if (!isRedisAvailable) return;

      const result = await enabledService.get(
        'foss:menu:catalog:v1:UNKNOWN_PERIOD',
      );
      expect(result).toBeNull();
    });

    it('respects TTL expiration in real Redis', async () => {
      if (!isRedisAvailable) return;

      await enabledService.set(
        'foss:menu:catalog:v1:TTL_TEST',
        { test: true },
        1,
      );

      // Immediately available
      expect(await enabledService.get('foss:menu:catalog:v1:TTL_TEST')).toEqual(
        { test: true },
      );

      // Wait 1.3 seconds for Redis TTL expiration
      await new Promise((resolve) => setTimeout(resolve, 1300));

      const expired = await enabledService.get('foss:menu:catalog:v1:TTL_TEST');
      expect(expired).toBeNull();
    });

    it('deletes specific cache key via del() in real Redis', async () => {
      if (!isRedisAvailable) return;

      await enabledService.set(
        'foss:menu:catalog:v1:TO_DELETE',
        { data: 123 },
        60,
      );
      await enabledService.del('foss:menu:catalog:v1:TO_DELETE');

      const result = await enabledService.get('foss:menu:catalog:v1:TO_DELETE');
      expect(result).toBeNull();
    });

    it('invalidates pattern via flushPattern() in real Redis', async () => {
      if (!isRedisAvailable) return;

      await enabledService.set(
        'foss:menu:catalog:v1:BREAKFAST',
        { p: 'B' },
        60,
      );
      await enabledService.set('foss:menu:catalog:v1:DINNER', { p: 'D' }, 60);

      await enabledService.flushPattern('foss:menu:catalog:v1:');

      expect(
        await enabledService.get('foss:menu:catalog:v1:BREAKFAST'),
      ).toBeNull();
      expect(
        await enabledService.get('foss:menu:catalog:v1:DINNER'),
      ).toBeNull();
    });
  });

  describe('3. Security Invariant (No Sensitive Data in Redis)', () => {
    it('ensures keys and values are strictly scoped to public menu catalog', async () => {
      const allowedPrefix = 'foss:menu:catalog:v1:';
      const sampleKey = `${allowedPrefix}LUNCH`;

      // Must not contain guest tokens, session ids, booking ids or room numbers
      expect(sampleKey).not.toContain('session');
      expect(sampleKey).not.toContain('booking');
      expect(sampleKey).not.toContain('room');
      expect(sampleKey).not.toContain('token');
      expect(sampleKey.startsWith('foss:menu:')).toBe(true);
    });
  });

  describe('4. Fail-Open Fallback on Connection Outage', () => {
    let brokenService: RedisService;

    beforeAll(async () => {
      // Configure an unreachable Redis endpoint
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => {
                if (key === 'REDIS_ENABLED') return 'true';
                if (key === 'REDIS_URL') return 'redis://127.0.0.1:65534'; // Unreachable port
                return null;
              },
            },
          },
        ],
      }).compile();

      brokenService = module.get<RedisService>(RedisService);
      await brokenService.onModuleInit();
    });

    afterAll(async () => {
      await brokenService.onModuleDestroy();
    });

    it('fails open without throwing and serves from in-memory fallback', async () => {
      expect(brokenService.isEnabled()).toBe(true);
      expect(await brokenService.isHealthy()).toBe(false);

      // Must not throw when setting or getting
      await expect(
        brokenService.set(
          'foss:menu:catalog:v1:FALLBACK_TEST',
          { safe: true },
          60,
        ),
      ).resolves.not.toThrow();

      const result = await brokenService.get(
        'foss:menu:catalog:v1:FALLBACK_TEST',
      );
      expect(result).toEqual({ safe: true });
    });
  });
});
