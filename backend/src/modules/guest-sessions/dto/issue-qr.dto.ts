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
  @IsOptional()
  @IsUUID('4', { message: 'bookingId must be a valid UUID v4' })
  bookingId?: string;

  /**
   * Optional FDS gateway alias for bookingId (UUID v4) or booking reference string.
   */
  @IsOptional()
  @IsString({ message: 'bookingReference must be a string' })
  bookingReference?: string;

  /**
   * Room number assigned to the booking during check-in.
   */
  @IsString()
  @IsNotEmpty({ message: 'roomNumber is required' })
  @Matches(/^[A-Za-z0-9-]{1,10}$/, {
    message: 'roomNumber must be alphanumeric and up to 10 characters',
  })
  roomNumber!: string;

  /**
   * Expected checkout date from FDS stay contract (ISO string or YYYY-MM-DD).
   */
  @IsOptional()
  @IsString()
  checkOutDate?: string;

  /**
   * Optional audit identity of issuing staff member or service (e.g. FDS_CHECK_IN).
   */
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
