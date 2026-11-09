import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class IssueQrDto {
  /**
   * Authoritative FDS booking identifier (UUID v4).
   * Either bookingId or bookingReference must be supplied.
   */
  @ApiPropertyOptional({ example: 'b1010000-0000-4000-8000-000000000101' })
  @IsOptional()
  @IsUUID('4', { message: 'bookingId must be a valid UUID v4' })
  bookingId?: string;

  /**
   * Optional FDS gateway alias for bookingId (UUID v4) or booking reference string.
   */
  @ApiPropertyOptional({ example: 'b1010000-0000-4000-8000-000000000101' })
  @IsOptional()
  @IsString({ message: 'bookingReference must be a string' })
  bookingReference?: string;

  /**
   * Room number assigned to the booking during check-in.
   */
  @ApiProperty({ example: '101' })
  @IsString()
  @IsNotEmpty({ message: 'roomNumber is required' })
  @Matches(/^[A-Za-z0-9-]{1,10}$/, {
    message: 'roomNumber must be alphanumeric and up to 10 characters',
  })
  roomNumber!: string;

  /**
   * Legacy checkout date hint from FDS stay contract (optional, deprecated).
   * Authoritative stayEnd verified from FDS booking service takes precedence.
   */
  @ApiPropertyOptional({ example: '2026-11-02T11:00:00.000Z' })
  @IsOptional()
  @IsString()
  checkOutDate?: string;

  /**
   * Optional authoritative stay expiry timestamp hint (ISO-8601).
   * Authoritative stayEnd verified from FDS booking service takes precedence.
   */
  @ApiPropertyOptional({ example: '2026-11-02T11:00:00.000Z' })
  @IsOptional()
  @IsString()
  stayExpiresAt?: string;

  /**
   * Optional audit identity of issuing staff member or service (e.g. FDS_CHECK_IN).
   */
  @ApiPropertyOptional({ example: 'FDS_CHECK_IN' })
  @IsOptional()
  @IsString()
  issuedBy?: string;
}

export interface IssueQrResponseDto {
  status: 'ACTIVATED';
  sessionReference: string;
  activationUrl: string;
  qrToken: string;
  expiresAt: string;
  validUntilDate: string;
}
