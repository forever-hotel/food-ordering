import { ApiProperty } from '@nestjs/swagger';
import { FossRealtimeEvent } from './realtime-event.dto.js';

export class PollEventsResponseDto {
  @ApiProperty({
    type: [FossRealtimeEvent],
    description: 'Buffered events since requested version/timestamp',
  })
  events!: FossRealtimeEvent<unknown>[];

  @ApiProperty({
    description: 'Server-authoritative timestamp in ISO-8601',
    example: '2026-10-28T08:00:00.000Z',
  })
  serverTimestamp!: string;

  @ApiProperty({
    description: 'Latest monotonic event version available for this stay',
    example: 3,
  })
  latestVersion!: number;

  @ApiProperty({
    description:
      'Recommended client polling interval in milliseconds (3000ms - 5000ms)',
    example: 3000,
  })
  recommendedPollIntervalMs!: number;
}
