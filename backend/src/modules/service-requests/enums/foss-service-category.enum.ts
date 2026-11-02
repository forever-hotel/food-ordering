/**
 * Persisted service request categories in PostgreSQL `service_request_category` enum.
 * Supports 7 values including legacy WATER_BOTTLES for historical stay queries.
 */
export enum FossServiceCategory {
  ROOM_CLEANING = 'ROOM_CLEANING',
  EXTRA_TOWELS = 'EXTRA_TOWELS',
  WATER_BOTTLES = 'WATER_BOTTLES', // Legacy history only
  TOILETRIES = 'TOILETRIES',
  MAINTENANCE = 'MAINTENANCE',
  LAUNDRY_PICKUP = 'LAUNDRY_PICKUP',
  OTHER = 'OTHER',
}

/**
 * Exactly six active guest-facing service categories in FOSS per DDP-131 and Issue #101.
 * WATER_BOTTLES is legacy-only and must not be offered or accepted for new requests.
 */
export enum ActiveFossServiceCategory {
  ROOM_CLEANING = 'ROOM_CLEANING',
  EXTRA_TOWELS = 'EXTRA_TOWELS',
  TOILETRIES = 'TOILETRIES',
  MAINTENANCE = 'MAINTENANCE',
  LAUNDRY_PICKUP = 'LAUNDRY_PICKUP',
  OTHER = 'OTHER',
}

