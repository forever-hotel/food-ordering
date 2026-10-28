import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponseDto {
  @ApiProperty({
    description: 'System health status',
    example: 'ok',
  })
  status!: string;

  @ApiProperty({
    description: 'Process uptime in seconds',
    example: 42.15,
  })
  uptime!: number;

  @ApiProperty({
    description: 'Current timestamp (ISO 8601)',
    example: '2026-10-28T15:25:00.000Z',
  })
  timestamp!: string;
}

export class DatabaseHealthDto {
  @ApiProperty({
    description: 'Database connection status',
    example: 'up',
  })
  status!: 'up' | 'down';

  @ApiProperty({
    description: 'Database dialect',
    example: 'postgres',
  })
  type!: string;

  @ApiProperty({
    description: 'Error message if connection failed',
    required: false,
    example: null,
  })
  error?: string | null;
}

export class ReadinessResponseDto {
  @ApiProperty({
    description: 'Overall system readiness status',
    example: 'ok',
  })
  status!: 'ok' | 'error';

  @ApiProperty({
    description: 'Process uptime in seconds',
    example: 42.15,
  })
  uptime!: number;

  @ApiProperty({
    description: 'Current timestamp (ISO 8601)',
    example: '2026-10-28T15:25:00.000Z',
  })
  timestamp!: string;

  @ApiProperty({
    description: 'Database component health',
    type: DatabaseHealthDto,
  })
  database!: DatabaseHealthDto;
}
