import { createHash } from 'node:crypto';

/** Preserve accepted UUIDs; map opaque FOSS keys to stable, stay-scoped UUIDs. */
export function kitchenIdempotencyKey(bookingId: string, key: string): string {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  ) {
    return key.toLowerCase();
  }
  const bytes = createHash('sha256')
    .update(JSON.stringify(['foss:kitchen-order:v1', bookingId, key]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
