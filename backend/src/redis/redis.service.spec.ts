import { jest } from '@jest/globals';
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
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('reports disabled by default when REDIS_ENABLED=false', () => {
    expect(service.isEnabled()).toBe(false);
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
});
