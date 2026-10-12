import { jest } from '@jest/globals';
import { Repository } from 'typeorm';

import { FossSession } from '../entities/foss-session.entity.js';
import { FossSessionRepository } from './foss-session.repository.js';

describe('FossSessionRepository', () => {
  let repository: FossSessionRepository;

  let typeOrmRepository: {
    findOne: jest.MockedFunction<Repository<FossSession>['findOne']>;
    save: jest.MockedFunction<
      (session: FossSession) => Promise<FossSession>
    >;
  };

  beforeEach(() => {
    typeOrmRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (session: FossSession): Promise<FossSession> => session),
    };

    repository = new FossSessionRepository(
      typeOrmRepository as unknown as Repository<FossSession>,
    );
  });

  it('finds a session by ID', async () => {
    typeOrmRepository.findOne.mockResolvedValue(null);

    await repository.findById('session-id');

    expect(typeOrmRepository.findOne).toHaveBeenCalledWith({
      where: { sessionId: 'session-id' },
    });
  });

  it('finds a session by booking ID', async () => {
    typeOrmRepository.findOne.mockResolvedValue(null);

    await repository.findByBookingId('booking-id');

    expect(typeOrmRepository.findOne).toHaveBeenCalledWith({
      where: { bookingId: 'booking-id' },
    });
  });

  it('queries only active sessions by token', async () => {
    typeOrmRepository.findOne.mockResolvedValue(null);

    await repository.findActiveBySessionToken('session-token');

    expect(typeOrmRepository.findOne).toHaveBeenCalledWith({
      where: {
        sessionToken: 'session-token',
        isActive: true,
      },
    });
  });

  it('saves a session', async () => {
    const session = new FossSession();

    await expect(repository.save(session)).resolves.toBe(session);

    expect(typeOrmRepository.save).toHaveBeenCalledWith(session);
  });
});
