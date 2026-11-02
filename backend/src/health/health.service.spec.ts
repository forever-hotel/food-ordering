import { jest } from '@jest/globals';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let service: HealthService;
  let mockDataSource: {
    query: jest.MockedFunction<(q: string) => Promise<unknown>>;
  };

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn<(q: string) => Promise<unknown>>(),
    };

    service = new HealthService(mockDataSource as unknown as DataSource);
  });

  describe('getLiveness', () => {
    it('returns status ok, positive uptime, and ISO timestamp', () => {
      const result = service.getLiveness();

      expect(result.status).toBe('ok');
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });

  describe('checkReadiness', () => {
    it('returns status ok and database up when query succeeds', async () => {
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.checkReadiness();

      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('up');
      expect(result.database.type).toBe('postgres');
      expect(result.database.error).toBeUndefined();
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns status error and database down when query fails', async () => {
      mockDataSource.query.mockRejectedValue(
        new Error('Connection terminated unexpectedly'),
      );

      const result = await service.checkReadiness();

      expect(result.status).toBe('error');
      expect(result.database.status).toBe('down');
      expect(result.database.error).toBe('Connection terminated unexpectedly');
    });

    it('handles scenario when dataSource is not provided', async () => {
      const serviceWithoutDb = new HealthService(undefined);
      const result = await serviceWithoutDb.checkReadiness();

      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('up');
      expect((result.database as any).isolation).toBeUndefined();
    });

    it('ensures public checkReadiness returns minimal database health without infrastructure details', async () => {
      const result = await service.checkReadiness();
      expect(result.status).toBe('ok');
      expect(result.database).toEqual({
        status: 'up',
        type: 'postgres',
      });
      // Guarantees no infrastructure details or hostnames are leaked on public probe
      expect((result.database as any).isolation).toBeUndefined();
      expect((result.database as any).sanitizedTarget).toBeUndefined();
    });
  });

  describe('getDatabaseIsolationInfo', () => {
    it('classifies approved dedicated Neon test branch as dedicated_neon_test (Conditions 2 & 4)', async () => {
      mockDataSource.query.mockResolvedValue([
        { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
        { name: 'neon.branch_id', setting: 'br-withered-unit-azl2if4y' },
        { name: 'neon.endpoint_id', setting: 'ep-long-fog-azwbvdgr' },
      ]);

      const isolation = await service.getDatabaseIsolationInfo();
      expect(isolation.classification).toBe('dedicated_neon_test');
      expect(isolation.isApprovedTestBranch).toBe(true);
      expect(isolation.isCloudShared).toBe(false);
      expect(isolation.isDisposableTestDb).toBe(false);
      // Verifies no connection string, credentials, or hostname are exposed
      expect((isolation as any).sanitizedTarget).toBeUndefined();
      expect((isolation as any).url).toBeUndefined();
    });

    it('rejects parent dev branch and classifies as neon_parent_dev (Condition 4 & 8)', async () => {
      mockDataSource.query.mockResolvedValue([
        { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
        { name: 'neon.branch_id', setting: 'br-cold-band-az0cv5vx' },
        { name: 'neon.endpoint_id', setting: 'ep-parent-endpoint' },
      ]);

      const isolation = await service.getDatabaseIsolationInfo();
      expect(isolation.classification).toBe('neon_parent_dev');
      expect(isolation.isApprovedTestBranch).toBe(false);
      expect(isolation.isCloudShared).toBe(true);
      expect(isolation.isDisposableTestDb).toBe(false);
    });

    it('rejects unknown Neon branch and classifies as shared_cloud_dev', async () => {
      mockDataSource.query.mockResolvedValue([
        { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
        { name: 'neon.branch_id', setting: 'br-unapproved-other-branch' },
        { name: 'neon.endpoint_id', setting: 'ep-other-endpoint' },
      ]);

      const isolation = await service.getDatabaseIsolationInfo();
      expect(isolation.classification).toBe('shared_cloud_dev');
      expect(isolation.isApprovedTestBranch).toBe(false);
      expect(isolation.isCloudShared).toBe(true);
    });

    it('rejects in production mode regardless of branch metadata', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const isolation = await service.getDatabaseIsolationInfo();
        expect(isolation.classification).toBe('production');
        expect(isolation.isApprovedTestBranch).toBe(false);
        expect(isolation.isCloudShared).toBe(true);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('classifies localhost test database as disposable_local_test when NODE_ENV is test', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      try {
        const localTestService = new HealthService({
          options: {
            host: '127.0.0.1',
            database: 'foss_disposable_test',
          },
          query: jest.fn().mockRejectedValue(new Error('Not a Neon DB')),
        } as any);

        const isolation = await localTestService.getDatabaseIsolationInfo();
        expect(isolation.isCloudShared).toBe(false);
        expect(isolation.isDisposableTestDb).toBe(true);
        expect(isolation.classification).toBe('disposable_local_test');
        expect(isolation.isApprovedTestBranch).toBe(false);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });
});
