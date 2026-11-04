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
    example: false,
  })
  isCloudShared!: boolean;

  @ApiProperty({
    description: 'Explicit isolation environment classification',
    example: 'dedicated_neon_test',
  })
  classification!:
    | 'dedicated_neon_test'
    | 'disposable_local_test'
    | 'neon_parent_dev'
    | 'shared_cloud_dev'
    | 'production'
    | 'unknown';

  @ApiProperty({
    description:
      'Whether the active database branch matches the server-configured approved test branch allowlist',
    example: true,
  })
  isApprovedTestBranch!: boolean;
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

export class MessagingHealthDto {
  @ApiProperty({
    description: 'Messaging broker status',
    example: 'up',
  })
  status!: 'up' | 'down' | 'disabled';

  @ApiProperty({
    description: 'Whether connection to broker is established',
    example: true,
  })
  connected!: boolean;
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

  @ApiProperty({
    description: 'RabbitMQ messaging component health',
    type: MessagingHealthDto,
    required: false,
  })
  messaging?: MessagingHealthDto;
}
