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
    it('classifies Neon cloud development as shared_cloud_dev and not disposable (shared Neon rejection)', () => {
      const neonService = new HealthService({
        options: {
          url: 'postgres://user:supersecretpass@ep-long-fog-azwbvdgr-pooler.c-3.ap-southeast-1.aws.neon.tech/forever?sslmode=require',
        },
      } as any);

      const isolation = neonService.getDatabaseIsolationInfo();
      expect(isolation.isCloudShared).toBe(true);
      expect(isolation.isDisposableTestDb).toBe(false);
      expect(isolation.classification).toBe('shared_cloud_dev');
      // Verifies no connection string, credentials, or hostname are exposed
      expect((isolation as any).sanitizedTarget).toBeUndefined();
      expect((isolation as any).url).toBeUndefined();
    });

    it('classifies localhost test database as disposable_test when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      const localTestService = new HealthService({
        options: {
          host: '127.0.0.1',
          database: 'foss_disposable_test',
        },
      } as any);

      const isolation = localTestService.getDatabaseIsolationInfo();
      expect(isolation.isCloudShared).toBe(false);
      expect(isolation.isDisposableTestDb).toBe(true);
      expect(isolation.classification).toBe('disposable_test');
      expect((isolation as any).sanitizedTarget).toBeUndefined();
    });
  });
});
