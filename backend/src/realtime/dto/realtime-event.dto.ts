import { ApiProperty } from '@nestjs/swagger';
import { RealtimeEventType } from '../enums/realtime-event-type.enum.js';

export class FossRealtimeEvent<T = unknown> {
  @ApiProperty({
    description: 'Unique event identifier (UUID v4)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  eventId!: string;

  @ApiProperty({
    enum: RealtimeEventType,
    description: 'Categorized real-time event type',
    example: RealtimeEventType.FOOD_ORDER_STATUS_UPDATED,
  })
  eventType!: RealtimeEventType;

  @ApiProperty({
    description: 'Room number the event is scoped to',
    example: '101',
  })
  roomNumber!: string;

  @ApiProperty({
    description: 'Booking ID the event is scoped to',
    example: 'booking-uuid-101',
  })
  bookingId!: string;

  @ApiProperty({
    description:
      'Sequential monotonic version number for ordering and gap detection',
    example: 1,
  })
  version!: number;

  @ApiProperty({
    description: 'Server-authoritative timestamp in ISO-8601',
    example: '2026-10-28T08:00:00.000Z',
  })
  serverTimestamp!: string;

  @ApiProperty({
    description: 'Payload data specific to the event type',
  })
  data!: T;
}
