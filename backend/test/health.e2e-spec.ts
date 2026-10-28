import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { HealthController } from '../src/health/health.controller.js';
import { HealthService } from '../src/health/health.service.js';

describe('Health Checks (e2e)', () => {
  let app: INestApplication;
  let mockDataSource: { query: jest.Mock };

  beforeAll(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
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
});
