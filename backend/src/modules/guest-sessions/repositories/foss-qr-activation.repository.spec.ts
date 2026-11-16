import { jest } from '@jest/globals';
import { Repository } from 'typeorm';
import { FossQrActivation } from '../entities/foss-qr-activation.entity.js';
import { FossQrActivationRepository } from './foss-qr-activation.repository.js';

describe('FossQrActivationRepository', () => {
  let repository: FossQrActivationRepository;
  let mockTypeOrmRepo: {
    findOne: jest.MockedFunction<
      (opts: any) => Promise<FossQrActivation | null>
    >;
    save: jest.MockedFunction<
      (entity: FossQrActivation) => Promise<FossQrActivation>
    >;
    query: jest.MockedFunction<(sql: string, params?: any[]) => Promise<any>>;
    createQueryBuilder: jest.MockedFunction<any>;
  };

  beforeEach(() => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      query: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    repository = new FossQrActivationRepository(
      mockTypeOrmRepo as unknown as Repository<FossQrActivation>,
    );
  });

  it('finds activation by activationId', async () => {
    const mockActivation = new FossQrActivation();
    mockActivation.activationId = 'act-1';
    mockTypeOrmRepo.findOne.mockResolvedValue(mockActivation);

    const result = await repository.findById('act-1');
    expect(result).toBe(mockActivation);
    expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
      where: { activationId: 'act-1' },
    });
  });

  it('finds activation by tokenHash', async () => {
    const mockActivation = new FossQrActivation();
    mockActivation.tokenHash = 'hash-1';
    mockTypeOrmRepo.findOne.mockResolvedValue(mockActivation);

    const result = await repository.findByTokenHash('hash-1');
    expect(result).toBe(mockActivation);
    expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
      where: { tokenHash: 'hash-1' },
    });
  });

  it('executes atomic redemption successfully when conditional update matches', async () => {
    const now = new Date('2026-10-31T16:00:00Z');
    mockTypeOrmRepo.query.mockResolvedValue([
      {
        activationId: 'act-1',
        bookingId: 'b-101',
        roomNumber: '101',
        tokenHash: 'hash-1',
        expiresAt: '2026-10-31T16:15:00Z',
        redeemedAt: '2026-10-31T16:00:00Z',
        revokedAt: null,
        createdAt: '2026-10-31T15:55:00Z',
        issuedBy: 'FDS_CHECK_IN',
      },
    ]);

    const result = await repository.atomicRedeem('hash-1', now);
    expect(result).not.toBeNull();
    expect(result?.activationId).toBe('act-1');
    expect(result?.redeemedAt).toEqual(now);
  });

  it('returns null on atomic redemption when update does not match (already redeemed or expired)', async () => {
    mockTypeOrmRepo.query.mockResolvedValue([]);

    const result = await repository.atomicRedeem(
      'hash-already-used',
      new Date(),
    );
    expect(result).toBeNull();
  });

  it('executes atomicRedeemWithManager using the provided EntityManager', async () => {
    const now = new Date('2026-10-31T16:00:00Z');
    const mockManager: any = {
      query: jest.fn<any>().mockResolvedValue([
        {
          activationId: 'act-mgr-1',
          bookingId: 'b-202',
          roomNumber: '202',
          tokenHash: 'hash-202',
          expiresAt: '2026-10-31T16:15:00Z',
          redeemedAt: '2026-10-31T16:00:00Z',
          revokedAt: null,
          createdAt: '2026-10-31T15:55:00Z',
          issuedBy: 'FDS_CHECK_IN',
        },
      ]),
    };

    const result = await repository.atomicRedeemWithManager(
      mockManager,
      'hash-202',
      now,
    );

    expect(result).not.toBeNull();
    expect(result?.activationId).toBe('act-mgr-1');
    expect(mockManager.query).toHaveBeenCalledTimes(1);
    expect(mockTypeOrmRepo.query).not.toHaveBeenCalled();
  });

  it('finds pending activations by booking ID', async () => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ activationId: 'act-1' }]),
    };
    mockTypeOrmRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await repository.findPendingByBookingId('b-101');
    expect(result).toHaveLength(1);
    expect(qb.where).toHaveBeenCalledWith('qa.booking_id = :bookingId', {
      bookingId: 'b-101',
    });
  });

  it('saves activation entity', async () => {
    const entity = new FossQrActivation();
    mockTypeOrmRepo.save.mockResolvedValue(entity);

    const result = await repository.save(entity);
    expect(result).toBe(entity);
    expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(entity);
  });

  it('revokes unredeemed activations by booking ID', async () => {
    const qb: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    mockTypeOrmRepo.createQueryBuilder.mockReturnValue(qb);

    const affected = await repository.revokeUnredeemedByBookingId('b-101');
    expect(affected).toBe(2);
  });

  it('returns 0 if revokeUnredeemedByBookingId affected is undefined', async () => {
    const qb: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };
    mockTypeOrmRepo.createQueryBuilder.mockReturnValue(qb);

    const affected = await repository.revokeUnredeemedByBookingId('b-101');
    expect(affected).toBe(0);
  });

  it('handles snake_case raw row mapping with revoked_at present in atomicRedeem', async () => {
    const now = new Date('2026-10-31T16:00:00Z');
    mockTypeOrmRepo.query.mockResolvedValue([
      [
        {
          activation_id: 'act-nested-1',
          booking_id: 'b-101',
          room_number: '101',
          token_hash: 'hash-nested-1',
          expires_at: '2026-10-31T16:15:00Z',
          redeemed_at: '2026-10-31T16:00:00Z',
          revoked_at: '2026-10-31T15:59:00Z',
          created_at: '2026-10-31T15:55:00Z',
          issued_by: 'FDS_CHECK_IN',
        },
      ],
    ]);

    const result = await repository.atomicRedeem('hash-nested-1', now);
    expect(result).not.toBeNull();
    expect(result?.activationId).toBe('act-nested-1');
    expect(result?.revokedAt).toBeInstanceOf(Date);
  });

  it('returns null if query returns array with empty or falsy row', async () => {
    mockTypeOrmRepo.query.mockResolvedValue([null]);
    const result = await repository.atomicRedeem('hash-empty', new Date());
    expect(result).toBeNull();
  });
});
