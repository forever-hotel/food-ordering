import { describe, expect, it } from '@jest/globals';
import { kitchenIdempotencyKey } from './kms-idempotency.js';

describe('KMS idempotency contract', () => {
  const key = 'idemp-d0652c4a-607a-48f9-b12b-e052b198409f';
  it('maps the browser key to a stable UUID accepted by KMS', () => {
    const result = kitchenIdempotencyKey('booking-a', key);
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(kitchenIdempotencyKey('booking-a', key)).toBe(result);
    expect(kitchenIdempotencyKey('booking-b', key)).not.toBe(result);
    expect(kitchenIdempotencyKey('booking-a', key + '-new')).not.toBe(result);
  });
  it('preserves previously supported UUID keys', () => {
    const uuid = 'D0652C4A-607A-48F9-B12B-E052B198409F';
    expect(kitchenIdempotencyKey('booking-a', uuid)).toBe(uuid.toLowerCase());
  });
});
