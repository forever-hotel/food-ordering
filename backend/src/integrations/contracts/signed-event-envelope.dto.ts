import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ContractVersion } from './contract-version.enum.js';

export class SignedEventEnvelope<T = any> {
  @ApiProperty({
    description: 'Unique event identifier',
    example: 'd3b07384-d113-4623-8ffb-88a8d116a570',
  })
  @IsUUID()
  @IsNotEmpty()
  eventId!: string;

  @ApiProperty({
    description: 'Event type name',
    example: 'kms.order.status_changed',
  })
  @IsString()
  @IsNotEmpty()
  eventType!: string;

  @ApiProperty({
    description: 'Contract version',
    example: '1.0',
    enum: ContractVersion,
  })
  @IsString()
  @IsNotEmpty()
  version!: string;

  @ApiProperty({
    description: 'Authoritative originating service',
    example: 'kms.service',
  })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty({
    description: 'ISO-8601 event timestamp',
    example: '2026-10-28T12:00:00.000Z',
  })
  @IsString()
  @IsNotEmpty()
  timestamp!: string;

  @ApiProperty({
    description:
      'HMAC-SHA256 signature for message non-repudiation and integrity',
  })
  @IsString()
  @IsNotEmpty()
  signature!: string;

  @ApiProperty({ description: 'Typed event payload' })
  @IsNotEmpty()
  payload!: T;
}
