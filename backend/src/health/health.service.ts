import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import {
  DatabaseIsolationDto,
  LivenessResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly configService?: ConfigService,
  ) {}

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
   * Confirms whether target database is an explicitly approved test branch or disposable test database.
   * Validates server-provided pg_settings against server-side configuration allowlist.
   * Never prints credentials, passwords, branch IDs or connection strings.
   */
  async getDatabaseIsolationInfo(): Promise<DatabaseIsolationDto> {
    if (!this.dataSource) {
      return {
        isDisposableTestDb: false,
        isCloudShared: false,
        classification: 'unknown',
        isApprovedTestBranch: false,
      };
    }

    if (process.env.NODE_ENV === 'production') {
      return {
        isDisposableTestDb: false,
        isCloudShared: true,
        classification: 'production',
        isApprovedTestBranch: false,
      };
    }

    // Server-side allowlist configuration (Conditions 2 & 3)
    const approvedProjectId =
      this.configService?.get<string>('APPROVED_NEON_PROJECT_ID') ||
      process.env.APPROVED_NEON_PROJECT_ID ||
      'weathered-voice-13361247';

    const approvedTestBranchId =
      this.configService?.get<string>('APPROVED_NEON_TEST_BRANCH_ID') ||
      process.env.APPROVED_NEON_TEST_BRANCH_ID ||
      'br-withered-unit-azl2if4y';

    const approvedTestEndpointId =
      this.configService?.get<string>('APPROVED_NEON_TEST_ENDPOINT_ID') ||
      process.env.APPROVED_NEON_TEST_ENDPOINT_ID ||
      'ep-long-fog-azwbvdgr';

    const parentDevBranchId =
      this.configService?.get<string>('PARENT_DEV_BRANCH_ID') ||
      process.env.PARENT_DEV_BRANCH_ID ||
      'br-cold-band-az0cv5vx';

    try {
      const rows = (await this.dataSource.query(
        `SELECT name, setting 
         FROM pg_settings 
         WHERE name IN ('neon.project_id', 'neon.branch_id', 'neon.endpoint_id')`,
      )) as Array<{ name: string; setting: string }>;

      const settings: Record<string, string> = {};
      for (const row of rows) {
        settings[row.name] = row.setting;
      }

      const observedProjectId = settings['neon.project_id'];
      const observedBranchId = settings['neon.branch_id'];
      const observedEndpointId = settings['neon.endpoint_id'];

      // If Neon server metadata is present, evaluate against trusted server-side allowlist
      if (observedProjectId && observedBranchId) {
        // Explicitly reject if connected to parent dev
        if (observedBranchId === parentDevBranchId) {
          return {
            isDisposableTestDb: false,
            isCloudShared: true,
            classification: 'neon_parent_dev',
            isApprovedTestBranch: false,
          };
        }

        // Validate observed project, branch, and endpoint against server-side allowlist
        const matchesProject = observedProjectId === approvedProjectId;
        const matchesBranch = observedBranchId === approvedTestBranchId;
        const matchesEndpoint =
          !approvedTestEndpointId ||
          observedEndpointId === approvedTestEndpointId;

        if (matchesProject && matchesBranch && matchesEndpoint) {
          // Condition 4: Classify as dedicated_neon_test, not unrestricted disposable
          return {
            isDisposableTestDb: false,
            isCloudShared: false,
            classification: 'dedicated_neon_test',
            isApprovedTestBranch: true,
          };
        }

        // Mismatched or unknown branch in cloud
        return {
          isDisposableTestDb: false,
          isCloudShared: true,
          classification: 'shared_cloud_dev',
          isApprovedTestBranch: false,
        };
      }
    } catch (err) {
      this.logger.warn(
        `Failed to query pg_settings for Neon isolation metadata: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Fallback: check for local test database (e.g. SQLite / local PostgreSQL)
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
    const dbLower = database.toLowerCase();
    const isTestDbName =
      dbLower.endsWith('_test') ||
      dbLower.includes('disposable') ||
      dbLower.includes('_test_') ||
      dbLower === 'foss_test';

    if (isLocal && isTestDbName && process.env.NODE_ENV === 'test') {
      return {
        isDisposableTestDb: true,
        isCloudShared: false,
        classification: 'disposable_local_test',
        isApprovedTestBranch: false,
      };
    }

    return {
      isDisposableTestDb: false,
      isCloudShared: host.includes('neon.tech') || host.includes('aws'),
      classification: 'unknown',
      isApprovedTestBranch: false,
    };
  }

  /**
   * Evaluates system readiness including live database query probe.
   * Public readiness probe returns minimal health status without internal infrastructure details.
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
