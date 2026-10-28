import { ApiProperty } from '@nestjs/swagger';

export class VerifyQrDto {
  @ApiProperty({
    description:
      'Cryptographically signed QR token string (<base64url_payload>.<signature>)',
    example: 'eyJib29raW5nSWQiOiJiMTAx... .xyz123signature',
  })
  qrToken!: string;
}
