import { BookingStatus } from '../enums/booking-status.enum.js';
import { BookingVerificationResultDto } from '../dto/booking-verification-result.dto.js';
import {
  FdsCheckoutEventDto,
  FdsRoomReassignEventDto,
} from '../../../../modules/guest-sessions/dto/fds-events.dto.js';

export const FDS_FIXTURE_CHECKOUT_EVENT_VALID: FdsCheckoutEventDto = {
  eventId: 'evt-fds-checkout-001',
  eventType: 'fds.guest.checkout',
  bookingId: 'booking-101',
  roomNumber: '101',
  checkoutTime: '2026-10-28T12:00:00.000Z',
};

export const FDS_FIXTURE_ROOM_REASSIGN_EVENT_VALID: FdsRoomReassignEventDto = {
  eventId: 'evt-fds-reassign-001',
  eventType: 'fds.room.reassigned',
  bookingId: 'booking-101',
  previousRoomNumber: '101',
  newRoomNumber: '205',
  reassignedAt: '2026-10-28T12:30:00.000Z',
  reason: 'Upgraded to ocean view suite',
};

export const FDS_FIXTURE_VERIFIED_BOOKING: BookingVerificationResultDto = {
  valid: true,
  bookingId: 'booking-101',
  roomNumber: '101',
  guestName: 'Jane Doe',
  status: BookingStatus.CHECKED_IN,
  stayStart: '2026-10-27T14:00:00.000Z',
  stayEnd: '2026-10-29T11:00:00.000Z',
  verifiedAt: '2026-10-28T12:00:00.000Z',
};

/**
 * Legacy v1 checkout event
 */
export const FDS_FIXTURE_LEGACY_V1_CHECKOUT = {
  eventId: 'evt-legacy-001',
  eventType: 'fds.guest.checkout',
  bookingId: 'booking-101',
  roomNumber: '101',
  checkoutTime: '2026-10-28T10:00:00.000Z',
};

/**
 * Additive checkout event with folio details
 */
export const FDS_FIXTURE_ADDITIVE_CHECKOUT = {
  ...FDS_FIXTURE_CHECKOUT_EVENT_VALID,
  eventId: 'evt-additive-001',
  folioSettled: true,
  outstandingBalance: 0.0,
  frontDeskAgent: 'Agent John M.',
};

export const FDS_FIXTURE_MALFORMED_EVENT = {
  eventId: '',
  eventType: 'invalid.unknown.event',
  bookingId: null,
};
