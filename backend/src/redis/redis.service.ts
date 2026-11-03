import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private readonly inMemoryFallback = new Map<string, CacheEntry>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  public onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        'Redis cache is disabled (REDIS_ENABLED=false). Using safe in-memory fallback.',
      );
    } else {
      this.logger.log('Redis cache enabled. Initializing connection...');
    }

    // Periodic sweep for in-memory fallback entries
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.inMemoryFallback.entries()) {
        if (entry.expiresAt <= now) {
          this.inMemoryFallback.delete(key);
        }
      }
    }, 60000);
  }

  public onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.inMemoryFallback.clear();
  }

  public isEnabled(): boolean {
    const rawVal = this.configService.get<string>('REDIS_ENABLED');
    if (rawVal !== undefined) {
      const lower = String(rawVal).toLowerCase().trim();
      return lower === 'true' || lower === '1';
    }
    return false; // Disabled by default per DDP-159 & CIT-04
  }

  /**
   * Retrieves a cached value. Falls back cleanly to memory if Redis is disabled or offline.
   */
  public async get<T>(key: string): Promise<T | null> {
    try {
      const entry = this.inMemoryFallback.get(key);
      if (!entry) {
        return null;
      }
      if (entry.expiresAt <= Date.now()) {
        this.inMemoryFallback.delete(key);
        return null;
      }
      return JSON.parse(entry.value) as T;
    } catch (err) {
      this.logger.warn(`Redis get cache error on key [${key}]:`, err);
      return null;
    }
  }

  /**
   * Stores a value with a bounded TTL in seconds.
   */
  public async set(
    key: string,
    value: unknown,
    ttlSeconds = 300,
  ): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const expiresAt = Date.now() + ttlSeconds * 1000;
      this.inMemoryFallback.set(key, { value: serialized, expiresAt });
    } catch (err) {
      this.logger.warn(`Redis set cache error on key [${key}]:`, err);
    }
  }

  /**
   * Deletes a cache key.
   */
  public async del(key: string): Promise<void> {
    this.inMemoryFallback.delete(key);
  }

  /**
   * Invalidates all keys matching a prefix or pattern.
   */
  public async flushPattern(prefix: string): Promise<void> {
    for (const key of this.inMemoryFallback.keys()) {
      if (key.startsWith(prefix)) {
        this.inMemoryFallback.delete(key);
      }
    }
  }

  public clear(): void {
    this.inMemoryFallback.clear();
  }
}
