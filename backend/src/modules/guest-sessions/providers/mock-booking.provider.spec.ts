import { MockBookingProvider } from './mock-booking.provider.js';

describe('MockBookingProvider', () => {
  let provider: MockBookingProvider;

  beforeEach(() => {
    provider = new MockBookingProvider();
  });

  it('returns the checked-in mock booking', async () => {
    const booking = await provider.findById(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(booking).toMatchObject({
      roomNumber: '101',
      status: 'CHECKED_IN',
    });
  });

  it('returns null for an unknown booking', async () => {
    await expect(
      provider.findById('99999999-9999-4999-8999-999999999999'),
    ).resolves.toBeNull();
  });

  it('does not allow mutation of mock records', async () => {
    const bookingId = '11111111-1111-4111-8111-111111111111';

    const booking = await provider.findById(bookingId);

    expect(booking).not.toBeNull();

    if (!booking) {
      return;
    }

    booking.roomNumber = '999';
    booking.checkOutDate.setFullYear(2050);

    const original = await provider.findById(bookingId);

    expect(original?.roomNumber).toBe('101');
    expect(original?.checkOutDate.getUTCFullYear()).toBe(2027);
  });
});
