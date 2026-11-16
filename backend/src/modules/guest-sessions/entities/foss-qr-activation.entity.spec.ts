import { FossQrActivation } from './foss-qr-activation.entity.js';

describe('FossQrActivation Entity', () => {
  it('instantiates correctly with valid properties', () => {
    const activation = new FossQrActivation();
    activation.activationId = 'act-1234-5678';
    activation.bookingId = 'b1010000-0000-4000-8000-000000000101';
    activation.roomNumber = '101';
    activation.tokenHash =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    activation.expiresAt = new Date('2026-10-31T17:00:00Z');
    activation.redeemedAt = null;
    activation.revokedAt = null;
    activation.createdAt = new Date('2026-10-31T16:45:00Z');
    activation.issuedBy = 'FDS_CHECK_IN';

    expect(activation.activationId).toBe('act-1234-5678');
    expect(activation.bookingId).toBe('b1010000-0000-4000-8000-000000000101');
    expect(activation.roomNumber).toBe('101');
    expect(activation.tokenHash).toHaveLength(64);
    expect(activation.redeemedAt).toBeNull();
    expect(activation.revokedAt).toBeNull();
    expect(activation.issuedBy).toBe('FDS_CHECK_IN');
  });
});
