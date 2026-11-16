import { FoodOrderStatus } from './food-order-status.enum.js';

describe('FoodOrderStatus', () => {
  it('contains the supported order states', () => {
    expect(Object.values(FoodOrderStatus)).toEqual([
      'PLACED',
      'IN_PREPARATION',
      'READY',
      'DELIVERED',
      'CANCELLED',
    ]);
  });
});
