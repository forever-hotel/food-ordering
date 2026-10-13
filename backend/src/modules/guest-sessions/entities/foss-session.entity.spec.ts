import { getMetadataArgsStorage } from 'typeorm';

import { FossSession } from './foss-session.entity.js';

describe('FossSession entity', () => {
  it('maps to foss_sessions', () => {
    const table = getMetadataArgsStorage().tables.find(
      ({ target }) => target === FossSession,
    );

    expect(table?.name).toBe('foss_sessions');
  });

  it('maps the approved columns', () => {
    const columns = getMetadataArgsStorage()
      .columns.filter(({ target }) => target === FossSession)
      .map(({ options }) => options.name);

    expect(columns).toEqual(
      expect.arrayContaining([
        'session_id',
        'booking_id',
        'room_number',
        'session_token',
        'is_active',
        'created_at',
        'updated_at',
        'expires_at',
      ]),
    );
  });
});
