import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PollEventsQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter for events with monotonic version strictly greater than this value',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sinceVersion must be an integer' })
  @Min(0, { message: 'sinceVersion cannot be negative' })
  sinceVersion?: number;

  @ApiPropertyOptional({
    description:
      'Filter for events occurred strictly after this ISO-8601 timestamp',
    example: '2026-10-28T08:00:00.000Z',
  })
  @IsOptional()
  @IsString({ message: 'sinceTimestamp must be a valid ISO string' })
  sinceTimestamp?: string;
}
