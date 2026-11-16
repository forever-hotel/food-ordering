/**
 * Canonical stay status from authoritative Front Desk / Booking subsystem (FDS/HW).
 * FOSS only allows active guest operations when the status is CHECKED_IN.
 */
export enum BookingStatus {
  CHECKED_IN = 'CHECKED_IN',
  RESERVED = 'RESERVED',
  CHECKED_OUT = 'CHECKED_OUT',
  CANCELLED = 'CANCELLED',
}
