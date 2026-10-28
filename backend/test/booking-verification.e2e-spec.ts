import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { BookingInternalModule } from '../src/integrations/internal-services/booking/booking-internal.module.js';

describe('Booking/Room Verification Integration (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Ensure test environment uses mock external services
    process.env.MOCK_EXTERNAL_SERVICES = 'true';
    process.env.DEMO_MODE = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        BookingInternalModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('TC-DDP-122-AC1: Successful verification workflow', () => {
    it('returns approved guest context for valid checked-in booking and room', async () => {
      const response = await request(app.getHttpServer())
        .post('/integrations/booking/verify')
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        })
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          valid: true,
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
          status: 'CHECKED_IN',
          guestName: 'Demo Guest 101',
        }),
      );
      expect(response.body.stayStart).toBeDefined();
      expect(response.body.stayEnd).toBeDefined();
      expect(response.body.verifiedAt).toBeDefined();
    });
  });

  describe('TC-DDP-122-AC2: Negative and unauthorized error cases', () => {
    it('rejects RESERVED stay with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .post('/integrations/booking/verify')
        .send({
          bookingId: 'b1020000-0000-4000-8000-000000000102',
          roomNumber: '102',
        })
        .expect(403);

      expect(response.body.message).toMatch(/RESERVED/);
    });

    it('rejects CHECKED_OUT stay with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .post('/integrations/booking/verify')
        .send({
          bookingId: 'b1030000-0000-4000-8000-000000000103',
          roomNumber: '103',
        })
        .expect(403);

      expect(response.body.message).toMatch(/CHECKED_OUT/);
    });

    it('rejects CANCELLED stay with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .post('/integrations/booking/verify')
        .send({
          bookingId: 'b1040000-0000-4000-8000-000000000104',
          roomNumber: '104',
        })
        .expect(403);

      expect(response.body.message).toMatch(/CANCELLED/);
    });

    it('rejects room mismatch with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .post('/integrations/booking/verify')
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '999',
        })
        .expect(403);

      expect(response.body.message).toMatch(/Room number mismatch/);
    });

    it('returns 404 Not Found for unknown booking ID', async () => {
      await request(app.getHttpServer())
        .post('/integrations/booking/verify')
        .send({
          bookingId: '00000000-0000-0000-0000-000000000000',
          roomNumber: '101',
        })
        .expect(404);
    });

    it('returns 400 Bad Request for missing body parameters', async () => {
      await request(app.getHttpServer())
        .post('/integrations/booking/verify')
        .send({ bookingId: '' })
        .expect(400);
    });
  });

  describe('TC-DDP-122-AC3: Boundary, clock skew, and data boundary validation', () => {
    it('rejects expired stay window with 403 Forbidden', async () => {
      const response = await request(app.getHttpServer())
        .post('/integrations/booking/verify')
        .send({
          bookingId: 'b1050000-0000-4000-8000-000000000105',
          roomNumber: '105',
        })
        .expect(403);

      expect(response.body.message).toMatch(/Stay window has expired/);
    });
  });

  describe('TC-DDP-122-AC4: Contract, sanitized auditability, and safety guards', () => {
    it('ensures no sensitive internal credentials or stack traces leak in error responses', async () => {
      const response = await request(app.getHttpServer())
        .post('/integrations/booking/verify')
        .send({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: 'wrong-room',
        })
        .expect(403);

      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('apiKey');
      expect(response.body).not.toHaveProperty('token');
      expect(response.body).toHaveProperty('statusCode', 403);
      expect(response.body).toHaveProperty('message');
    });
  });
});
