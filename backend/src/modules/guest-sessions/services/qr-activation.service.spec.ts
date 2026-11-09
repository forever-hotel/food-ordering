import { jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BookingVerificationResultDto } from '../../../integrations/internal-services/booking/dto/booking-verification-result.dto.js';
import { BookingVerificationService } from '../../../integrations/internal-services/booking/booking-verification.service.js';
import { FossQrActivation } from '../entities/foss-qr-activation.entity.js';
import { FossSession } from '../entities/foss-session.entity.js';
import { FossQrActivationRepository } from '../repositories/foss-qr-activation.repository.js';
import { FossSessionRepository } from '../repositories/foss-session.repository.js';
import { QrActivationService } from './qr-activation.service.js';

describe('QrActivationService', () => {
  let service: QrActivationService;
  let qrActivationRepo: {
    findById: jest.MockedFunction<any>;
    findByTokenHash: jest.MockedFunction<any>;
    findPendingByBookingId: jest.MockedFunction<any>;
    save: jest.MockedFunction<any>;
    revokeUnredeemedByBookingId: jest.MockedFunction<any>;
    atomicRedeem: jest.MockedFunction<any>;
    atomicRedeemWithManager: jest.MockedFunction<any>;
  };
  let sessionRepo: {
    findById: jest.MockedFunction<any>;
    findByBookingId: jest.MockedFunction<any>;
    findActiveBySessionToken: jest.MockedFunction<any>;
    save: jest.MockedFunction<any>;
  };
  let bookingVerificationService: {
    verifyStay: jest.MockedFunction<any>;
    simulateCheckout: jest.MockedFunction<any>;
    simulateRoomReassign: jest.MockedFunction<any>;
  };
  let configService: {
    get: jest.MockedFunction<any>;
  };
  let mockManager: {
    findOne: jest.MockedFunction<any>;
    save: jest.MockedFunction<any>;
  };
  let mockDataSource: {
    transaction: jest.MockedFunction<any>;
  };
  let fixedNow: Date;

  beforeEach(() => {
    fixedNow = new Date('2026-10-31T16:00:00.000Z');

    qrActivationRepo = {
      findById: jest.fn(),
      findByTokenHash: jest.fn(),
      findPendingByBookingId: jest.fn(),
      save: jest
        .fn()
        .mockImplementation((entity: any) => Promise.resolve(entity)),
      revokeUnredeemedByBookingId: jest.fn().mockResolvedValue(0),
      atomicRedeem: jest.fn(),
      atomicRedeemWithManager: jest.fn(),
    };

    sessionRepo = {
      findById: jest.fn(),
      findByBookingId: jest.fn().mockResolvedValue(null),
      findActiveBySessionToken: jest.fn(),
      save: jest
        .fn()
        .mockImplementation((entity: any) => Promise.resolve(entity)),
    };

    bookingVerificationService = {
      verifyStay: jest.fn(),
      simulateCheckout: jest.fn(),
      simulateRoomReassign: jest.fn(),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'QR_ACTIVATION_TTL_MINUTES') return '15';
        if (key === 'SESSION_TTL_HOURS') return '24';
        if (key === 'FOSS_FRONTEND_URL')
          return 'https://guest.foreverhotel.com';
        return undefined;
      }),
    };

    mockManager = {
      findOne: jest.fn<any>().mockResolvedValue(null),
      save: jest
        .fn<any>()
        .mockImplementation((entity: any) => Promise.resolve(entity)),
    };

    mockDataSource = {
      transaction: jest
        .fn<any>()
        .mockImplementation(async (cb: (m: any) => Promise<any>) =>
          cb(mockManager),
        ),
    };

    service = new QrActivationService(
      qrActivationRepo as unknown as FossQrActivationRepository,
      sessionRepo as unknown as FossSessionRepository,
      bookingVerificationService as unknown as BookingVerificationService,
      configService as unknown as ConfigService,
      mockDataSource as any,
      () => fixedNow,
    );
  });

  describe('issueActivationCredential', () => {
    const validStay: BookingVerificationResultDto = {
      valid: true,
      bookingId: 'b1010000-0000-4000-8000-000000000101',
      roomNumber: '101',
      status: 'CHECKED_IN',
      stayStart: '2026-10-30T14:00:00.000Z',
      stayEnd: '2026-11-02T11:00:00.000Z',
      guestName: 'Jane Doe',
      verifiedAt: '2026-10-31T16:00:00.000Z',
    };

    it('successfully issues an activation credential for a verified checked-in guest', async () => {
      bookingVerificationService.verifyStay.mockResolvedValue(validStay);

      const response = await service.issueActivationCredential({
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
        checkOutDate: '2026-11-02T11:00:00.000Z',
      });

      expect(response.status).toBe('ACTIVATED');
      expect(response.qrToken).toBeDefined();
      expect(response.activationUrl).toContain(
        'https://guest.foreverhotel.com/activate?token=',
      );
      expect(response.expiresAt).toBe('2026-10-31T16:15:00.000Z'); // 15 mins after fixedNow
      expect(response.sessionReference).toBeDefined();
      expect(response.validUntilDate).toBe('2026-11-02T11:00:00.000Z');
      expect(qrActivationRepo.save).toHaveBeenCalledTimes(1);

      // Verify that stored entity does NOT contain raw token, only 64-char sha256 hash
      const savedEntity = qrActivationRepo.save.mock.calls[0][0];
      expect(savedEntity.tokenHash).toHaveLength(64);
      expect(savedEntity.tokenHash).not.toEqual(response.qrToken);
      expect(savedEntity.bookingId).toBe(
        'b1010000-0000-4000-8000-000000000101',
      );
      expect(savedEntity.roomNumber).toBe('101');
    });

    it('enforces verified stayEnd as validUntilDate even when request provides a conflicting legacy checkOutDate (Test 13)', async () => {
      bookingVerificationService.verifyStay.mockResolvedValue(validStay);

      const response = await service.issueActivationCredential({
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
        checkOutDate: '2026-11-20T12:00:00.000Z', // Legacy caller passes different date
      });

      expect(response.validUntilDate).toBe(validStay.stayEnd); // '2026-11-02T11:00:00.000Z'
      expect(response.validUntilDate).not.toBe('2026-11-20T12:00:00.000Z');
    });

    it('accepts optional stayExpiresAt without allowing it to override authoritative stayEnd', async () => {
      bookingVerificationService.verifyStay.mockResolvedValue(validStay);

      const response = await service.issueActivationCredential({
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
        stayExpiresAt: '2026-11-25T15:00:00.000Z',
      });

      expect(response.validUntilDate).toBe(validStay.stayEnd);
      expect(response.validUntilDate).not.toBe('2026-11-25T15:00:00.000Z');
    });

    it('rejects QR issuance with ForbiddenException when stay has already expired', async () => {
      const expiredStay: BookingVerificationResultDto = {
        ...validStay,
        stayEnd: '2026-10-31T15:59:59.000Z', // Expired 1 second before fixedNow (16:00:00)
      };
      bookingVerificationService.verifyStay.mockResolvedValue(expiredStay);

      await expect(
        service.issueActivationCredential({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(qrActivationRepo.save).not.toHaveBeenCalled();
    });

    it('rejects QR issuance with UnauthorizedException when authoritative timestamps are malformed or inverted', async () => {
      const invertedStay: BookingVerificationResultDto = {
        ...validStay,
        stayStart: '2026-11-05T12:00:00.000Z',
        stayEnd: '2026-11-02T12:00:00.000Z', // Inverted!
      };
      bookingVerificationService.verifyStay.mockResolvedValue(invertedStay);

      await expect(
        service.issueActivationCredential({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('accepts bookingReference as an alias for bookingId', async () => {
      bookingVerificationService.verifyStay.mockResolvedValue(validStay);

      const response = await service.issueActivationCredential({
        bookingReference: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
      });

      expect(response.status).toBe('ACTIVATED');
      expect(bookingVerificationService.verifyStay).toHaveBeenCalledWith(
        'b1010000-0000-4000-8000-000000000101',
        '101',
      );
    });

    it('atomically revokes previous unredeemed activation credentials upon reissue', async () => {
      bookingVerificationService.verifyStay.mockResolvedValue(validStay);
      qrActivationRepo.revokeUnredeemedByBookingId.mockResolvedValue(2);

      await service.issueActivationCredential({
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
      });

      expect(qrActivationRepo.revokeUnredeemedByBookingId).toHaveBeenCalledWith(
        'b1010000-0000-4000-8000-000000000101',
        fixedNow,
      );
    });

    it('bounds activation expiry by stay checkout date if less than 15 minutes remain', async () => {
      const nearEndStay: BookingVerificationResultDto = {
        ...validStay,
        stayEnd: '2026-10-31T16:05:00.000Z', // 5 minutes remaining
      };
      bookingVerificationService.verifyStay.mockResolvedValue(nearEndStay);

      const response = await service.issueActivationCredential({
        bookingId: 'b1010000-0000-4000-8000-000000000101',
        roomNumber: '101',
      });

      expect(response.expiresAt).toBe('2026-10-31T16:05:00.000Z');
    });

    it('throws BadRequestException if bookingId and bookingReference are missing', async () => {
      await expect(
        service.issueActivationCredential({
          roomNumber: '101',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('fails closed if FDS booking verification fails', async () => {
      bookingVerificationService.verifyStay.mockRejectedValue(
        new UnauthorizedException('Stay not verified'),
      );

      await expect(
        service.issueActivationCredential({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          roomNumber: '101',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(qrActivationRepo.save).not.toHaveBeenCalled();
    });

    it('rejects conflicting bookingId and bookingReference when both are provided with different values', async () => {
      await expect(
        service.issueActivationCredential({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          bookingReference: 'b9990000-0000-4000-8000-000000000999',
          roomNumber: '101',
        }),
      ).rejects.toThrow('Conflicting booking identifiers');
    });

    it('rejects disparate bookingId UUID and human-readable bookingReference code without direct string comparison', async () => {
      await expect(
        service.issueActivationCredential({
          bookingId: 'b1010000-0000-4000-8000-000000000101',
          bookingReference: 'BK-2026-001',
          roomNumber: '101',
        }),
      ).rejects.toThrow('Mismatched booking identifier types');
    });

    it('rejects human-readable bookingReference when provided alone because upstream contract is unavailable', async () => {
      await expect(
        service.issueActivationCredential({
          bookingReference: 'BK-2026-001',
          roomNumber: '101',
        }),
      ).rejects.toThrow(
        'Authoritative booking verification requires a canonical bookingId',
      );
    });
  });

  describe('redeemActivationCredential', () => {
    const validStay: BookingVerificationResultDto = {
      valid: true,
      bookingId: 'b1010000-0000-4000-8000-000000000101',
      roomNumber: '101',
      status: 'CHECKED_IN',
      stayStart: '2026-10-30T14:00:00.000Z',
      stayEnd: '2026-11-02T11:00:00.000Z',
      guestName: 'Jane Doe',
      verifiedAt: '2026-10-31T16:00:00.000Z',
    };

    it('atomically redeems a valid unconsumed credential and establishes a guest session', async () => {
      const rawToken = 'valid-test-token-12345';
      const tokenHash = service.hashToken(rawToken);

      const matchedActivation = new FossQrActivation();
      matchedActivation.activationId = 'act-999';
      matchedActivation.bookingId = 'b1010000-0000-4000-8000-000000000101';
      matchedActivation.roomNumber = '101';
      matchedActivation.tokenHash = tokenHash;
      matchedActivation.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      matchedActivation.redeemedAt = null;

      qrActivationRepo.findByTokenHash.mockResolvedValue(matchedActivation);
      qrActivationRepo.atomicRedeemWithManager.mockResolvedValue(
        matchedActivation,
      );
      bookingVerificationService.verifyStay.mockResolvedValue(validStay);

      const result = await service.redeemActivationCredential(rawToken);

      expect(result.active).toBe(true);
      expect(result.bookingId).toBe('b1010000-0000-4000-8000-000000000101');
      expect(result.roomNumber).toBe('101');
      expect(result.sessionToken).toBeDefined();
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.save).toHaveBeenCalledTimes(1);
    });

    it('throws ServiceUnavailableException and fails closed when DataSource transaction manager is missing', async () => {
      const nonTransactionalService = new QrActivationService(
        qrActivationRepo as unknown as FossQrActivationRepository,
        sessionRepo as unknown as FossSessionRepository,
        bookingVerificationService as unknown as BookingVerificationService,
        configService as unknown as ConfigService,
        undefined as any,
        () => fixedNow,
      );

      const rawToken = 'test-token';
      const tokenHash = nonTransactionalService.hashToken(rawToken);
      const matchedActivation = new FossQrActivation();
      matchedActivation.activationId = 'act-test';
      matchedActivation.bookingId = 'b1010000-0000-4000-8000-000000000101';
      matchedActivation.roomNumber = '101';
      matchedActivation.tokenHash = tokenHash;
      matchedActivation.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      matchedActivation.redeemedAt = null;

      qrActivationRepo.findByTokenHash.mockResolvedValue(matchedActivation);
      bookingVerificationService.verifyStay.mockResolvedValue(validStay);

      await expect(
        nonTransactionalService.redeemActivationCredential(rawToken),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('rolls back and leaves token unredeemed when session creation fails inside DataSource transaction', async () => {
      const rawToken = 'rollback-test-token';
      const tokenHash = service.hashToken(rawToken);

      const matchedActivation = new FossQrActivation();
      matchedActivation.activationId = 'act-rollback-01';
      matchedActivation.bookingId = 'b1010000-0000-4000-8000-000000000101';
      matchedActivation.roomNumber = '101';
      matchedActivation.tokenHash = tokenHash;
      matchedActivation.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      matchedActivation.redeemedAt = null;

      qrActivationRepo.findByTokenHash.mockResolvedValue(matchedActivation);
      qrActivationRepo.atomicRedeemWithManager.mockResolvedValue(
        matchedActivation,
      );
      bookingVerificationService.verifyStay.mockResolvedValue(validStay);

      const mockManager = {
        query: jest.fn<any>().mockResolvedValue([
          {
            activationId: matchedActivation.activationId,
            bookingId: matchedActivation.bookingId,
            roomNumber: matchedActivation.roomNumber,
            tokenHash: matchedActivation.tokenHash,
            expiresAt: matchedActivation.expiresAt,
            redeemedAt: fixedNow,
            createdAt: fixedNow,
          },
        ]),
        findOne: jest.fn<any>().mockResolvedValue(null),
        save: jest
          .fn<any>()
          .mockRejectedValue(new Error('Simulated database write deadlock')),
      };

      const mockDataSource = {
        transaction: jest
          .fn<any>()
          .mockImplementation(async (cb: (m: any) => Promise<any>) => {
            return cb(mockManager);
          }),
      };

      // Construct service instance with DataSource
      const transactionalService = new QrActivationService(
        qrActivationRepo as unknown as FossQrActivationRepository,
        sessionRepo as unknown as FossSessionRepository,
        bookingVerificationService as unknown as BookingVerificationService,
        configService as unknown as ConfigService,
        mockDataSource as any,
        () => fixedNow,
      );

      // Verify that failure during session creation causes transaction to abort
      await expect(
        transactionalService.redeemActivationCredential(rawToken),
      ).rejects.toThrow('Simulated database write deadlock');

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(qrActivationRepo.atomicRedeemWithManager).toHaveBeenCalledWith(
        mockManager,
        tokenHash,
        fixedNow,
      );
      expect(mockManager.save).toHaveBeenCalledTimes(1);
    });

    it('rejects redemption with ForbiddenException if authoritative stay has expired', async () => {
      const rawToken = 'expired-stay-token';
      const tokenHash = service.hashToken(rawToken);

      const matchedActivation = new FossQrActivation();
      matchedActivation.activationId = 'act-stay-expired';
      matchedActivation.bookingId = 'b1010000-0000-4000-8000-000000000101';
      matchedActivation.roomNumber = '101';
      matchedActivation.tokenHash = tokenHash;
      matchedActivation.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      matchedActivation.redeemedAt = null;

      qrActivationRepo.findByTokenHash.mockResolvedValue(matchedActivation);
      bookingVerificationService.verifyStay.mockResolvedValue({
        ...validStay,
        stayEnd: '2026-10-31T16:00:00.000Z', // Exact expiry timestamp equals fixedNow
      });

      await expect(
        service.redeemActivationCredential(rawToken),
      ).rejects.toThrow(ForbiddenException);

      expect(qrActivationRepo.atomicRedeemWithManager).not.toHaveBeenCalled();
    });

    it('rejects redemption with UnauthorizedException if authoritative stay timestamps are malformed or inverted', async () => {
      const rawToken = 'inverted-stay-token';
      const tokenHash = service.hashToken(rawToken);

      const matchedActivation = new FossQrActivation();
      matchedActivation.activationId = 'act-stay-inverted';
      matchedActivation.bookingId = 'b1010000-0000-4000-8000-000000000101';
      matchedActivation.roomNumber = '101';
      matchedActivation.tokenHash = tokenHash;
      matchedActivation.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      matchedActivation.redeemedAt = null;

      qrActivationRepo.findByTokenHash.mockResolvedValue(matchedActivation);
      bookingVerificationService.verifyStay.mockResolvedValue({
        ...validStay,
        stayStart: '2026-11-05T12:00:00.000Z',
        stayEnd: '2026-11-02T12:00:00.000Z', // Inverted!
      });

      await expect(
        service.redeemActivationCredential(rawToken),
      ).rejects.toThrow(UnauthorizedException);

      expect(qrActivationRepo.atomicRedeemWithManager).not.toHaveBeenCalled();
    });

    it('does not touch database or redeem token if FDS stay verification fails', async () => {
      const rawToken = 'stay-fail-token';
      const tokenHash = service.hashToken(rawToken);

      const matchedActivation = new FossQrActivation();
      matchedActivation.activationId = 'act-stay-fail';
      matchedActivation.bookingId = 'b1010000-0000-4000-8000-000000000101';
      matchedActivation.roomNumber = '101';
      matchedActivation.tokenHash = tokenHash;
      matchedActivation.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      matchedActivation.redeemedAt = null;

      qrActivationRepo.findByTokenHash.mockResolvedValue(matchedActivation);
      bookingVerificationService.verifyStay.mockRejectedValue(
        new UnauthorizedException(
          'FDS check-in expired or guest already checked out',
        ),
      );

      await expect(
        service.redeemActivationCredential(rawToken),
      ).rejects.toThrow('FDS check-in expired or guest already checked out');

      // Crucial: atomicRedeem was NEVER invoked!
      expect(qrActivationRepo.atomicRedeemWithManager).not.toHaveBeenCalled();
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });

    it('rejects replay attempts when atomicRedeemWithManager returns null because token was already redeemed', async () => {
      const rawToken = 'already-redeemed-token';

      qrActivationRepo.atomicRedeemWithManager.mockResolvedValue(null);

      const existingRecord = new FossQrActivation();
      existingRecord.activationId = 'act-already-used';
      existingRecord.redeemedAt = new Date('2026-10-31T15:50:00.000Z');
      existingRecord.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      qrActivationRepo.findByTokenHash.mockResolvedValue(existingRecord);

      await expect(
        service.redeemActivationCredential(rawToken),
      ).rejects.toThrow(/already been redeemed/i);
    });

    it('rejects expired tokens when atomicRedeemWithManager returns null because expiresAt has passed', async () => {
      const rawToken = 'expired-token';
      qrActivationRepo.atomicRedeemWithManager.mockResolvedValue(null);

      const existingRecord = new FossQrActivation();
      existingRecord.activationId = 'act-expired';
      existingRecord.redeemedAt = null;
      existingRecord.expiresAt = new Date('2026-10-31T15:59:00.000Z'); // expired 1 min ago
      qrActivationRepo.findByTokenHash.mockResolvedValue(existingRecord);

      await expect(
        service.redeemActivationCredential(rawToken),
      ).rejects.toThrow(/expired/i);
    });

    it('rejects revoked tokens when atomicRedeemWithManager returns null because revokedAt is set', async () => {
      const rawToken = 'revoked-token';
      qrActivationRepo.atomicRedeemWithManager.mockResolvedValue(null);

      const existingRecord = new FossQrActivation();
      existingRecord.activationId = 'act-revoked';
      existingRecord.redeemedAt = null;
      existingRecord.revokedAt = new Date('2026-10-31T15:55:00.000Z');
      existingRecord.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      qrActivationRepo.findByTokenHash.mockResolvedValue(existingRecord);

      await expect(
        service.redeemActivationCredential(rawToken),
      ).rejects.toThrow(/replaced or revoked/i);
    });

    it('rejects completely unknown tokens', async () => {
      qrActivationRepo.atomicRedeemWithManager.mockResolvedValue(null);
      qrActivationRepo.findByTokenHash.mockResolvedValue(null);

      await expect(
        service.redeemActivationCredential('unknown-random-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws BadRequestException if rawToken is empty or non-string', async () => {
      await expect(
        service.redeemActivationCredential('' as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.redeemActivationCredential(null as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('issueActivationCredential edge cases', () => {
    it('throws BadRequestException when both bookingId and bookingReference are UUIDs but differ', async () => {
      await expect(
        service.issueActivationCredential({
          bookingId: '550e8400-e29b-41d4-a716-446655440000',
          bookingReference: '550e8400-e29b-41d4-a716-446655440099',
          roomNumber: '101',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when bookingId alone is not a valid UUID format', async () => {
      await expect(
        service.issueActivationCredential({
          bookingId: 'invalid-non-uuid-reference',
          roomNumber: '101',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when bookingReference alone is not a valid UUID format', async () => {
      await expect(
        service.issueActivationCredential({
          bookingReference: 'invalid-non-uuid-reference',
          roomNumber: '101',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when roomNumber is missing or whitespace', async () => {
      await expect(
        service.issueActivationCredential({
          bookingId: '550e8400-e29b-41d4-a716-446655440000',
          roomNumber: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('constructor initialization & transaction edge cases', () => {
    it('supports 5th argument as clock function when dataSource is omitted', () => {
      const fixedTime = new Date('2026-10-31T16:00:00.000Z');
      const customService = new QrActivationService(
        qrActivationRepo as any,
        sessionRepo as any,
        bookingVerificationService as any,
        configService as any,
        (() => fixedTime) as any,
      );
      expect(customService).toBeDefined();
    });

    it('defaults clock to system time when no clock is provided', () => {
      const customService = new QrActivationService(
        qrActivationRepo as any,
        sessionRepo as any,
        bookingVerificationService as any,
        configService as any,
        mockDataSource as any,
        undefined,
      );
      expect(customService).toBeDefined();
    });

    it('throws UnauthorizedException when concurrent redemption causes atomicRedeemWithManager to return null', async () => {
      const rawToken = 'race-token';
      const tokenHash = service.hashToken(rawToken);

      const existingActivation = new FossQrActivation();
      existingActivation.activationId = 'act-race';
      existingActivation.bookingId = '550e8400-e29b-41d4-a716-446655440000';
      existingActivation.roomNumber = '101';
      existingActivation.tokenHash = tokenHash;
      existingActivation.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      existingActivation.redeemedAt = null;

      qrActivationRepo.findByTokenHash.mockResolvedValue(existingActivation);
      qrActivationRepo.atomicRedeemWithManager.mockResolvedValue(null);
      bookingVerificationService.verifyStay.mockResolvedValueOnce({
        valid: true,
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        roomNumber: '101',
        status: 'CHECKED_IN',
        stayStart: '2026-10-31T10:00:00.000Z',
        stayEnd: '2026-11-01T10:00:00.000Z',
      });

      await expect(
        service.redeemActivationCredential(rawToken),
      ).rejects.toThrow(/already been redeemed/i);
    });

    it('updates existing session when redeeming activation credential for a known booking', async () => {
      const rawToken = 'existing-session-token';
      const tokenHash = service.hashToken(rawToken);

      const existingActivation = new FossQrActivation();
      existingActivation.activationId = 'act-existing';
      existingActivation.bookingId = '550e8400-e29b-41d4-a716-446655440000';
      existingActivation.roomNumber = '101';
      existingActivation.tokenHash = tokenHash;
      existingActivation.expiresAt = new Date('2026-10-31T16:15:00.000Z');
      existingActivation.redeemedAt = null;

      qrActivationRepo.findByTokenHash.mockResolvedValue(existingActivation);
      qrActivationRepo.atomicRedeemWithManager.mockResolvedValue({
        ...existingActivation,
        redeemedAt: fixedNow,
      } as FossQrActivation);
      bookingVerificationService.verifyStay.mockResolvedValueOnce({
        valid: true,
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        roomNumber: '101',
        status: 'CHECKED_IN',
        stayStart: '2026-10-31T10:00:00.000Z',
        stayEnd: '2026-11-01T10:00:00.000Z',
      });

      const existingSession = new FossSession();
      existingSession.sessionId = 'sess-old-uuid';
      existingSession.bookingId = '550e8400-e29b-41d4-a716-446655440000';
      existingSession.roomNumber = '101';
      existingSession.isActive = false;

      mockManager.findOne.mockResolvedValueOnce(existingSession);

      const result = await service.redeemActivationCredential(rawToken);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe('sess-old-uuid');
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-old-uuid',
          isActive: true,
        }),
      );
    });
  });

  describe('revokeBookingActivations', () => {
    it('returns 0 without database query when bookingId is empty', async () => {
      const count = await service.revokeBookingActivations('');
      expect(count).toBe(0);
      expect(
        qrActivationRepo.revokeUnredeemedByBookingId,
      ).not.toHaveBeenCalled();
    });

    it('revokes unredeemed activations for the specified booking', async () => {
      qrActivationRepo.revokeUnredeemedByBookingId.mockResolvedValue(3);

      const count = await service.revokeBookingActivations('b-101');

      expect(count).toBe(3);
      expect(qrActivationRepo.revokeUnredeemedByBookingId).toHaveBeenCalledWith(
        'b-101',
        fixedNow,
      );
    });

    it('accepts identical bookingId and bookingReference when both are valid matching UUIDs', async () => {
      const matchUuid = '550e8400-e29b-41d4-a716-446655440000';
      bookingVerificationService.verifyStay.mockResolvedValueOnce({
        valid: true,
        bookingId: matchUuid,
        roomNumber: '101',
        status: 'CHECKED_IN',
        stayStart: '2026-10-31T10:00:00.000Z',
        stayEnd: '2026-11-01T10:00:00.000Z',
      });

      const res = await service.issueActivationCredential({
        bookingId: matchUuid,
        bookingReference: matchUuid,
        roomNumber: '101',
      });

      expect(res).toBeDefined();
      expect(res.activationUrl).toContain('token=');
    });

    it('initializes with fallback configuration when environment variables are omitted', () => {
      const customConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'FOSS_FRONTEND_URL') return 'http://foss-frontend.local';
          return undefined;
        }),
      };

      const fallbackService1 = new QrActivationService(
        qrActivationRepo as any,
        sessionRepo as any,
        bookingVerificationService as any,
        customConfigService as any,
        undefined,
        () => new Date(),
      );
      expect((fallbackService1 as any).frontendBaseUrl).toBe('http://foss-frontend.local');

      const customConfigService2 = {
        get: jest.fn((key: string) => {
          if (key === 'APP_BASE_URL') return 'http://app-base.local/';
          return undefined;
        }),
      };

      const fallbackService2 = new QrActivationService(
        qrActivationRepo as any,
        sessionRepo as any,
        bookingVerificationService as any,
        customConfigService2 as any,
        undefined,
        () => new Date(),
      );
      expect((fallbackService2 as any).frontendBaseUrl).toBe('http://app-base.local');

      const customConfigService3 = {
        get: jest.fn(() => undefined),
      };

      const fallbackService3 = new QrActivationService(
        qrActivationRepo as any,
        sessionRepo as any,
        bookingVerificationService as any,
        customConfigService3 as any,
      );
      expect((fallbackService3 as any).frontendBaseUrl).toBe('http://localhost:3000');
    });
  });
});
