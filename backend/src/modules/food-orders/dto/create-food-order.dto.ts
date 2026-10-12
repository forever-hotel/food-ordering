import { CreateFoodOrderItemDto } from './create-food-order-item.dto.js';

export class CreateFoodOrderDto {
  items!: CreateFoodOrderItemDto[];
  allergyNote?: string;
}
