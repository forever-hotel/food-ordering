import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private client: Redis | null = null;
  private isConnected = false;
  private readonly inMemoryFallback = new Map<string, CacheEntry>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  public async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log(
        'Redis cache is disabled (REDIS_ENABLED=false). Using resilient in-memory fallback.',
      );
    } else {
      await this.initRedisClient();
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

  public async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.inMemoryFallback.clear();

    if (this.client) {
      try {
        this.client.disconnect(false);
      } catch {
        // ignore
      }
      this.client = null;
      this.isConnected = false;
    }
  }

  public isEnabled(): boolean {
    const rawVal = this.configService.get<string>('REDIS_ENABLED');
    if (rawVal !== undefined && rawVal !== null) {
      const lower = String(rawVal).toLowerCase().trim();
      return lower === 'true' || lower === '1';
    }
    return false; // Disabled by default per DDP-159 & CIT-04
  }

  public getDefaultTtl(): number {
    const raw = this.configService.get<string>('REDIS_TTL_SECONDS');
    if (raw) {
      const parsed = parseInt(String(raw), 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 300; // 5 minutes default
  }

  public async isHealthy(): Promise<boolean> {
    if (!this.isEnabled() || !this.client) {
      return false;
    }
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  public getClient(): Redis | null {
    return this.client;
  }

  /**
   * Retrieves a cached value.
   * If Redis is enabled and connected, queries Redis.
   * Falls back transparently (fail-open) to in-memory cache upon error or when Redis is offline.
   */
  public async get<T>(key: string): Promise<T | null> {
    if (this.client && this.isConnected) {
      try {
        const raw = await this.client.get(key);
        if (raw) {
          return JSON.parse(raw) as T;
        }
        return null;
      } catch (err) {
        this.logger.warn(
          `Redis get error on key [${key}], falling back to in-memory: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

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
      this.logger.warn(`In-memory get error on key [${key}]:`, err);
      return null;
    }
  }

  /**
   * Stores a value with a bounded TTL in seconds.
   * Writes to Redis if enabled and connected, and also populates the in-memory fallback.
   */
  public async set(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const ttl = ttlSeconds ?? this.getDefaultTtl();
    const serialized = JSON.stringify(value);

    if (this.client && this.isConnected) {
      try {
        if (ttl > 0) {
          await this.client.set(key, serialized, 'EX', ttl);
        } else {
          // Immediately expired or 0 TTL: delete key
          await this.client.del(key);
        }
      } catch (err) {
        this.logger.warn(
          `Redis set error on key [${key}]: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    try {
      const expiresAt = Date.now() + ttl * 1000;
      if (ttl > 0) {
        this.inMemoryFallback.set(key, { value: serialized, expiresAt });
      } else {
        this.inMemoryFallback.delete(key);
      }
    } catch (err) {
      this.logger.warn(`In-memory set error on key [${key}]:`, err);
    }
  }

  /**
   * Deletes a cache key from both Redis and in-memory fallback.
   */
  public async del(key: string): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.del(key);
      } catch (err) {
        this.logger.warn(
          `Redis del error on key [${key}]: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.inMemoryFallback.delete(key);
  }

  /**
   * Invalidates all keys matching a prefix or pattern.
   */
  public async flushPattern(prefix: string): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        const pattern = prefix.endsWith('*') ? prefix : `${prefix}*`;
        const keys = await this.client.keys(pattern);
        if (keys && keys.length > 0) {
          await this.client.del(...keys);
        }
      } catch (err) {
        this.logger.warn(
          `Redis flushPattern error for [${prefix}]: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const cleanPrefix = prefix.replace(/\*$/, '');
    for (const key of this.inMemoryFallback.keys()) {
      if (key.startsWith(cleanPrefix)) {
        this.inMemoryFallback.delete(key);
      }
    }
  }

  public clear(): void {
    this.inMemoryFallback.clear();
  }

  private async initRedisClient(): Promise<void> {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') || 'redis://127.0.0.1:6379';

    this.logger.log(
      `Redis enabled. Connecting to ${this.sanitizeUrl(redisUrl)}...`,
    );

    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        commandTimeout: 2000,
        enableOfflineQueue: false,
        retryStrategy: (times: number) => {
          if (times > 3) {
            return null; // Stop reconnecting after 3 failed attempts
          }
          return Math.min(times * 200, 1000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Redis client connected successfully.');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err: Error) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection warning: ${err.message}`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
      this.logger.log('Redis initialized and ready.');
    } catch (err) {
      this.isConnected = false;
      this.logger.warn(
        `Failed to connect to Redis at ${this.sanitizeUrl(redisUrl)}. Proceeding with in-memory fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }
}
