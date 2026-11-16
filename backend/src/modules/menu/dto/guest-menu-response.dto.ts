import { ApiProperty } from '@nestjs/swagger';
import { MealPeriod } from '../../../integrations/internal-services/kms/dto/kms-menu.dto.js';
import { GuestMenuItemDto } from './guest-menu-item.dto.js';
import { MealWindowStatusDto } from './meal-window-status.dto.js';

export class GuestMenuResponseDto {
  @ApiProperty({
    example: '2026-10-28 12:30:00',
    description: 'Current hotel local time in Asia/Colombo',
  })
  currentTimeInColombo!: string;

  @ApiProperty({
    enum: MealPeriod,
    isArray: true,
    example: [MealPeriod.LUNCH, MealPeriod.ALL_DAY],
  })
  activeMealPeriods!: MealPeriod[];

  @ApiProperty({
    example: ['Starters', 'Mains', 'Desserts', 'Beverages'],
    isArray: true,
  })
  categories!: string[];

  @ApiProperty({ type: [MealWindowStatusDto] })
  mealWindows!: MealWindowStatusDto[];

  @ApiProperty({ type: [GuestMenuItemDto] })
  items!: GuestMenuItemDto[];

  @ApiProperty({ example: 6 })
  totalItems!: number;

  @ApiProperty({ example: '1.0' })
  version!: string;
}
