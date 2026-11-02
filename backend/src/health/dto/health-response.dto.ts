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

export class DatabaseIsolationDto {
  @ApiProperty({
    description:
      'Whether the active database is confirmed as an approved isolated disposable test database',
    example: false,
  })
  isDisposableTestDb!: boolean;

  @ApiProperty({
    description:
      'Whether the active database targets a shared cloud environment (e.g. Neon dev/prod)',
    example: true,
  })
  isCloudShared!: boolean;

  @ApiProperty({
    description:
      'Sanitized database target (hostname and database name, no credentials)',
    example:
      'ep-long-fog-azwbvdgr-pooler.c-3.ap-southeast-1.aws.neon.tech/forever',
  })
  sanitizedTarget!: string;

  @ApiProperty({
    description: 'Explicit isolation environment classification',
    example: 'shared_cloud_dev',
  })
  classification!:
    'disposable_test' | 'shared_cloud_dev' | 'production' | 'unknown';
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

  @ApiProperty({
    description:
      'Trustworthy database isolation metadata for integration test safety gate',
    required: false,
    type: DatabaseIsolationDto,
  })
  isolation?: DatabaseIsolationDto;
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
