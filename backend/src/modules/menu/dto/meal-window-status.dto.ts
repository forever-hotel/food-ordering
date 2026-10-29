import { ApiProperty } from '@nestjs/swagger';
import { MealPeriod } from '../../../integrations/internal-services/kms/dto/kms-menu.dto.js';

export class MealWindowStatusDto {
  @ApiProperty({ enum: MealPeriod, example: MealPeriod.BREAKFAST })
  period!: MealPeriod;

  @ApiProperty({ example: 'Breakfast' })
  name!: string;

  @ApiProperty({ example: '06:30:00' })
  startTime!: string;

  @ApiProperty({ example: '10:30:00' })
  cutoffTime!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: false })
  isCutoffReached!: boolean;

  @ApiProperty({
    example: 3600,
    description: 'Seconds remaining before cutoff',
  })
  secondsRemaining!: number;
}
