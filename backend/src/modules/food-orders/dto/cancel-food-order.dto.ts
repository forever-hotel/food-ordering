import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelFoodOrderDto {
  @ApiPropertyOptional({
    example: 'Changed mind, need to order different meal',
    maxLength: 200,
    description: 'Optional guest cancellation reason',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200, {
    message: 'Cancellation reason cannot exceed 200 characters.',
  })
  reason?: string;
}
