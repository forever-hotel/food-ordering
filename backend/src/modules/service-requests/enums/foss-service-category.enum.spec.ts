import {
  ActiveFossServiceCategory,
  FossServiceCategory,
} from './foss-service-category.enum.js';

describe('FossServiceCategory', () => {
  it('contains the 7 persisted FOSS service request categories in PostgreSQL schema', () => {
    expect(Object.values(FossServiceCategory)).toEqual([
      'ROOM_CLEANING',
      'EXTRA_TOWELS',
      'WATER_BOTTLES',
      'TOILETRIES',
      'MAINTENANCE',
      'LAUNDRY_PICKUP',
      'OTHER',
    ]);
  });

  it('defines exactly the 6 active guest-facing service categories', () => {
    expect(Object.values(ActiveFossServiceCategory)).toEqual([
      'ROOM_CLEANING',
      'EXTRA_TOWELS',
      'TOILETRIES',
      'MAINTENANCE',
      'LAUNDRY_PICKUP',
      'OTHER',
    ]);
    expect(Object.values(ActiveFossServiceCategory)).not.toContain(
      'WATER_BOTTLES',
    );
  });
});
