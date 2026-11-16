import { describe, expect, it } from '@jest/globals';
import { ComplaintCategory } from './complaint-category.enum.js';

describe('ComplaintCategory', () => {
  it('contains all valid complaint categories', () => {
    expect(Object.values(ComplaintCategory)).toEqual([
      'NOISE',
      'CLEANLINESS',
      'SERVICE',
      'FOOD',
      'AMENITY',
      'OTHER',
    ]);
  });
});
