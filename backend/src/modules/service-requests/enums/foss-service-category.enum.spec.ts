import { FossServiceCategory } from './foss-service-category.enum.js';

describe('FossServiceCategory', () => {
  it('contains the 6 approved FOSS service request categories matching PostgreSQL schema', () => {
    expect(Object.values(FossServiceCategory)).toEqual([
      'ROOM_CLEANING',
      'EXTRA_TOWELS',
      'WATER_BOTTLES',
      'MAINTENANCE',
      'LAUNDRY_PICKUP',
      'OTHER',
    ]);
  });
});
