import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  DatabaseIsolationDto,
  LivenessResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@Optional() private readonly dataSource?: DataSource) {}

  /**
   * Evaluates process liveness.
   */
  getLiveness(): LivenessResponseDto {
    return {
      status: 'ok',
      uptime: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Extracts trustworthy, non-sensitive database isolation metadata.
   * Confirms whether target database is an explicitly approved disposable test database.
   * Never prints credentials, passwords, or connection strings.
   */
  getDatabaseIsolationInfo(): DatabaseIsolationDto {
    if (!this.dataSource) {
      return {
        isDisposableTestDb: false,
        isCloudShared: false,
        sanitizedTarget: 'none',
        classification: 'unknown',
      };
    }

    const options = (this.dataSource.options || {}) as unknown as Record<
      string,
      unknown
    >;
    let host = String(options.host || '');
    let database = String(options.database || '');

    if (options.url && typeof options.url === 'string') {
      try {
        const parsed = new URL(options.url);
        host = parsed.hostname;
        database = parsed.pathname.replace(/^\//, '');
      } catch {
        // Fallback
      }
    }

    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '';
    const isNeonCloud =
      typeof host === 'string' && host.toLowerCase().includes('neon.tech');
    const isCloud =
      isNeonCloud ||
      host.includes('aws') ||
      host.includes('azure') ||
      host.includes('gcp');

    const dbLower = database.toLowerCase();
    const isTestDbName =
      dbLower.endsWith('_test') ||
      dbLower.includes('disposable') ||
      dbLower.includes('_test_') ||
      dbLower === 'foss_test';

    const isDisposableTestDb =
      isLocal && isTestDbName && !isCloud && process.env.NODE_ENV === 'test';

    let classification:
      'disposable_test' | 'shared_cloud_dev' | 'production' | 'unknown' =
      'unknown';

    if (process.env.NODE_ENV === 'production') {
      classification = 'production';
    } else if (isDisposableTestDb) {
      classification = 'disposable_test';
    } else if (isNeonCloud || isCloud) {
      classification = 'shared_cloud_dev';
    }

    const sanitizedTarget = host
      ? `${host}/${database || 'default'}`
      : database || 'unknown';

    return {
      isDisposableTestDb,
      isCloudShared: isCloud,
      sanitizedTarget,
      classification,
    };
  }

  /**
   * Evaluates system readiness including live database query probe and isolation inspection.
   */
  async checkReadiness(): Promise<ReadinessResponseDto> {
    const uptime = Number(process.uptime().toFixed(2));
    const timestamp = new Date().toISOString();
    const isolation = this.getDatabaseIsolationInfo();

    if (!this.dataSource) {
      return {
        status: 'ok',
        uptime,
        timestamp,
        database: {
          status: 'up',
          type: 'postgres',
          isolation,
        },
      };
    }

    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        uptime,
        timestamp,
        database: {
          status: 'up',
          type: 'postgres',
          isolation,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Database readiness probe failed: ${errorMessage}`);
      return {
        status: 'error',
        uptime,
        timestamp,
        database: {
          status: 'down',
          type: 'postgres',
          error: errorMessage,
          isolation,
        },
      };
    }
  }
}
