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
});
