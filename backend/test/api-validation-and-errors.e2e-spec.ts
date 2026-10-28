import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { correlationMiddleware } from '../src/common/middleware/correlation.middleware.js';
import { HealthController } from '../src/health/health.controller.js';
import { HealthService } from '../src/health/health.service.js';
import { GuestSessionsController } from '../src/modules/guest-sessions/guest-sessions.controller.js';
import { GuestSessionsService } from '../src/modules/guest-sessions/services/guest-sessions.service.js';
import { QrTokenService } from '../src/modules/guest-sessions/services/qr-token.service.js';

describe('Shared API Validation, Configuration, Errors, and Logging (e2e)', () => {
  let app: INestApplication;
  let mockDataSource: { query: jest.Mock };

  beforeAll(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const mockGuestSessionsService = {
      authenticateWithQr: jest.fn(),
      handleFdsCheckoutEvent: jest.fn(),
      handleFdsRoomReassignEvent: jest.fn(),
      getProcessedEvent: jest.fn(),
      logout: jest.fn(),
    };

    const mockQrTokenService = {
      getDemoTokens: jest.fn().mockReturnValue({ '101': 'demo-token' }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ DEMO_MODE: 'true', MOCK_EXTERNAL_SERVICES: 'true' })],
        }),
      ],
      controllers: [HealthController, GuestSessionsController],
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: GuestSessionsService,
          useValue: mockGuestSessionsService,
        },
        {
          provide: QrTokenService,
          useValue: mockQrTokenService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Attach production-grade cross-cutting middleware, filters, and pipes
    app.use(correlationMiddleware);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TC-DDP-126-AC1: Global DTO Validation & Error Envelopes', () => {
    it('rejects forbidden non-whitelisted properties with standard 400 Bad Request envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({
          qrToken: 'valid-format-token',
          forbiddenProperty: 'malicious-injection',
        })
        .expect(400);

      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 400,
          error: 'Bad Request',
          path: '/guest-sessions/qr',
          correlationId: expect.any(String),
        }),
      );

      // Verify non-whitelisted property is explicitly flagged
      const msg = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(msg).toContain('property forbiddenProperty should not exist');
    });

    it('rejects invalid data types with descriptive constraint message', async () => {
      const response = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .send({
          qrToken: 12345, // invalid type, must be string
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
      const msg = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(msg).toContain('qrToken must be a string');
    });
  });

  describe('TC-DDP-126-AC2: Correlation ID Tracking', () => {
    it('propagates client-supplied X-Correlation-ID in response header and error envelope', async () => {
      const clientCorrelationId = 'client-uuid-9999-8888';

      const response = await request(app.getHttpServer())
        .post('/guest-sessions/qr')
        .set('X-Correlation-ID', clientCorrelationId)
        .send({ qrToken: '' }) // empty token triggers validation error
        .expect(400);

      expect(response.headers['x-correlation-id']).toBe(clientCorrelationId);
      expect(response.body.correlationId).toBe(clientCorrelationId);
    });

    it('generates a new UUID correlationId when client does not supply one', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-correlation-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('TC-DDP-126-AC2b: Dependency Health Reflection', () => {
    it('returns 200 OK on /health/ready when database is connected', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);

      const response = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.database.status).toBe('up');
    });

    it('returns 503 Service Unavailable on /health/ready when database is down', async () => {
      mockDataSource.query.mockRejectedValueOnce(
        new Error('Neon database unreachable'),
      );

      const response = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);

      expect(response.body.status).toBe('error');
      expect(response.body.database.status).toBe('down');
    });
  });
});
