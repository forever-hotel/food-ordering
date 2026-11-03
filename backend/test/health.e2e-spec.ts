import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { HealthController } from '../src/health/health.controller.js';
import { HealthService } from '../src/health/health.service.js';

describe('Health Checks (e2e)', () => {
  let app: INestApplication;
  let mockDataSource: { query: jest.Mock; options?: any };

  beforeAll(async () => {
    mockDataSource = {
      query: jest.fn().mockImplementation((query: any) => {
        if (typeof query === 'string' && query.includes('pg_settings')) {
          return Promise.resolve([
            { name: 'neon.project_id', setting: 'weathered-voice-13361247' },
            { name: 'neon.branch_id', setting: 'br-withered-unit-azl2if4y' },
            { name: 'neon.endpoint_id', setting: 'ep-long-fog-azwbvdgr' },
          ]);
        }
        return Promise.resolve([{ '?column?': 1 }]);
      }),
      options: {
        host: '127.0.0.1',
        database: 'foss_disposable_test',
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              DEMO_MODE: 'true',
              INTERNAL_SERVICE_KEY: 'test-internal-secret',
              APPROVED_NEON_PROJECT_ID: 'weathered-voice-13361247',
              APPROVED_NEON_TEST_BRANCH_ID: 'br-withered-unit-azl2if4y',
              APPROVED_NEON_TEST_ENDPOINT_ID: 'ep-long-fog-azwbvdgr',
              PARENT_DEV_BRANCH_ID: 'br-cold-band-az0cv5vx',
            }),
          ],
        }),
      ],
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 OK with liveness details', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/live', () => {
    it('returns 200 OK for container liveness probe', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 OK when database ping succeeds', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);

      const response = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.database.status).toBe('up');
      expect(response.body.database.type).toBe('postgres');
    });

    it('returns 503 Service Unavailable when database ping fails', async () => {
      mockDataSource.query.mockRejectedValueOnce(
        new Error('Database connection failed'),
      );

      const response = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);

      expect(response.body.status).toBe('error');
      expect(response.body.database.status).toBe('down');
      expect(response.body.database.error).toBe('Database connection failed');
    });
  });

  describe('GET /health/internal/database-isolation', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/health/internal/database-isolation')
        .expect(401);
    });

    it('regression: rejects invalid internal service key with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/health/internal/database-isolation')
        .set('x-internal-service-key', 'invalid-wrong-key')
        .expect(403);
    });

    it('returns database isolation classification with valid internal service key', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/internal/database-isolation')
        .set('x-internal-service-key', 'test-internal-secret')
        .expect(200);

      expect(response.body.classification).toBe('dedicated_neon_test');
      expect(response.body.isApprovedTestBranch).toBe(true);
      expect(response.body.isCloudShared).toBe(false);
      expect(response.body.isDisposableTestDb).toBe(false);
      // Ensure no credentials, connection strings or internal branch IDs are leaked
      expect(response.body.sanitizedTarget).toBeUndefined();
      expect(response.body.url).toBeUndefined();
      expect(response.body.branchId).toBeUndefined();
    });
  });
});
