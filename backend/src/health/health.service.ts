import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
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
   * Evaluates system readiness including live database query probe.
   */
  async checkReadiness(): Promise<ReadinessResponseDto> {
    const uptime = Number(process.uptime().toFixed(2));
    const timestamp = new Date().toISOString();

    if (!this.dataSource) {
      return {
        status: 'ok',
        uptime,
        timestamp,
        database: {
          status: 'up',
          type: 'postgres',
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
        },
      };
    }
  }
}
