import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealPeriod } from '../../../integrations/internal-services/kms/dto/kms-menu.dto.js';

export class GuestMenuItemDto {
  @ApiProperty({ example: 'menu-item-001' })
  id!: string;

  @ApiProperty({ example: 'Truffle Mushroom Arancini' })
  name!: string;

  @ApiPropertyOptional({
    example: 'Crispy risotto spheres with black truffle core',
  })
  description!: string | null;

  @ApiProperty({ example: 18.0, description: 'Price in USD' })
  price!: number;

  @ApiProperty({ example: 'Starters' })
  category!: string;

  @ApiProperty({
    enum: MealPeriod,
    isArray: true,
    example: [MealPeriod.LUNCH, MealPeriod.DINNER],
  })
  mealPeriods!: MealPeriod[];

  @ApiProperty({ example: true, description: 'Kitchen stock availability' })
  available!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether item can currently be ordered',
  })
  isOrderable!: boolean;

  @ApiProperty({
    example: false,
    description: 'True if ordering window cutoff has passed',
  })
  isCutoff!: boolean;

  @ApiProperty({
    example: 3600,
    description: 'Seconds remaining before window cutoff',
  })
  secondsRemainingUntilCutoff!: number;

  @ApiProperty({
    example: 15,
    description: 'Estimated preparation time in minutes',
  })
  estimatedPrepMinutes!: number;

  @ApiPropertyOptional({
    example: 'https://cdn.foreverhotel.com/menu/arancini.webp',
  })
  imageUrl!: string | null;

  @ApiProperty({ example: ['VEGETARIAN'], isArray: true })
  dietaryFlags!: string[];

  @ApiProperty({ example: ['Dairy', 'Gluten'], isArray: true })
  allergens!: string[];
}
